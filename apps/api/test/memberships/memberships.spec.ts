import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/**
 * Alta, listado y cancelación de membresías (M4, API_CONTRACTS §7).
 *
 * El aislamiento cross-tenant por :id se cubre parcialmente en
 * `cross-tenant-suite.spec.ts` (GET /members/:id/memberships y GET/PATCH
 * genéricos sobre `memberships`); las rutas `POST /members/:id/memberships`
 * y `POST /memberships/:id/cancel` están en `NON_TENANT_ALLOWLIST` porque
 * su validación Zod dispara 422 antes de que la comprobación cross-tenant
 * pueda correr — el aislamiento de esas dos rutas se cubre explícitamente
 * acá abajo (memberId/planId/branchId ajenos → 404).
 */

let ctx: TestApp;
let gymA: Awaited<ReturnType<typeof seedGymWithUsers>>;
let gymB: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('memberships');
  gymA = await seedGymWithUsers(ctx.db, { slug: 'memberships-a' });
  gymB = await seedGymWithUsers(ctx.db, { slug: 'memberships-b' });
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

let memberCounter = 0;
async function createMember(
  gym: Awaited<ReturnType<typeof seedGymWithUsers>>,
  overrides: { documentNumber?: string } = {},
): Promise<string> {
  memberCounter += 1;
  const memberNumber = 10_000 + memberCounter;
  const doc = overrides.documentNumber ?? String(80_000_000 + memberNumber);
  const row = await ctx.db.raw.member.create({
    data: {
      gymId: gym.gym.id,
      branchId: gym.branch.id,
      memberNumber,
      firstName: 'Socio',
      lastName: `Test${memberNumber}`,
      documentType: 'DNI',
      documentNumber: doc,
    },
  });
  return row.id;
}

let planCounter = 0;
async function createPlan(
  gym: Awaited<ReturnType<typeof seedGymWithUsers>>,
  overrides: {
    price?: string;
    billingCycle?: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL' | 'CLASS_PACK';
    isActive?: boolean;
    durationDays?: number | null;
    classesIncluded?: number | null;
    name?: string;
  } = {},
): Promise<string> {
  planCounter += 1;
  const row = await ctx.db.raw.plan.create({
    data: {
      gymId: gym.gym.id,
      name: overrides.name ?? `Plan Test ${planCounter}`,
      price: overrides.price ?? '1000.00',
      billingCycle: overrides.billingCycle ?? 'MONTHLY',
      isActive: overrides.isActive ?? true,
      ...(overrides.durationDays !== undefined ? { durationDays: overrides.durationDays } : {}),
      ...(overrides.classesIncluded !== undefined
        ? { classesIncluded: overrides.classesIncluded }
        : {}),
    },
  });
  return row.id;
}

function idem(): Record<string, string> {
  return { 'idempotency-key': randomUUID() };
}

