import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers } from '../harness.js';
import { discoverRoutes, type DiscoveredRoute } from './route-discovery.js';
import { NON_TENANT_ALLOWLIST, RESOURCE_FIXTURES } from './resource-fixtures.js';

/**
 * Suite de cross-tenant generada del registro de rutas (T-2.8,
 * TEST_STRATEGY §4.1, MASTER_IMPLEMENTATION_PLAN T-2.8).
 *
 * NO HAY una lista de endpoints escrita a mano acá: `discoverRoutes()`
 * recorre el `ModulesContainer` de la app YA INICIALIZADA y arma la lista
 * sola (mismo mecanismo que usa `@nestjs/swagger` para generar specs). Un
 * controller nuevo aparece automáticamente; si no está cubierto por un
 * fixture o por la allowlist de `resource-fixtures.ts`, el test de
 * "cobertura" de más abajo hace fallar el archivo.
 *
 * ESTA SUITE NUNCA SE DESACTIVA (T-2.8, "Riesgos y Rollback": "Esta suite no
 * se desactiva nunca"). Si un test acá falla, se arregla el código o el
 * fixture — nunca se skipea para hacer pasar el pipeline (TEST_STRATEGY §0).
 *
 * Nota técnica: los `describe`/`it` de Vitest se registran de forma
 * SÍNCRONA en la fase de colección, antes de que corra ningún `beforeAll`.
 * Como las rutas recién existen después de `app.init()`, el arranque de la
 * app y el descubrimiento de rutas se hacen acá arriba con top-level
 * `await` (Vitest evalúa el archivo como módulo ESM y lo espera antes de
 * coleccionar los tests) — no dentro de un `beforeAll`, que llegaría tarde.
 */

const ctx = await createTestApp('cross-tenant');
const gymA = await seedGymWithUsers(ctx.db, { slug: 'cross-a' });
const gymB = await seedGymWithUsers(ctx.db, { slug: 'cross-b' });

const clientA = new TestClient(ctx.baseUrl);
await clientA.post('/api/v1/auth/login', {
  email: gymA.users['OWNER']!.email,
  password: gymA.password,
});

const clientB = new TestClient(ctx.baseUrl);
await clientB.post('/api/v1/auth/login', {
  email: gymB.users['OWNER']!.email,
  password: gymB.password,
});

const routes = discoverRoutes(ctx.app);

afterAll(async () => {
  await ctx.close();
});

// ── helpers ──────────────────────────────────────────────────────────────

function send(client: TestClient, method: string, url: string, body?: unknown) {
  switch (method) {
    case 'GET':
      return client.get(url);
    case 'POST':
      return client.post(url, body);
    case 'PATCH':
      return client.patch(url, body);
    case 'DELETE':
      return client.del(url);
    default:
      throw new Error(`Método no soportado en la suite: ${method}`);
  }
}

/** Un body válido y mínimo para no chocar con la validación Zod antes de llegar al service. */
function bodyFor(route: DiscoveredRoute): Record<string, unknown> | undefined {
  // Todos los `updateXRequestSchema` de tenancy/iam/cash-config son `.partial()`
  // (verificado en packages/contracts y en los schemas locales de cash):
  // un body vacío pasa la validación y llega hasta la búsqueda por id.
  if (route.method === 'PATCH') return {};
  return undefined;
}

function resourceKeyOf(route: DiscoveredRoute): string | undefined {
  const withoutPrefix = route.path.replace(/^\/api\/v1\/?/, '');
  const candidates = Object.keys(RESOURCE_FIXTURES).sort((a, b) => b.length - a.length);
  return candidates.find((key) => withoutPrefix === key || withoutPrefix.startsWith(`${key}/`));
}

/** `requestId` cambia por request: se excluye antes de comparar shapes. */
function stripVolatile(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const { requestId: _requestId, ...rest } = body as Record<string, unknown>;
  return rest;
}

const protectedRoutes = routes.filter((r) => !r.isPublic && !r.isAgentOnly);

// ── 1. Descubrimiento y cobertura ───────────────────────────────────────

describe('auto-descubrimiento de rutas', () => {
  it('encuentra al menos las rutas de tenancy e iam registradas en T-2.6', () => {
    const paths = routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toEqual(expect.arrayContaining(['GET /api/v1/branches', 'GET /api/v1/users']));
  });

  it('reporta cuántas rutas se descubrieron automáticamente', () => {
    // Informativo, no linteado (apps/api/test/** queda fuera de `eslint src`,
    // ver apps/api/package.json "lint"). Sirve para el reporte de T-2.8: "la
    // suite enumera N rutas y las prueba todas".
    // eslint-disable-next-line no-console
    console.log(
      `[cross-tenant] ${routes.length} rutas descubiertas totales; ` +
        `${protectedRoutes.length} protegidas (tenant-scoped candidatas); ` +
        `${routes.length - protectedRoutes.length} públicas/agente (fuera de alcance por diseño); ` +
        `${idRoutes.length} con :id (leídas/mutadas por id); ` +
        `${listRoutes.length} listados sin :id.`,
    );
    expect(routes.length).toBeGreaterThan(0);
  });

  it('toda ruta protegida pertenece a un recurso con fixture o está en la allowlist explícita', () => {
    const uncovered = protectedRoutes.filter((r) => {
      if (NON_TENANT_ALLOWLIST[r.controllerName]) return false;
      return resourceKeyOf(r) === undefined;
    });
    // Si esto falla: un endpoint nuevo no está cubierto. Se arregla
    // agregando su fixture a resource-fixtures.ts, o su controller a
    // NON_TENANT_ALLOWLIST con el motivo — nunca borrando este test.
    expect(uncovered.map((r) => `${r.method} ${r.path} (${r.controllerName})`)).toEqual([]);
  });
});

