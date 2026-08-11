import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/** CRUD de roles (T-2.6, API_CONTRACTS §5): clonar en vez de editar los roles de sistema. */

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('iam-roles');
  gym = await seedGymWithUsers(ctx.db, { slug: 'iam-roles-gym' });
}, 180_000);

afterAll(async () => {
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

describe('GET /roles', () => {
  it('lista los 4 roles de sistema sembrados', async () => {
    const owner = await loginAs('OWNER');
    const res = await owner.get('/api/v1/roles');
    expect(res.status).toBe(200);
    const body = res.body as { data: { code: string; isSystem: boolean }[] };
    const codes = body.data.map((r) => r.code).sort();
    expect(codes).toEqual(['INSTRUCTOR', 'MANAGER', 'OWNER', 'RECEPTIONIST']);
    expect(body.data.every((r) => r.isSystem)).toBe(true);
  });
});

describe('POST /roles — clonar en vez de editar', () => {
  it('crea un rol nuevo, siempre isSystem: false', async () => {
    const owner = await loginAs('OWNER');
    const res = await owner.post('/api/v1/roles', {
      code: 'RECEPTIONIST_SENIOR',
      name: 'Recepción Senior',
      permissions: ['member:read', 'member:write', 'cash:read'],
    });
    expect(res.status).toBe(201);
    expect((res.body as { isSystem: boolean }).isSystem).toBe(false);
  });

  it('rechaza un código duplicado en el mismo gimnasio (409)', async () => {
    const owner = await loginAs('OWNER');
    await owner.post('/api/v1/roles', {
      code: 'DUPLICADO',
      name: 'Uno',
      permissions: ['member:read'],
    });
    const dup = await owner.post('/api/v1/roles', {
      code: 'DUPLICADO',
      name: 'Dos',
      permissions: ['member:read'],
    });
    expect(dup.status).toBe(409);
  });
});

describe('PATCH /roles/:id — los roles de sistema no se editan', () => {
  it('409 al intentar editar un rol de sistema', async () => {
    const owner = await loginAs('OWNER');
    const roles = await owner.get('/api/v1/roles');
    const receptionist = (roles.body as { data: { id: string; code: string }[] }).data.find(
      (r) => r.code === 'RECEPTIONIST',
    )!;

    const res = await owner.patch(`/api/v1/roles/${receptionist.id}`, { name: 'Recepción hackeada' });
    expect(res.status).toBe(409);
  });

  it('sí se puede editar un rol clonado (no de sistema)', async () => {
    const owner = await loginAs('OWNER');
    const created = await owner.post('/api/v1/roles', {
      code: 'EDITABLE',
      name: 'Editable',
      permissions: ['member:read'],
    });
    const id = (created.body as { id: string }).id;

    const updated = await owner.patch(`/api/v1/roles/${id}`, { name: 'Editado' });
    expect(updated.status).toBe(200);
    expect((updated.body as { name: string }).name).toBe('Editado');
  });
});