describe('POST /members/:id/memberships (mode: DEBT)', () => {
  it('crea membership + ledger DEBIT + actualiza member.balance en una tx', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA, { price: '15000.00' });

    const res = await receptionist.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-02-01',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(res.status).toBe(201);
    const body = res.body as {
      membership: {
        id: string;
        status: string;
        startDate: string;
        endDate: string | null;
        pricePaid: string;
      };
      ledgerEntry: {
        type: string;
        reason: string;
        amount: string;
        balanceAfter: string;
        membershipId: string;
      };
    };
    expect(body.membership.status).toBe('ACTIVE');
    expect(body.membership.startDate).toBe('2026-02-01');
    // MONTHLY default = 30 días: 01 + 29 = 02-Mar (endDate inclusive).
    expect(body.membership.endDate).toBe('2026-03-02');
    expect(body.membership.pricePaid).toBe('15000.00');
    expect(body.ledgerEntry.type).toBe('DEBIT');
    expect(body.ledgerEntry.reason).toBe('MEMBERSHIP_CHARGE');
    expect(body.ledgerEntry.amount).toBe('15000.00');
    expect(body.ledgerEntry.balanceAfter).toBe('-15000.00');
    expect(body.ledgerEntry.membershipId).toBe(body.membership.id);

    // El saldo cacheado del socio queda alineado con el asiento.
    const member = await ctx.db.raw.member.findUniqueOrThrow({ where: { id: memberId } });
    expect(member.balance.toFixed(2)).toBe('-15000.00');
  });

  it('priceOverride se usa como pricePaid; sin él usa Plan.price', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const planId = await createPlan(gymA, { price: '20000.00' });

    // Con override.
    const m1 = await createMember(gymA);
    const withOverride = await receptionist.post(
      `/api/v1/members/${m1}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-04-01',
        priceOverride: '8000.00',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(withOverride.status).toBe(201);
    expect(
      (withOverride.body as { membership: { pricePaid: string } }).membership.pricePaid,
    ).toBe('8000.00');

    // Sin override → Plan.price.
    const m2 = await createMember(gymA);
    const withoutOverride = await receptionist.post(
      `/api/v1/members/${m2}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-04-01',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(
      (withoutOverride.body as { membership: { pricePaid: string } }).membership.pricePaid,
    ).toBe('20000.00');
  });

  it('CLASS_PACK deja endDate null (vence por consumo) y setea classesRemaining', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA, {
      billingCycle: 'CLASS_PACK',
      durationDays: 60,
      classesIncluded: 10,
      price: '5000.00',
    });

    const res = await receptionist.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-05-10',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(res.status).toBe(201);
    const body = res.body as {
      membership: {
        endDate: string | null;
        classesIncluded: number | null;
        classesRemaining: number | null;
      };
    };
    expect(body.membership.endDate).toBeNull();
    expect(body.membership.classesIncluded).toBe(10);
    expect(body.membership.classesRemaining).toBe(10);
  });

  it('mode: NOW responde 409 con detail explicando que llega en M5', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA);
    const payment = await ctx.db.raw.paymentMethod.create({
      data: { gymId: gymA.gym.id, code: 'CASH', name: 'Efectivo' },
    });

    const res = await receptionist.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-02-01',
        charge: { mode: 'NOW', paymentMethodId: payment.id, amount: '1000.00' },
      },
      idem(),
    );
    expect(res.status).toBe(409);
    const body = res.body as { code: string; detail?: string; title?: string };
    expect(body.code).toBe('CONFLICT');
    expect(`${body.detail ?? ''} ${body.title ?? ''}`).toMatch(/DEBT|milestone|caja/i);
  });

  it('solapamiento con otra membresía ACTIVE del mismo socio → 409 MEMBERSHIP_OVERLAP', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA);

    const first = await receptionist.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-06-01',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(first.status).toBe(201);

    // Nueva membresía cuyo rango se pisa con la primera (mismo socio):
    // 01 → 30 vs 15 → 14 del mes siguiente.
    const overlap = await receptionist.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-06-15',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(overlap.status).toBe(409);
    expect((overlap.body as { code: string }).code).toBe('MEMBERSHIP_OVERLAP');
  });

  it('otro socio del mismo gimnasio puede tener una membresía en las mismas fechas (el constraint es por memberId)', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const memberOne = await createMember(gymA);
    const memberTwo = await createMember(gymA);
    const planId = await createPlan(gymA);

    const a = await receptionist.post(
      `/api/v1/members/${memberOne}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-07-01',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(a.status).toBe(201);

    const b = await receptionist.post(
      `/api/v1/members/${memberTwo}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-07-01',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(b.status).toBe(201);
  });

  describe('cross-tenant', () => {
    it('memberId de OTRO gimnasio → 404', async () => {
      const foreignMemberId = await createMember(gymB);
      const planId = await createPlan(gymA);
      const receptionist = await loginAs(gymA, 'RECEPTIONIST');

      const res = await receptionist.post(
        `/api/v1/members/${foreignMemberId}/memberships`,
        {
          planId,
          branchId: gymA.branch.id,
          startDate: '2026-02-01',
          charge: { mode: 'DEBT' },
        },
        idem(),
      );
      expect(res.status).toBe(404);
    });

    it('planId de OTRO gimnasio → 404', async () => {
      const memberId = await createMember(gymA);
      const foreignPlanId = await createPlan(gymB);
      const receptionist = await loginAs(gymA, 'RECEPTIONIST');

      const res = await receptionist.post(
        `/api/v1/members/${memberId}/memberships`,
        {
          planId: foreignPlanId,
          branchId: gymA.branch.id,
          startDate: '2026-02-01',
          charge: { mode: 'DEBT' },
        },
        idem(),
      );
      expect(res.status).toBe(404);
    });

    it('branchId de OTRO gimnasio → 404', async () => {
      const memberId = await createMember(gymA);
      const planId = await createPlan(gymA);
      const receptionist = await loginAs(gymA, 'RECEPTIONIST');

      const res = await receptionist.post(
        `/api/v1/members/${memberId}/memberships`,
        {
          planId,
          branchId: gymB.branch.id,
          startDate: '2026-02-01',
          charge: { mode: 'DEBT' },
        },
        idem(),
      );
      expect(res.status).toBe(404);
    });

    it('plan desactivado no se puede vender → 409', async () => {
      const memberId = await createMember(gymA);
      const planId = await createPlan(gymA, { isActive: false });
      const receptionist = await loginAs(gymA, 'RECEPTIONIST');

      const res = await receptionist.post(
        `/api/v1/members/${memberId}/memberships`,
        {
          planId,
          branchId: gymA.branch.id,
          startDate: '2026-02-01',
          charge: { mode: 'DEBT' },
        },
        idem(),
      );
      expect(res.status).toBe(409);
    });
  });

  describe('idempotencia y concurrencia', () => {
    it('doble POST con la misma Idempotency-Key crea UNA sola membresía', async () => {
      const receptionist = await loginAs(gymA, 'RECEPTIONIST');
      const memberId = await createMember(gymA);
      const planId = await createPlan(gymA);
      const headers = idem();
      const body = {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-08-01',
        charge: { mode: 'DEBT' as const },
      };

      const first = await receptionist.post(
        `/api/v1/members/${memberId}/memberships`,
        body,
        headers,
      );
      const second = await receptionist.post(
        `/api/v1/members/${memberId}/memberships`,
        body,
        headers,
      );
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const firstId = (first.body as { membership: { id: string } }).membership.id;
      const secondId = (second.body as { membership: { id: string } }).membership.id;
      expect(secondId).toBe(firstId);

      const rows = await ctx.db.raw.membership.findMany({
        where: { memberId, planId },
      });
      expect(rows.length).toBe(1);

      // Un solo asiento contable también.
      const entries = await ctx.db.raw.ledgerEntry.findMany({
        where: { memberId, membershipId: firstId },
      });
      expect(entries.length).toBe(1);
    });

    it('20 POST concurrentes con Idempotency-Keys DISTINTAS: EXACTAMENTE 1 crea la membresía', async () => {
      // Cada request lleva una clave distinta — no es la idempotencia HTTP la
      // que serializa; el EXCLUDE constraint `memberships_no_overlap` es lo
      // que garantiza que sólo una gana la carrera sobre las mismas fechas
      // del mismo socio. El resto responde 409 MEMBERSHIP_OVERLAP.
      const receptionist = await loginAs(gymA, 'RECEPTIONIST');
      const memberId = await createMember(gymA);
      const planId = await createPlan(gymA);
      const body = {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-09-01',
        charge: { mode: 'DEBT' as const },
      };

      const attempts = 20;
      const results = await Promise.all(
        Array.from({ length: attempts }, () =>
          receptionist.post(`/api/v1/members/${memberId}/memberships`, body, idem()),
        ),
      );
      const created = results.filter((r) => r.status === 201).length;
      const rejected = results.filter((r) => r.status === 409).length;
      expect(created).toBe(1);
      expect(rejected).toBe(attempts - 1);

      // Verificación por DB: hay exactamente una membresía ACTIVE del socio.
      const active = await ctx.db.raw.membership.count({
        where: { memberId, status: 'ACTIVE' },
      });
      expect(active).toBe(1);
    });
  });
});

