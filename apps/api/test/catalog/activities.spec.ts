import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/**
 * CRUD de actividades (M4, API_CONTRACTS §7).
 *
 * El aislamiento cross-tenant lo cubre `cross-tenant-suite.spec.ts` (T-2.8,
 * fixtures `activities` en `resource-fixtures.ts`); acá se prueban las
 * reglas de negocio y la matriz de permisos: unicidad `(gymId, name)`, que
 * el mismo nombre viva sin conflicto en otro gimnasio, que un id ajeno en
 * PATCH responda 404, y que RECEPTIONIST no pueda escribir en el catálogo.
 */

let ctx: TestApp;
let gymA: Awaited<ReturnType<typeof seedGymWithUsers>>;
let gymB: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('catalog-activities');
  gymA = await seedGymWithUsers(ctx.db, { slug: 'activities-a' });
  gymB = await seedGymWithUsers(ctx.db, { slug: 'activities-b' });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

async function loginAs(
  gym: Awaited<ReturnType<typeof seedGymWithUsers>>,
  role: keyof typeof gym.users,
): Promise<TestClient> {
  const c = new TestClient(ctx.baseUrl);
  const res = await c.post('/api/v1/auth/login', {
    email: gym.users[role]!.email,
    password: gym.password,
  });
  expect(res.status).toBe(200);
  return c;
}

describe('POST /activities', () => {
  it('OWNER crea una actividad y responde con el shape del contrato', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const res = await owner.post('/api/v1/activities', {
      name: 'Musculación',
      description: 'Sala de pesas',
      color: '#ff0000',
    });
    expect(res.status).toBe(201);
    const body = res.body as {
      id: string;
      gymId: string;
      name: string;
      description: string | null;
      color: string | null;
      isActive: boolean;
    };
    expect(body.name).toBe('Musculación');
    expect(body.description).toBe('Sala de pesas');
    expect(body.color).toBe('#ff0000');
    expect(body.isActive).toBe(true);
    expect(body.gymId).toBe(gymA.gym.id);
  });

  it('rechaza un nombre duplicado en el mismo gimnasio (409)', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    await owner.post('/api/v1/activities', { name: 'Spinning' });
    const dup = await owner.post('/api/v1/activities', { name: 'Spinning' });
    expect(dup.status).toBe(409);
    expect((dup.body as { code: string }).code).toBe('CONFLICT');
  });

  it('el mismo nombre en OTRO gimnasio no conflictúa (unique es compuesto con gymId)', async () => {
    const ownerA = await loginAs(gymA, 'OWNER');
    const ownerB = await loginAs(gymB, 'OWNER');
    const a = await ownerA.post('/api/v1/activities', { name: 'Crossfit' });
    const b = await ownerB.post('/api/v1/activities', { name: 'Crossfit' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((a.body as { gymId: string }).gymId).not.toBe((b.body as { gymId: string }).gymId);
  });

  it('RECEPTIONIST no puede crear actividades (plan:write) — 403', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const res = await receptionist.post('/api/v1/activities', { name: 'Yoga' });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('MISSING_PERMISSION');
  });

  it('RECEPTIONIST sí puede leer (plan:read)', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const res = await receptionist.get('/api/v1/activities');
    expect(res.status).toBe(200);
    expect(Array.isArray((res.body as { data: unknown[] }).data)).toBe(true);
  });
});

describe('PATCH /activities/:id', () => {
  it('edita nombre y descripción; toggle de isActive', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const created = await owner.post('/api/v1/activities', {
      name: 'Funcional Original',
    });
    const id = (created.body as { id: string }).id;

    const renamed = await owner.patch(`/api/v1/activities/${id}`, {
      name: 'Funcional Renombrado',
      description: 'con banda',
    });
    expect(renamed.status).toBe(200);
    const body = renamed.body as { name: string; description: string | null; isActive: boolean };
    expect(body.name).toBe('Funcional Renombrado');
    expect(body.description).toBe('con banda');
    expect(body.isActive).toBe(true);

    // Toggle: desactivar y reactivar
    const off = await owner.patch(`/api/v1/activities/${id}`, { isActive: false });
    expect((off.body as { isActive: boolean }).isActive).toBe(false);
    const on = await owner.patch(`/api/v1/activities/${id}`, { isActive: true });
    expect((on.body as { isActive: boolean }).isActive).toBe(true);
  });

  it('id de OTRO gimnasio responde 404 y no muta la fila ajena', async () => {
    const ownerA = await loginAs(gymA, 'OWNER');
    const createdA = await ownerA.post('/api/v1/activities', { name: 'Ajena' });
    const foreignId = (createdA.body as { id: string }).id;
    const before = await ctx.db.raw.activity.findUnique({ where: { id: foreignId } });

    const ownerB = await loginAs(gymB, 'OWNER');
    const res = await ownerB.patch(`/api/v1/activities/${foreignId}`, {
      name: 'Modificado por ajeno',
    });
    expect(res.status).toBe(404);

    const after = await ctx.db.raw.activity.findUnique({ where: { id: foreignId } });
    expect(after?.name).toBe(before?.name);
  });

  it('RECEPTIONIST no puede editar (plan:write) — 403', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const created = await owner.post('/api/v1/activities', { name: 'Solo lectura' });
    const id = (created.body as { id: string }).id;

    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const res = await receptionist.patch(`/api/v1/activities/${id}`, { name: 'No debería' });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('MISSING_PERMISSION');
  });
});
