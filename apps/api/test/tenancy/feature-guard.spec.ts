import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/**
 * FeatureGuard (ADR-022, T-2.8) — antes de este fix round no había NINGÚN
 * test que lo ejerciera de verdad: ningún endpoint declaraba
 * `@RequiresFeature`, así que `feature.guard.ts` era código muerto detrás de
 * un guard global registrado pero nunca alcanzado. `POST /branches` ahora
 * exige `multi_branch` (ver branch.controller.ts) — el punto de integración
 * que ya documentaba `packages/contracts/src/features.ts` ("Complementa, no
 * reemplaza, SaasPlan.maxBranches").
 *
 * Corre en su propio archivo (su propio gimnasio y `SaasPlan`) porque muta
 * `SaasPlan.features` — otros archivos que comparten el código de plan
 * 'test-plan' asumen que `multi_branch` está habilitada por defecto (ver
 * harness.ts `seedGymWithUsers`).
 */

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;
let redis: Redis;

const FEATURES_WITHOUT_MULTI_BRANCH = [
  'members',
  'catalog',
  'cash',
  'access',
  'messaging',
  'reports',
];
const FEATURES_WITH_MULTI_BRANCH = [...FEATURES_WITHOUT_MULTI_BRANCH, 'multi_branch'];

beforeAll(async () => {
  ctx = await createTestApp('feature-guard');
  gym = await seedGymWithUsers(ctx.db, { slug: 'feature-guard-gym' });
  redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379');

  await ctx.db.raw.saasPlan.update({
    where: { id: gym.gym.saasPlanId },
    data: { features: FEATURES_WITHOUT_MULTI_BRANCH },
  });
}, 180_000);

afterAll(async () => {
  await redis.quit();
  await ctx?.close();
});

async function loginAs(role: keyof typeof gym.users): Promise<TestClient> {
  const c = new TestClient(ctx.baseUrl);
  const res = await c.post('/api/v1/auth/login', {
    email: gym.users[role]!.email,
    password: gym.password,
  });
  expect(res.status).toBe(200);
  return c;
}

const cacheKey = () => `feature:multi_branch:${gym.gym.id}`;

describe('FeatureGuard — multi_branch en POST /branches', () => {
  it('feature deshabilitada en el plan → 403 FEATURE_NOT_ENABLED', async () => {
    await redis.del(cacheKey());
    const owner = await loginAs('OWNER');

    const res = await owner.post('/api/v1/branches', {
      name: 'Sede Bloqueada Por Plan',
      timezone: 'America/Argentina/Buenos_Aires',
    });

    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('FEATURE_NOT_ENABLED');
  });

  it('el resultado (deshabilitada) queda cacheado en Redis bajo feature:<key>:<gymId>', async () => {
    const cached = await redis.get(cacheKey());
    expect(cached).toBe('0');
  });

  it('habilitar la feature en la base NO alcanza mientras el caché siga vigente (lee el caché, no vuelve a pegarle a la base)', async () => {
    await ctx.db.raw.saasPlan.update({
      where: { id: gym.gym.saasPlanId },
      data: { features: FEATURES_WITH_MULTI_BRANCH },
    });
    const owner = await loginAs('OWNER');

    // El caché todavía dice "0" (no se tocó Redis, sólo la base): el guard
    // no debería volver a consultar la base todavía.
    const res = await owner.post('/api/v1/branches', {
      name: 'Sede Todavía Bloqueada',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('FEATURE_NOT_ENABLED');
  });

  it('invalidar el caché (equivalente a que venza el TTL) hace que el guard vuelva a consultar la base y ahora deje pasar', async () => {
    // Simula la invalidación por evento que ADR-022 pide para cuando cambia
    // el plan — no existe todavía un endpoint que edite planes/overrides en
    // este alcance (ver feature.guard.ts `invalidate()`), así que se borra
    // la clave directamente, como haría ese endpoint futuro.
    await redis.del(cacheKey());
    const owner = await loginAs('OWNER');

    const res = await owner.post('/api/v1/branches', {
      name: 'Sede Ahora Permitida',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect(res.status).toBe(201);

    const cachedAfter = await redis.get(cacheKey());
    expect(cachedAfter).toBe('1');
  });
});