describe('GET /members/:id/memberships', () => {
  it('devuelve todas las membresías del socio ordenadas por startDate desc', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA);

    // Se cargan directo por DB para poder controlar las fechas sin chocar
    // con el EXCLUDE constraint (rangos disjuntos).
    await ctx.db.raw.membership.create({
      data: {
        gymId: gymA.gym.id,
        memberId,
        planId,
        branchId: gymA.branch.id,
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2025-01-31T00:00:00.000Z'),
        status: 'EXPIRED',
        pricePaid: '1000.00',
      },
    });
    await ctx.db.raw.membership.create({
      data: {
        gymId: gymA.gym.id,
        memberId,
        planId,
        branchId: gymA.branch.id,
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-01-31T00:00:00.000Z'),
        status: 'EXPIRED',
        pricePaid: '1000.00',
      },
    });

    const res = await receptionist.get(`/api/v1/members/${memberId}/memberships`);
    expect(res.status).toBe(200);
    const body = res.body as { data: { startDate: string }[] };
    expect(body.data.length).toBe(2);
    expect(body.data[0]!.startDate).toBe('2026-01-01');
    expect(body.data[1]!.startDate).toBe('2025-01-01');
  });

  it('member de otro gimnasio → 404', async () => {
    const foreignId = await createMember(gymB);
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const res = await receptionist.get(`/api/v1/members/${foreignId}/memberships`);
    expect(res.status).toBe(404);
  });
});