// ── 2. Cross-tenant read/write por :id (mismo recurso, dos gimnasios) ────

const idRoutes = protectedRoutes.filter((r) => /:[a-zA-Z]+/.test(r.path));

describe('cross-tenant: acceder o mutar un recurso de otro gimnasio', () => {
  for (const route of idRoutes) {
    const key = resourceKeyOf(route);
    const fixture = key ? RESOURCE_FIXTURES[key] : undefined;
    const label = `${route.method} ${route.path}`;

    if (!fixture) {
      it.skip(`${label} — sin fixture (cubierto por la allowlist, no por un recurso)`, () => undefined);
      continue;
    }

    it(`${label} — un id de otro gimnasio responde 404, idéntico a uno inexistente`, async () => {
      const foreignId = await fixture.createId(ctx.db.raw, gymA.gym.id, gymA.branch.id);
      const body = bodyFor(route);

      const urlForForeign = route.path.replace(/:[a-zA-Z]+/g, foreignId);
      const urlForMissing = route.path.replace(/:[a-zA-Z]+/g, randomUUID());

      const foreignRes = await send(clientB, route.method, urlForForeign, body);
      const missingRes = await send(clientB, route.method, urlForMissing, body);

      // Criterio de aceptación #2: "no existe" y "es de otro tenant" son
      // exactamente la misma respuesta — no se puede distinguir una de otra.
      expect(foreignRes.status).toBe(404);
      expect(missingRes.status).toBe(404);
      expect(stripVolatile(foreignRes.body)).toEqual(stripVolatile(missingRes.body));

      // Y el propio dueño sí puede: descarta que el 404 sea un bug (fixture
      // rota, ruta mal armada) en vez de aislamiento real.
      const ownRes = await send(clientA, route.method, urlForForeign, body);
      expect(ownRes.status).not.toBe(404);
    });
  }
});

// ── 3. Listados: ninguno devuelve filas de otro gymId ──────────────────

const listRoutes = protectedRoutes.filter((r) => r.method === 'GET' && !/:[a-zA-Z]+/.test(r.path));

describe('cross-tenant: los listados nunca incluyen filas de otro gimnasio', () => {
  for (const route of listRoutes) {
    const key = resourceKeyOf(route);
    const fixture = key ? RESOURCE_FIXTURES[key] : undefined;
    const label = `${route.method} ${route.path}`;

    if (!fixture) {
      it.skip(`${label} — sin fixture (cubierto por la allowlist)`, () => undefined);
      continue;
    }

    it(`${label} — no incluye un recurso creado en otro gimnasio`, async () => {
      const foreignId = await fixture.createId(ctx.db.raw, gymA.gym.id, gymA.branch.id);
      const res = await clientB.get(route.path);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(foreignId);
    });
  }
});

// ── 4. branchId de otro gimnasio en el body → 404 (API_CONTRACTS §1.3) ──

describe('cross-tenant: un branchId de otro gimnasio en el body responde 404', () => {
  it('PATCH /users/:id con branchIds de otro gimnasio', async () => {
    const ownerB = gymB.users['OWNER']!;
    const res = await clientB.patch(`/api/v1/users/${ownerB.id}`, {
      branchIds: [gymA.branch.id],
    });
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });
});

// ── 5. allowlist de prisma.unscoped() (packages/db/src/tenant-extension.ts) ─

describe('allowlist de prisma.unscoped()', () => {
  /**
   * Únicos usos declarados hoy. Un uso nuevo que no se agregue acá hace
   * fallar este test — es la contraparte, del lado del código fuente, de la
   * cobertura de rutas de arriba.
   */
  const ALLOWED_CALL_SITES = ['common/auth/auth.guard.ts', 'modules/auth/auth.service.ts'];

  it('sólo los archivos declarados llaman a prisma.unscoped()', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const srcRoot = path.resolve(here, '../../src');
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue;
        const content = readFileSync(full, 'utf8');
        if (!content.includes('.unscoped(')) continue;

        const relative = path.relative(srcRoot, full).split(path.sep).join('/');
        if (!ALLOWED_CALL_SITES.includes(relative)) offenders.push(relative);
      }
    };
    walk(srcRoot);

    expect(offenders).toEqual([]);
  });
});
