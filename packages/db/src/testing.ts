import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient, type PulsoPrismaClient } from './client.js';

/**
 * Aislamiento de base para tests de integración (ADR-023).
 *
 * Cada archivo de test corre en su propia BASE de PostgreSQL (no sólo un
 * esquema), clonada de un molde ya migrado. No hay mocks de Prisma: un mock no
 * habría detectado ninguno de los constraints que este proyecto usa como
 * garantía principal (uniques parciales, EXCLUDE de solapamiento, triggers
 * append-only).
 *
 * Por qué base y no esquema: las extensiones (`citext`, `pgcrypto`,
 * `btree_gist`, `pg_trgm`) son objetos de BASE, con nombre único por base de
 * datos — no se pueden instalar dos veces en la misma base aunque apunten a
 * esquemas distintos. Con aislamiento por esquema (`?schema=` de Prisma, que
 * fija el `search_path` a *sólo* ese esquema, sin `public`), el primer archivo
 * de test que corre "gana" la extensión y todos los demás fallan con `type
 * "citext" does not exist`. Clonar la base entera con `CREATE DATABASE ...
 * TEMPLATE` evita el problema de raíz (cada clon trae sus propias extensiones)
 * y de paso es el diseño que ya describe TEST_STRATEGY.md §2: migrar una vez,
 * clonar por archivo.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_PACKAGE_ROOT = path.resolve(HERE, '..');

/** Base molde: migrada una sola vez por corrida (memoizado por proceso). */
const TEMPLATE_DB = 'pulso_test_template';
/** Clave arbitraria y estable para el advisory lock que serializa el molde entre procesos. */
const TEMPLATE_LOCK_KEY = 727_274;

function baseUrl(): string {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    throw new Error(
      'Falta TEST_DATABASE_URL. Los tests de integración corren contra PostgreSQL real ' +
        '(ADR-023). Levantá los servicios con `pnpm dev:services`.',
    );
  }
  return url;
}

/** URL de administración: mismo servidor que `TEST_DATABASE_URL`, apuntando a otra base. */
function urlForDatabase(name: string): string {
  const u = new URL(baseUrl());
  u.pathname = `/${name}`;
  u.searchParams.delete('schema');
  return u.toString();
}

/** URL de la base de test "de administración" (la que ya existe por configuración). */
function adminUrl(): string {
  const u = new URL(baseUrl());
  u.searchParams.delete('schema');
  return u.toString();
}

let templateReady: Promise<void> | null = null;

/**
 * Migra `pulso_test_template` si hace falta. Memoizado por proceso; entre
 * procesos (vitest con `pool: 'forks'` corre cada archivo en uno propio) se
 * serializa con un advisory lock de Postgres, que es visible en todo el
 * cluster y no sólo en la sesión que lo toma.
 */