describe('POST /memberships/:id/cancel', () => {
  it('cambia status a CANCELLED, setea cancelledAt/cancelledReason, no borra la fila', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA);
    const created = await owner.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-10-01',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    const id = (created.body as { membership: { id: string } }).membership.id;

    const res = await owner.post(`/api/v1/memberships/${id}/cancel`, {
      reason: 'El socio se muda.',
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      status: string;
      cancelledAt: string | null;
      cancelledReason: string | null;
    };
    expect(body.status).toBe('CANCELLED');
    expect(body.cancelledAt).not.toBeNull();
    expect(body.cancelledReason).toBe('El socio se muda.');

    const row = await ctx.db.raw.membership.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.status).toBe('CANCELLED');
  });

  it('cancelar una membresía ya cancelada → 409 MEMBERSHIP_NOT_ACTIVE', async () => {
    const owner = await loginAs(gymA, 'OWNER');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA);
    const created = await owner.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2026-11-01',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    const id = (created.body as { membership: { id: string } }).membership.id;

    const first = await owner.post(`/api/v1/memberships/${id}/cancel`, {
      reason: 'primera vez',
    });
    expect(first.status).toBe(200);

    const second = await owner.post(`/api/v1/memberships/${id}/cancel`, {
      reason: 'segunda vez',
    });
    expect(second.status).toBe(409);
    expect((second.body as { code: string }).code).toBe('MEMBERSHIP_NOT_ACTIVE');
  });

  it('id de OTRO gimnasio → 404', async () => {
    // Membresía en gymB por Prisma directo.
    const memberB = await createMember(gymB);
    const planB = await createPlan(gymB);
    const foreign = await ctx.db.raw.membership.create({
      data: {
        gymId: gymB.gym.id,
        memberId: memberB,
        planId: planB,
        branchId: gymB.branch.id,
        startDate: new Date('2026-12-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        pricePaid: '1000.00',
      },
    });

    const owner = await loginAs(gymA, 'OWNER');
    const res = await owner.post(`/api/v1/memberships/${foreign.id}/cancel`, {
      reason: 'intento cross-tenant',
    });
    expect(res.status).toBe(404);

    // Y la fila ajena no se tocó.
    const untouched = await ctx.db.raw.membership.findUnique({ where: { id: foreign.id } });
    expect(untouched?.status).toBe('ACTIVE');
  });
});
