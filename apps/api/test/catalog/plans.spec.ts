import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/**
 * CRUD de planes (M4, API_CONTRACTS §7).
 *
 * El aislamiento cross-tenant lo cubre `cross-tenant-suite.spec.ts` (T-2.8);
 * acá se prueban las reglas de negocio propias: resincronización de las
 * tablas puente `PlanActivity`/`PlanBranch`, soft-delete lógico, el
 * invariante `PLAN_IN_USE`, y que un `activityId` de otro gimnasio en el
 * POST responda 404.
 */

let ctx: TestApp;
let gymA: Awaited<ReturnType<typeof seedGymWithUsers>>;
let gymB: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('catalog-plans');
  gymA = await seedGymWithUsers(ctx.db, { slug: 'plans-a' });
  gymB = await seedGymWithUsers(ctx.db, { slug: 'plans-b' });
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

async function createActivity(
  gym: Awaited<ReturnType<typeof seedGymWithUsers>>,
  name: string,
): Promise<string> {
  const row = await ctx.db.raw.activity.create({
    data: { gymId: gym.gym.id, name },
  });
  return row.id;
}

describe('POST /plans', () => {
  it('crea un plan con actividades y sedes en una sola transacción', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const musculacionId = await createActivity(gymA, 'Musc-plan');
    const spinningId = await createActivity(gymA, 'Spin-plan');

    const res = await owner.post('/api/v1/plans', {
      name: 'Plan Completo',
      description: 'Todas las actividades',
      price: '15000.00',
      billingCycle: 'MONTHLY',
      activityIds: [musculacionId, spinningId],
      branchIds: [gymA.branch.id],
    });
    expect(res.status).toBe(201);
    const body = res.body as {
      id: string;
      gymId: string;
      name: string;
      price: string;
      billingCycle: string;
      isActive: boolean;
      activityIds: string[];
      branchIds: string[];
    };
    expect(body.name).toBe('Plan Completo');
    expect(body.gymId).toBe(gymA.gym.id);
    expect(body.price).toBe('15000.00');
    expect(body.billingCycle).toBe('MONTHLY');
    expect(body.isActive).toBe(true);
    expect(new Set(body.activityIds)).toEqual(new Set([musculacionId, spinningId]));
    expect(body.branchIds).toEqual([gymA.branch.id]);
  });

  it('sin activityIds ni branchIds crea igual (vacío = todas las sedes)', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const res = await owner.post('/api/v1/plans', {
      name: 'Plan Libre',
      price: '10000.00',
      billingCycle: 'MONTHLY',
    });
    expect(res.status).toBe(201);
    const body = res.body as { activityIds: string[]; branchIds: string[] };
    expect(body.activityIds).toEqual([]);
    expect(body.branchIds).toEqual([]);
  });

  it('CLASS_PACK exige durationDays (validación del contrato)', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const invalid = await owner.post('/api/v1/plans', {
      name: 'Pack sin duración',
      price: '5000.00',
      billingCycle: 'CLASS_PACK',
      classesIncluded: 10,
    });
    expect(invalid.status).toBe(422);
  });

  it('activityId de OTRO gimnasio en el body responde 404 (no revela existencia ajena)', async () => {
    const ajenaId = await createActivity(gymB, 'Ajena a A');
    const owner = await loginAs(gymA, 'OWNER');
    const res = await owner.post('/api/v1/plans', {
      name: 'Plan con actividad ajena',
      price: '10000.00',
      billingCycle: 'MONTHLY',
      activityIds: [ajenaId],
    });
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('branchId de OTRO gimnasio en el body responde 404', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const res = await owner.post('/api/v1/plans', {
      name: 'Plan con sede ajena',
      price: '10000.00',
      billingCycle: 'MONTHLY',
      branchIds: [gymB.branch.id],
    });
    expect(res.status).toBe(404);
  });

  it('nombre duplicado en el mismo gimnasio → 409', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    await owner.post('/api/v1/plans', {
      name: 'Dup',
      price: '1000.00',
      billingCycle: 'MONTHLY',
    });
    const dup = await owner.post('/api/v1/plans', {
      name: 'Dup',
      price: '2000.00',
      billingCycle: 'MONTHLY',
    });
    expect(dup.status).toBe(409);
    expect((dup.body as { code: string }).code).toBe('CONFLICT');
  });

  it('RECEPTIONIST no puede crear planes (plan:write) — 403', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const res = await receptionist.post('/api/v1/plans', {
      name: 'No debería',
      price: '1000.00',
      billingCycle: 'MONTHLY',
    });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /plans/:id — resincroniza join tables', () => {
  it('cambiar activityIds reemplaza el set completo (delete + createMany)', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const initialA = await createActivity(gymA, 'Init-A');
    const initialB = await createActivity(gymA, 'Init-B');
    const created = await owner.post('/api/v1/plans', {
      name: 'Plan Resync',
      price: '5000.00',
      billingCycle: 'MONTHLY',
      activityIds: [initialA, initialB],
    });
    const id = (created.body as { id: string }).id;

    const nuevo = await createActivity(gymA, 'Nuevo-set');
    const updated = await owner.patch(`/api/v1/plans/${id}`, {
      activityIds: [nuevo],
    });
    expect(updated.status).toBe(200);
    expect((updated.body as { activityIds: string[] }).activityIds).toEqual([nuevo]);

    // Verificación directa: sólo queda una fila puente para este plan.
    const rows = await ctx.db.raw.planActivity.findMany({ where: { planId: id } });
    expect(rows.map((r) => r.activityId)).toEqual([nuevo]);
  });

  it('activityIds vacío en PATCH deja el plan sin actividades vinculadas', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const alguna = await createActivity(gymA, 'Alguna');
    const created = await owner.post('/api/v1/plans', {
      name: 'Plan a vaciar',
      price: '1000.00',
      billingCycle: 'MONTHLY',
      activityIds: [alguna],
    });
    const id = (created.body as { id: string }).id;

    const cleared = await owner.patch(`/api/v1/plans/${id}`, { activityIds: [] });
    expect((cleared.body as { activityIds: string[] }).activityIds).toEqual([]);
    const rows = await ctx.db.raw.planActivity.findMany({ where: { planId: id } });
    expect(rows).toEqual([]);
  });

  it('actualizar sólo campos escalares no toca las join tables', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const act = await createActivity(gymA, 'Preservar');
    const created = await owner.post('/api/v1/plans', {
      name: 'Plan Preservar',
      price: '2000.00',
      billingCycle: 'MONTHLY',
      activityIds: [act],
    });
    const id = (created.body as { id: string }).id;

    const updated = await owner.patch(`/api/v1/plans/${id}`, {
      description: 'nueva descripción',
      price: '2500.00',
    });
    expect((updated.body as { activityIds: string[] }).activityIds).toEqual([act]);
    expect((updated.body as { price: string }).price).toBe('2500.00');
  });
});

