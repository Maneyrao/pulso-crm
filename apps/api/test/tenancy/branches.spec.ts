import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/**
 * CRUD de sedes (T-2.6, API_CONTRACTS §4).
 *
 * El aislamiento cross-tenant de estos mismos endpoints lo cubre
 * `cross-tenant-suite.spec.ts` (T-2.8, auto-generada); acá se prueban las
 * reglas de negocio que esa suite no conoce: unicidad, soft-delete/toggle,
 * y el límite de sedes del plan SaaS.
 */

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('branches');
  gym = await seedGymWithUsers(ctx.db, { slug: 'branches-gym' });
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

describe('GET /branches', () => {
  it('devuelve la sede sembrada por el seed', async () => {
    const owner = await loginAs('OWNER');
    const res = await owner.get('/api/v1/branches');
    expect(res.status).toBe(200);
    const body = res.body as { data: { name: string }[] };
    expect(body.data.some((b) => b.name === 'Sede Única')).toBe(true);
  });

  it('MANAGER también puede leer (config:read)', async () => {
    const manager = await loginAs('MANAGER');
    const res = await manager.get('/api/v1/branches');
    expect(res.status).toBe(200);
  });

  it('RECEPTIONIST NO tiene config:read (catálogo de permisos, packages/contracts/src/permissions.ts) — 403', async () => {
    const receptionist = await loginAs('RECEPTIONIST');
    const res = await receptionist.get('/api/v1/branches');
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('MISSING_PERMISSION');
  });
});

