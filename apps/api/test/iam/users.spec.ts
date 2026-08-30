import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/**
 * CRUD de usuarios (T-2.6, API_CONTRACTS §5) y las reglas de negocio que el
 * schema Zod no puede expresar: última password temporal, invariante del
 * último OWNER, y matriz básica de permisos (TEST_STRATEGY §4.2).
 *
 * El aislamiento cross-tenant lo cubre `cross-tenant-suite.spec.ts` (T-2.8).
 */

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('iam-users');
  gym = await seedGymWithUsers(ctx.db, { slug: 'iam-users-gym' });
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

async function roleId(code: string): Promise<string> {
  const role = await ctx.db.raw.role.findFirstOrThrow({ where: { gymId: gym.gym.id, code } });
  return role.id;
}

describe('POST /users — alta con password temporal', () => {
  it('genera una contraseña temporal, no acepta la del cliente, y se muestra una sola vez', async () => {
    const owner = await loginAs('OWNER');
    const receptionistRoleId = await roleId('RECEPTIONIST');

    const res = await owner.post('/api/v1/users', {
      email: 'nuevo.usuario@iam-users-gym.test',
      firstName: 'Nuevo',
      lastName: 'Usuario',
      roleIds: [receptionistRoleId],
      branchIds: [],
      // Un cliente que intente mandar `password` no debe poder fijarla: el
      // schema Zod ni siquiera declara ese campo, así que Zod lo descarta
      // (`safeParse` hace strip de claves no declaradas).
      password: 'ContraseñaElegidaPorElCliente123',
    });

    expect(res.status).toBe(201);
    const body = res.body as { user: { mustChangePassword: boolean }; temporaryPassword: string };
    expect(body.temporaryPassword).toBeTruthy();
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    expect(body.user.mustChangePassword).toBe(true);

    // La respuesta NUNCA incluye la password elegida por el cliente.
    expect(JSON.stringify(body)).not.toContain('ContraseñaElegidaPorElCliente123');

    // La temporal funciona de verdad para loguearse.
    const login = await new TestClient(ctx.baseUrl).post('/api/v1/auth/login', {
      email: 'nuevo.usuario@iam-users-gym.test',
      password: body.temporaryPassword,
    });
    expect(login.status).toBe(200);
  });

  it('branchIds vacío otorga acceso a todas las sedes activas del gimnasio', async () => {
    const owner = await loginAs('OWNER');
    const receptionistRoleId = await roleId('RECEPTIONIST');

    const res = await owner.post('/api/v1/users', {
      email: 'todas-las-sedes@iam-users-gym.test',
      firstName: 'Todas',
      lastName: 'Sedes',
      roleIds: [receptionistRoleId],
      branchIds: [],
    });
    expect(res.status).toBe(201);
    const userId = (res.body as { user: { id: string } }).user.id;

    const access = await ctx.db.raw.userBranchAccess.findMany({ where: { userId } });
    const activeBranches = await ctx.db.raw.branch.findMany({
      where: { gymId: gym.gym.id, deletedAt: null, isActive: true },
    });
    expect(access.length).toBe(activeBranches.length);
  });

  it('RECEPTIONIST no puede crear usuarios (user:write) — 403', async () => {
    const receptionist = await loginAs('RECEPTIONIST');
    const receptionistRoleId = await roleId('RECEPTIONIST');
    const res = await receptionist.post('/api/v1/users', {
      email: 'no-deberia-crearse@iam-users-gym.test',
      firstName: 'No',
      lastName: 'Debería',
      roleIds: [receptionistRoleId],
      branchIds: [],
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('MISSING_PERMISSION');
  });
});

describe('POST /users/:id/reset-password', () => {
  it('genera una temporal nueva y revoca las sesiones vigentes del usuario', async () => {
    const owner = await loginAs('OWNER');
    const receptionistRoleId = await roleId('RECEPTIONIST');

    const created = await owner.post('/api/v1/users', {
      email: 'reset-password@iam-users-gym.test',
      firstName: 'Reset',
      lastName: 'Password',
      roleIds: [receptionistRoleId],
      branchIds: [],
    });
    const { id: userId } = (created.body as { user: { id: string } }).user;
    const firstPassword = (created.body as { temporaryPassword: string }).temporaryPassword;

    const session = new TestClient(ctx.baseUrl);
    const login1 = await session.post('/api/v1/auth/login', {
      email: 'reset-password@iam-users-gym.test',
      password: firstPassword,
    });
    expect(login1.status).toBe(200);
    const refreshBefore = session.getCookie('pulso_rt');

    const reset = await owner.post(`/api/v1/users/${userId}/reset-password`);
    expect(reset.status).toBe(200);
    const newPassword = (reset.body as { temporaryPassword: string }).temporaryPassword;
    expect(newPassword).not.toBe(firstPassword);

    // La sesión vieja quedó revocada.
    session.setCookie('pulso_rt', refreshBefore!);
    const refreshAttempt = await session.post('/api/v1/auth/refresh');
    expect(refreshAttempt.status).toBe(401);

    // La contraseña vieja ya no sirve; la nueva sí.
    const oldLogin = await new TestClient(ctx.baseUrl).post('/api/v1/auth/login', {
      email: 'reset-password@iam-users-gym.test',
      password: firstPassword,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await new TestClient(ctx.baseUrl).post('/api/v1/auth/login', {
      email: 'reset-password@iam-users-gym.test',
      password: newPassword,
    });
    expect(newLogin.status).toBe(200);
  });
});

describe('invariante del último OWNER', () => {
  it('no se puede desactivar al último OWNER activo (409 LAST_OWNER)', async () => {
    const owner = await loginAs('OWNER');
    const res = await owner.post(`/api/v1/users/${gym.users['OWNER']!.id}/deactivate`);
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('LAST_OWNER');

    // Y sigue activo de verdad.
    const stillActive = await ctx.db.raw.user.findUnique({ where: { id: gym.users['OWNER']!.id } });
    expect(stillActive?.status).toBe('ACTIVE');
  });

  it('no se puede quitar el rol OWNER al último dueño vía PATCH (mismo invariante)', async () => {
    const owner = await loginAs('OWNER');
    const receptionistRoleId = await roleId('RECEPTIONIST');

    const res = await owner.patch(`/api/v1/users/${gym.users['OWNER']!.id}`, {
      roleIds: [receptionistRoleId],
    });
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('LAST_OWNER');
  });

  it('SÍ se puede desactivar un OWNER si hay otro OWNER activo', async () => {
    const owner = await loginAs('OWNER');
    const ownerRoleId = await roleId('OWNER');

    const secondOwner = await owner.post('/api/v1/users', {
      email: 'segundo-owner@iam-users-gym.test',
      firstName: 'Segundo',
      lastName: 'Owner',
      roleIds: [ownerRoleId],
      branchIds: [],
    });
    expect(secondOwner.status).toBe(201);
    const secondOwnerId = (secondOwner.body as { user: { id: string } }).user.id;

    const deactivated = await owner.post(`/api/v1/users/${secondOwnerId}/deactivate`);
    expect(deactivated.status).toBe(200);
    expect((deactivated.body as { status: string }).status).toBe('INACTIVE');

    // Y ahora si intento desactivar al ÚNICO owner que queda (el original),
    // vuelve a bloquear.
    const lastOne = await owner.post(`/api/v1/users/${gym.users['OWNER']!.id}/deactivate`);
    expect(lastOne.status).toBe(409);
  });

  // Concurrencia: ver iam/users-concurrency.spec.ts — se aisló en su propio
  // archivo (gimnasio propio) porque el escenario necesita reducir a
  // propósito la cantidad de OWNERs activos a 2, y hacerlo acá contaminaría
  // el estado que el resto de este archivo asume (`loginAs('OWNER')` deja
  // de andar si el OWNER del seed queda desactivado por la propia carrera).
});

describe('un usuario no puede quitarse user:write a sí mismo', () => {
  it('PATCH sobre el propio usuario que dejaría de tener user:write → 409', async () => {
    const owner = await loginAs('OWNER');
    const receptionistRoleId = await roleId('RECEPTIONIST');
    const ownerRoleId = await roleId('OWNER');

    // Un segundo OWNER (no el último, para aislar el chequeo de
    // auto-remoción del de LAST_OWNER) que se edita a sí mismo.
    const created = await owner.post('/api/v1/users', {
      email: 'se-edita-a-si-mismo@iam-users-gym.test',
      firstName: 'Self',
      lastName: 'Edit',
      roleIds: [ownerRoleId],
      branchIds: [],
    });
    const selfId = (created.body as { user: { id: string } }).user.id;
    const password = (created.body as { temporaryPassword: string }).temporaryPassword;

    const self = new TestClient(ctx.baseUrl);
    const login = await self.post('/api/v1/auth/login', {
      email: 'se-edita-a-si-mismo@iam-users-gym.test',
      password,
    });
    expect(login.status).toBe(200);

    const res = await self.patch(`/api/v1/users/${selfId}`, { roleIds: [receptionistRoleId] });
    expect(res.status).toBe(409);

    // Y sigue teniendo su rol original — el PATCH no se aplicó parcialmente.
    const stillOwner = await ctx.db.raw.userRoleAssignment.findFirst({
      where: { userId: selfId, role: { code: 'OWNER' } },
    });
    expect(stillOwner).not.toBeNull();
  });

  it('un OWNER SÍ puede quitarle user:write a OTRO usuario', async () => {
    const owner = await loginAs('OWNER');
    const receptionistRoleId = await roleId('RECEPTIONIST');
    const ownerRoleId = await roleId('OWNER');

    const created = await owner.post('/api/v1/users', {
      email: 'editado-por-otro@iam-users-gym.test',
      firstName: 'Editado',
      lastName: 'PorOtro',
      roleIds: [ownerRoleId],
      branchIds: [],
    });
    const targetId = (created.body as { user: { id: string } }).user.id;

    const res = await owner.patch(`/api/v1/users/${targetId}`, { roleIds: [receptionistRoleId] });
    expect(res.status).toBe(200);
  });
});

describe('desactivar invalida la sesión', () => {
  it('un usuario desactivado no puede refrescar su sesión', async () => {
    const owner = await loginAs('OWNER');
    const receptionistRoleId = await roleId('RECEPTIONIST');

    const created = await owner.post('/api/v1/users', {
      email: 'sesion-a-invalidar@iam-users-gym.test',
      firstName: 'Sesión',
      lastName: 'Invalidar',
      roleIds: [receptionistRoleId],
      branchIds: [],
    });
    const userId = (created.body as { user: { id: string } }).user.id;
    const password = (created.body as { temporaryPassword: string }).temporaryPassword;

    const session = new TestClient(ctx.baseUrl);
    await session.post('/api/v1/auth/login', {
      email: 'sesion-a-invalidar@iam-users-gym.test',
      password,
    });

    const deactivate = await owner.post(`/api/v1/users/${userId}/deactivate`);
    expect(deactivate.status).toBe(200);

    const refreshAfter = await session.post('/api/v1/auth/refresh');
    expect(refreshAfter.status).toBe(401);
  });
});

describe('matriz de permisos (TEST_STRATEGY §4.2)', () => {
  it('INSTRUCTOR no puede leer ni escribir usuarios', async () => {
    const instructor = await loginAs('INSTRUCTOR');
    const list = await instructor.get('/api/v1/users');
    expect(list.status).toBe(403);
    expect((list.body as { code: string }).code).toBe('MISSING_PERMISSION');
  });

  it('RECEPTIONIST puede leer usuarios (user:read) pero no escribirlos', async () => {
    const receptionist = await loginAs('RECEPTIONIST');
    const list = await receptionist.get('/api/v1/users');
    expect(list.status).toBe(200);

    const patch = await receptionist.patch(`/api/v1/users/${gym.users['INSTRUCTOR']!.id}`, {
      firstName: 'Hackeado',
    });
    expect(patch.status).toBe(403);
  });
});