describe('DELETE /plans/:id — soft-delete lógico', () => {
  it('desactiva el plan (isActive: false) sin borrar la fila', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const created = await owner.post('/api/v1/plans', {
      name: 'Plan Desactivable',
      price: '1000.00',
      billingCycle: 'MONTHLY',
    });
    const id = (created.body as { id: string }).id;

    const res = await owner.del(`/api/v1/plans/${id}`);
    expect(res.status).toBe(200);
    expect((res.body as { isActive: boolean }).isActive).toBe(false);

    // La fila sigue existiendo (soft-delete lógico, no borrado real).
    const row = await ctx.db.raw.plan.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.isActive).toBe(false);
  });

  it('409 PLAN_IN_USE si el plan tiene una membresía ACTIVE', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const created = await owner.post('/api/v1/plans', {
      name: 'Plan Vendido',
      price: '1000.00',
      billingCycle: 'MONTHLY',
    });
    const id = (created.body as { id: string }).id;

    // Se crea la membresía directo por Prisma para no arrastrar la
    // dependencia de POST /members/:id/memberships en este spec.
    const member = await ctx.db.raw.member.create({
      data: {
        gymId: gymA.gym.id,
        branchId: gymA.branch.id,
        memberNumber: 90001,
        firstName: 'Con',
        lastName: 'Membresía',
        documentType: 'DNI',
        documentNumber: '90000001',
      },
    });
    await ctx.db.raw.membership.create({
      data: {
        gymId: gymA.gym.id,
        memberId: member.id,
        planId: id,
        branchId: gymA.branch.id,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-31T00:00:00.000Z'),
        pricePaid: '1000.00',
      },
    });

    const res = await owner.del(`/api/v1/plans/${id}`);
    expect(res.status).toBe(409);
    expect((res.body as { code: string }).code).toBe('PLAN_IN_USE');

    // Sigue activo: no se cambió el estado.
    const row = await ctx.db.raw.plan.findUnique({ where: { id } });
    expect(row?.isActive).toBe(true);
  });
});