describe('POST /branches', () => {
  it('OWNER crea una sede nueva', async () => {
    const owner = await loginAs('OWNER');
    const res = await owner.post('/api/v1/branches', {
      name: 'Sede Norte',
      timezone: 'America/Argentina/Buenos_Aires',
      address: 'Av. Siempre Viva 123',
    });
    expect(res.status).toBe(201);
    const body = res.body as { name: string; isActive: boolean; gymId: string };
    expect(body.name).toBe('Sede Norte');
    expect(body.isActive).toBe(true);
    expect(body.gymId).toBe(gym.gym.id);
  });

  it('rechaza un nombre duplicado en el mismo gimnasio (409)', async () => {
    const owner = await loginAs('OWNER');
    await owner.post('/api/v1/branches', { name: 'Sede Sur', timezone: 'America/Argentina/Buenos_Aires' });
    const dup = await owner.post('/api/v1/branches', {
      name: 'Sede Sur',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect(dup.status).toBe(409);
  });

  it('RECEPTIONIST no puede crear sedes (config:write) — 403', async () => {
    const receptionist = await loginAs('RECEPTIONIST');
    const res = await receptionist.post('/api/v1/branches', {
      name: 'Sede Prohibida',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe('MISSING_PERMISSION');
  });

  it('devuelve 403 PLAN_LIMIT_REACHED al superar el límite de sedes del plan', async () => {
    await ctx.db.raw.saasPlan.update({
      where: { id: gym.gym.saasPlanId },
      data: { maxBranches: 2 },
    });
    const owner = await loginAs('OWNER');

    // El gimnasio ya tiene "Sede Única" + "Sede Norte" (o similar) de tests
    // previos — cuenta las activas y llena hasta el límite antes de probar.
    const before = await owner.get('/api/v1/branches');
    const activeCount = (before.body as { data: { isActive: boolean }[] }).data.filter(
      (b) => b.isActive,
    ).length;

    for (let i = activeCount; i < 2; i++) {
      const filler = await owner.post('/api/v1/branches', {
        name: `Sede Filler ${i}`,
        timezone: 'America/Argentina/Buenos_Aires',
      });
      expect(filler.status).toBe(201);
    }

    const overLimit = await owner.post('/api/v1/branches', {
      name: 'Sede Excedente',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    expect(overLimit.status).toBe(403);
    expect((overLimit.body as { code: string }).code).toBe('PLAN_LIMIT_REACHED');

    // Se restaura para no interferir con otros tests de este archivo.
    await ctx.db.raw.saasPlan.update({ where: { id: gym.gym.saasPlanId }, data: { maxBranches: 10 } });
  });

  it('concurrencia: N creates simultáneos sobre un límite ajustado — sólo entran los que caben', async () => {
    const owner = await loginAs('OWNER');

    const before = await owner.get('/api/v1/branches');
    const activeCount = (before.body as { data: { isActive: boolean }[] }).data.filter(
      (b) => b.isActive,
    ).length;

    // Deja lugar para exactamente 2 más y dispara 5 creates a la vez: sin el
    // lock sobre la fila de `Gym` (SELECT ... FOR UPDATE dentro de la
    // transacción, tomado ANTES de contar sedes activas), varias podrían leer
    // el mismo conteo "por debajo del límite" a la vez y todas pasar,
    // dejando al gimnasio con más sedes activas de las que el plan permite.
    const room = 2;
    await ctx.db.raw.saasPlan.update({
      where: { id: gym.gym.saasPlanId },
      data: { maxBranches: activeCount + room },
    });

    const attempts = 5;
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, i) =>
        owner.post('/api/v1/branches', {
          name: `Sede Concurrencia ${i}-${Date.now()}`,
          timezone: 'America/Argentina/Buenos_Aires',
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 403).length;
    expect(succeeded).toBe(room);
    expect(rejected).toBe(attempts - room);

    const afterActive = await ctx.db.raw.branch.count({
      where: { gymId: gym.gym.id, isActive: true, deletedAt: null },
    });
    expect(afterActive).toBe(activeCount + room);

    await ctx.db.raw.saasPlan.update({ where: { id: gym.gym.saasPlanId }, data: { maxBranches: 10 } });
  });
});

describe('PATCH /branches/:id', () => {
  it('actualiza nombre y timezone', async () => {
    const owner = await loginAs('OWNER');
    const created = await owner.post('/api/v1/branches', {
      name: 'Sede a Renombrar',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    const id = (created.body as { id: string }).id;

    const updated = await owner.patch(`/api/v1/branches/${id}`, {
      name: 'Sede Renombrada',
      timezone: 'America/Sao_Paulo',
    });
    expect(updated.status).toBe(200);
    const body = updated.body as { name: string; timezone: string };
    expect(body.name).toBe('Sede Renombrada');
    expect(body.timezone).toBe('America/Sao_Paulo');
  });

  it('un body vacío no cambia nada (todos los campos son opcionales)', async () => {
    const owner = await loginAs('OWNER');
    const created = await owner.post('/api/v1/branches', {
      name: 'Sede Sin Cambios',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    const id = (created.body as { id: string }).id;

    const res = await owner.patch(`/api/v1/branches/${id}`, {});
    expect(res.status).toBe(200);
    expect((res.body as { name: string }).name).toBe('Sede Sin Cambios');
  });

  it('reactiva una sede con isActive: true', async () => {
    const owner = await loginAs('OWNER');
    const created = await owner.post('/api/v1/branches', {
      name: 'Sede Reactivable',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    const id = (created.body as { id: string }).id;

    await owner.del(`/api/v1/branches/${id}`);
    const reactivated = await owner.patch(`/api/v1/branches/${id}`, { isActive: true });
    expect(reactivated.status).toBe(200);
    expect((reactivated.body as { isActive: boolean }).isActive).toBe(true);
  });
});

describe('DELETE /branches/:id — sólo desactiva', () => {
  it('desactiva una sede sin socios ni caja abierta', async () => {
    const owner = await loginAs('OWNER');
    const created = await owner.post('/api/v1/branches', {
      name: 'Sede Vacía',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    const id = (created.body as { id: string }).id;

    const res = await owner.del(`/api/v1/branches/${id}`);
    expect(res.status).toBe(200);
    expect((res.body as { isActive: boolean }).isActive).toBe(false);

    // Sigue existiendo la fila (soft-delete, no borrado real): se puede reactivar.
    const stillThere = await ctx.db.raw.branch.findUnique({ where: { id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.deletedAt).toBeNull();
  });

  it('409 BRANCH_HAS_ACTIVE_DATA si la sede tiene socios', async () => {
    const owner = await loginAs('OWNER');
    const created = await owner.post('/api/v1/branches', {
      name: 'Sede Con Socios',
      timezone: 'America/Argentina/Buenos_Aires',
    });
    const branchId = (created.body as { id: string }).id;

    await ctx.db.raw.member.create({
      data: {
        gymId: gym.gym.id,
        branchId,
        memberNumber: Math.floor(Math.random() * 1_000_000) + 1,
        firstName: 'Socio',
        lastName: 'De Prueba',
        documentType: 'DNI',
        documentNumber: String(80_000_000 + Math.floor(Math.random() * 100_000)),
      },
    });

    const res = await owner.del(`/api/v1/branches/${branchId}`);
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('BRANCH_HAS_ACTIVE_DATA');
  });
});