async function ensureTemplate(): Promise<void> {
  templateReady ??= (async () => {
    const admin = new PrismaClient({ datasourceUrl: adminUrl() });
    try {
      await admin.$executeRaw`SELECT pg_advisory_lock(${TEMPLATE_LOCK_KEY})`;
      const rows = await admin.$queryRaw<{ exists: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${TEMPLATE_DB}) AS exists
      `;
      if (!rows[0]?.exists) {
        // CREATE DATABASE no admite parámetros: el nombre es una constante de
        // este módulo, no input externo.
        // eslint-disable-next-line no-restricted-syntax -- ver comentario arriba
        await admin.$executeRawUnsafe(`CREATE DATABASE "${TEMPLATE_DB}"`);
      }
      execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
        cwd: DB_PACKAGE_ROOT,
        env: { ...process.env, DATABASE_URL: urlForDatabase(TEMPLATE_DB) },
        stdio: 'pipe',
      });
    } finally {
      await admin.$executeRaw`SELECT pg_advisory_unlock(${TEMPLATE_LOCK_KEY})`.catch(
        () => undefined,
      );
      await admin.$disconnect();
    }
  })();
  return templateReady;
}

export interface TestDatabase {
  /**
   * Cliente CON aislamiento de tenant, pero resuelto por `setTenant`/`asTenant`
   * (una variable local del harness), NO por el `AsyncLocalStorage` real de la
   * app (`TenantContextStore`). Sirve para tests que manipulan Prisma
   * directamente (`integrity.spec.ts`, helpers de `cash/__tests__`), fuera de
   * un request HTTP. Un test que arranca la app real (`apps/api/test/harness.ts`)
   * y le pega por HTTP necesita el suyo propio, armado con `url` y
   * `resolveGymId: () => TenantContextStore.getGymId()` — por eso NO es este
   * mismo cliente el que usa `PrismaService` en esos tests.
   */
  prisma: PulsoPrismaClient;
  /** Cliente SIN aislamiento. Sólo para armar fixtures de varios gimnasios. */
  raw: PrismaClient;
  /** Nombre de la base clonada para este archivo de test (no un esquema). */
  schema: string;
  /** Connection string de esta base clonada — para que otro paquete arme su propio cliente. */
  url: string;
  /** Fija el gymId que verá la extensión en las llamadas siguientes. */
  setTenant(gymId: string | null): void;
  /** Corre una función con un tenant activo y restaura el anterior al salir. */
  asTenant<T>(gymId: string, fn: () => Promise<T>): Promise<T>;
  truncate(): Promise<void>;
  destroy(): Promise<void>;
}

let counter = 0;

export async function createTestDatabase(label = 'test'): Promise<TestDatabase> {
  await ensureTemplate();

  const safeLabel = label
    .replace(/[^a-z0-9_]/gi, '_')
    .slice(0, 20)
    .toLowerCase();
  const dbName = `t_${safeLabel}_${process.pid}_${counter++}`;
  const url = urlForDatabase(dbName);

  const admin = new PrismaClient({ datasourceUrl: adminUrl() });
  try {
    // Ídem: `dbName` sale saneado a [a-z0-9_] arriba, nunca de input externo;
    // CREATE DATABASE no admite bind params.
    // eslint-disable-next-line no-restricted-syntax -- ver comentario arriba
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}" TEMPLATE "${TEMPLATE_DB}"`);
  } finally {
    await admin.$disconnect();
  }

  let currentTenant: string | null = null;

  const prisma = createPrismaClient({
    resolveGymId: () => currentTenant,
    datasourceUrl: url,
  });
  const raw = new PrismaClient({ datasourceUrl: url });

  return {
    prisma,
    raw,
    schema: dbName,
    url,
    setTenant(gymId) {
      currentTenant = gymId;
    },
    async asTenant(gymId, fn) {
      const previous = currentTenant;
      currentTenant = gymId;
      try {
        return await fn();
      } finally {
        currentTenant = previous;
      }
    },
    async truncate() {
      const rows = await raw.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      `;
      if (rows.length === 0) return;
      const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
      // Los triggers append-only bloquean DELETE pero no TRUNCATE, que es
      // justamente lo que hace falta para limpiar entre tests. `r.tablename`
      // sale del catálogo pg_tables de esta misma base generada por el
      // harness, no de input externo.
      // eslint-disable-next-line no-restricted-syntax -- ver comentario arriba
      await raw.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    },
    async destroy() {
      await prisma.$disconnect();
      await raw.$disconnect();
      const cleanup = new PrismaClient({ datasourceUrl: adminUrl() });
      try {
        // WITH (FORCE) (PG13+) desconecta sesiones colgadas en vez de fallar
        // el DROP; `dbName` es el mismo valor saneado de arriba.
        // eslint-disable-next-line no-restricted-syntax -- ver comentario arriba
        await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      } finally {
        await cleanup.$disconnect();
      }
    },
  };
}

/** Datos mínimos para tener un gimnasio operable en un test. */
export async function seedMinimalGym(
  raw: PrismaClient,
  opts: { slug: string; name?: string; planCode?: string },
) {
  const plan = await raw.saasPlan.upsert({
    where: { code: opts.planCode ?? 'test' },
    update: {},
    create: {
      code: opts.planCode ?? 'test',
      name: 'Plan de prueba',
      maxBranches: 10,
      maxMembers: 10_000,
      maxUsers: 50,
      features: ['members', 'cash', 'access', 'messaging', 'reports'],
      monthlyPrice: '0',
    },
  });

  const gym = await raw.gym.create({
    data: { slug: opts.slug, name: opts.name ?? opts.slug, saasPlanId: plan.id },
  });

  const branch = await raw.branch.create({
    data: { gymId: gym.id, name: 'Sede Central' },
  });

  await raw.memberCounter.create({ data: { gymId: gym.id, last: 0 } });

  return { plan, gym, branch };
}
