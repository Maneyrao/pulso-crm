import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createPrismaClient, type PulsoPrismaClient } from './client.js';

/**
 * Aislamiento de base para tests de integración (ADR-023).
 *
 * Cada archivo de test corre en su propio esquema de PostgreSQL, contra la base
 * real. No hay mocks de Prisma: un mock no habría detectado ninguno de los
 * constraints que este proyecto usa como garantía principal (uniques parciales,
 * EXCLUDE de solapamiento, triggers append-only).
 *
 * El esquema se construye corriendo la cadena de migraciones. Es más lento que
 * clonar un template, pero garantiza que lo que se prueba es exactamente lo que
 * las migraciones producen en producción.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_PACKAGE_ROOT = path.resolve(HERE, '..');

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

function urlForSchema(schema: string): string {
  const u = new URL(baseUrl());
  u.searchParams.set('schema', schema);
  return u.toString();
}

export interface TestDatabase {
  /** Cliente CON aislamiento de tenant. Es el que usa la aplicación. */
  prisma: PulsoPrismaClient;
  /** Cliente SIN aislamiento. Sólo para armar fixtures de varios gimnasios. */
  raw: PrismaClient;
  schema: string;
  /** Fija el gymId que verá la extensión en las llamadas siguientes. */
  setTenant(gymId: string | null): void;
  /** Corre una función con un tenant activo y restaura el anterior al salir. */
  asTenant<T>(gymId: string, fn: () => Promise<T>): Promise<T>;
  truncate(): Promise<void>;
  destroy(): Promise<void>;
}

let counter = 0;

export async function createTestDatabase(label = 'test'): Promise<TestDatabase> {
  const safeLabel = label.replace(/[^a-z0-9_]/gi, '_').slice(0, 20).toLowerCase();
  const schema = `t_${safeLabel}_${process.pid}_${counter++}`;
  const url = urlForSchema(schema);

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: DB_PACKAGE_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  let currentTenant: string | null = null;

  const prisma = createPrismaClient({
    resolveGymId: () => currentTenant,
    datasourceUrl: url,
  });
  const raw = new PrismaClient({ datasourceUrl: url });

  return {
    prisma,
    raw,
    schema,
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
      const rows = await raw.$queryRawUnsafe<{ tablename: string }[]>(
        `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> '_prisma_migrations'`,
        schema,
      );
      if (rows.length === 0) return;
      const list = rows.map((r) => `"${schema}"."${r.tablename}"`).join(', ');
      // Los triggers append-only bloquean DELETE pero no TRUNCATE, que es
      // justamente lo que hace falta para limpiar entre tests.
      await raw.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    },
    async destroy() {
      await prisma.$disconnect();
      await raw.$disconnect();
      const cleanup = new PrismaClient({ datasourceUrl: urlForSchema('public') });
      try {
        await cleanup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
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
