import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';
import { createMembershipResponseSchema, membershipSchema } from '@pulso/contracts/memberships';
import { nextMonthlyDateAfter, toBusinessDate } from '@pulso/config';
import pino from 'pino';
import { renewMemberships } from '../../../worker/src/jobs/membership-renewal.js';

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
    // Nuevo requisito: mes calendario, ultimo dia inclusive.
    expect(body.membership.endDate).toBe('2026-02-28');
    expect(createMembershipResponseSchema.parse(res.body).membership.autoRenew).toBe(false);
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

  it('nuevo requisito: rechaza priceOverride discrecional; sin el usa Plan.price completo', async () => {
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
    expect(withOverride.status).toBe(422);
    expect(await ctx.db.raw.membership.count({ where: { memberId: m1 } })).toBe(0);
    expect(await ctx.db.raw.ledgerEntry.count({ where: { memberId: m1 } })).toBe(0);

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

  it('mode: NOW sin sesión de caja abierta → 409 NO_OPEN_CASH_SESSION', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA);
    const payment = await ctx.db.raw.paymentMethod.create({
      data: { gymId: gymA.gym.id, code: 'CASH_NOW_NO_SESSION', name: 'Efectivo' },
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
    expect((res.body as { code: string }).code).toBe('NO_OPEN_CASH_SESSION');
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

describe('recurrencia mensual opt-in', () => {
  async function assign(overrides: Record<string, unknown> = {}) {
    const client = await loginAs(gymA, 'OWNER');
    const memberId = await createMember(gymA);
    const planId = await createPlan(gymA, { price: '40000.01', durationDays: 30 });
    const response = await client.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2030-01-31',
        charge: { mode: 'DEBT' },
        ...overrides,
      },
      idem(),
    );
    expect(response.status).toBe(201);
    return { client, memberId, planId, body: createMembershipResponseSchema.parse(response.body) };
  }

  it('persiste periodo mensual completo, ancla y opt-in; conserva centavos', async () => {
    const { body } = await assign({ autoRenew: true, priceOverride: '40000.01' });
    expect(body.membership).toMatchObject({
      startDate: '2030-01-31',
      endDate: '2030-02-27',
      pricePaid: '40000.01',
      autoRenew: true,
      renewalAnchorDay: 31,
      nextRenewalDate: '2030-02-28',
      renewedFromId: null,
    });
    expect(body.ledgerEntry.amount).toBe('40000.01');
    expect(body.cashMovement).toBeUndefined();
  });

  it('omitido no renueva; habilitar y deshabilitar no crea deuda ni cambia historial', async () => {
    const { client, memberId, body } = await assign();
    expect(body.membership.autoRenew).toBe(false);
    expect(body.membership.nextRenewalDate).toBeNull();
    const ledgerBefore = await ctx.db.raw.ledgerEntry.findMany({ where: { memberId } });
    const enabled = await client.post(
      `/api/v1/memberships/${body.membership.id}/renewal`,
      { autoRenew: true },
      idem(),
    );
    expect(enabled.status).toBe(200);
    expect(membershipSchema.parse(enabled.body).nextRenewalDate).toBe('2030-02-28');
    const headers = idem();
    const off = await client.post(
      `/api/v1/memberships/${body.membership.id}/renewal`,
      { autoRenew: false },
      headers,
    );
    const replay = await client.post(
      `/api/v1/memberships/${body.membership.id}/renewal`,
      { autoRenew: false },
      headers,
    );
    expect(off.status).toBe(200);
    expect(replay.body).toEqual(off.body);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect(membershipSchema.parse(off.body)).toMatchObject({
      autoRenew: false,
      nextRenewalDate: null,
    });
    expect(await ctx.db.raw.ledgerEntry.findMany({ where: { memberId } })).toEqual(ledgerBefore);
    expect(await ctx.db.raw.cashMovement.count({ where: { memberId } })).toBe(0);
    const conflict = await client.post(
      `/api/v1/memberships/${body.membership.id}/renewal`,
      { autoRenew: true },
      headers,
    );
    expect(conflict.status).toBe(409);
  });

  it('habilitar vencida conserva fechas e importes historicos y programa futuro sin retroactivos', async () => {
    const { client, memberId, body } = await assign({ startDate: '2020-01-15' });
    await ctx.db.raw.membership.update({
      where: { id: body.membership.id },
      data: { status: 'EXPIRED', pricePaid: '100.00' },
    });
    const before = await ctx.db.raw.member.findUniqueOrThrow({ where: { id: memberId } });
    const response = await client.post(
      `/api/v1/memberships/${body.membership.id}/renewal`,
      { autoRenew: true },
      idem(),
    );
    expect(response.status).toBe(200);
    expect(membershipSchema.parse(response.body)).toMatchObject({
      status: 'EXPIRED',
      startDate: '2020-01-15',
      endDate: '2020-02-14',
      pricePaid: '100.00',
      nextRenewalDate: nextMonthlyDateAfter(toBusinessDate(new Date(), gymA.branch.timezone), 15),
    });
    expect(
      (await ctx.db.raw.member.findUniqueOrThrow({ where: { id: memberId } })).balance,
    ).toEqual(before.balance);
    expect(await ctx.db.raw.membership.count({ where: { memberId } })).toBe(1);
  });

  it('no permite recurrencia en CLASS_PACK ni socio inactivo', async () => {
    const { client, memberId } = await assign();
    const pack = await createPlan(gymA, { billingCycle: 'CLASS_PACK' });
    expect(
      (
        await client.post(
          `/api/v1/members/${memberId}/memberships`,
          {
            planId: pack,
            branchId: gymA.branch.id,
            startDate: '2031-01-01',
            autoRenew: true,
            charge: { mode: 'DEBT' },
          },
          idem(),
        )
      ).status,
    ).toBe(422);
    await ctx.db.raw.member.update({ where: { id: memberId }, data: { status: 'INACTIVE' } });
    expect(
      (
        await client.post(
          `/api/v1/members/${memberId}/memberships`,
          {
            planId: pack,
            branchId: gymA.branch.id,
            startDate: '2031-01-01',
            charge: { mode: 'DEBT' },
          },
          idem(),
        )
      ).status,
    ).toBe(409);
  });

  it('cambio de plan apaga recurrencia anterior sin cancelar ni borrar la cuota', async () => {
    const { client, memberId, body } = await assign({ autoRenew: true });
    const planId = await createPlan(gymA);
    const response = await client.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2030-02-28',
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(response.status).toBe(201);
    expect(
      await ctx.db.raw.membership.findUniqueOrThrow({ where: { id: body.membership.id } }),
    ).toMatchObject({
      status: 'ACTIVE',
      autoRenew: false,
      nextRenewalDate: null,
    });
    expect(await ctx.db.raw.ledgerEntry.count({ where: { memberId } })).toBe(2);
    expect(
      (
        await client.post(
          `/api/v1/memberships/${body.membership.id}/renewal`,
          { autoRenew: true },
          idem(),
        )
      ).status,
    ).toBe(409);
  });

  it('solapamiento fallido no apaga recurrencia ni crea deuda extra', async () => {
    const { client, memberId, planId, body } = await assign({ autoRenew: true });
    expect(
      (
        await client.post(
          `/api/v1/members/${memberId}/memberships`,
          {
            planId,
            branchId: gymA.branch.id,
            startDate: '2030-02-01',
            charge: { mode: 'DEBT' },
          },
          idem(),
        )
      ).status,
    ).toBe(409);
    expect(
      (await ctx.db.raw.membership.findUniqueOrThrow({ where: { id: body.membership.id } }))
        .autoRenew,
    ).toBe(true);
    expect(await ctx.db.raw.ledgerEntry.count({ where: { memberId } })).toBe(1);
  });

  it('cancelar detiene recurrencia sin perdonar deuda, y no permite reactivar cancelada', async () => {
    const { client, memberId, body } = await assign({ autoRenew: true });
    const res = await client.post(`/api/v1/memberships/${body.membership.id}/cancel`, {
      reason: 'Baja solicitada',
    });
    expect(res.status).toBe(200);
    expect(membershipSchema.parse(res.body)).toMatchObject({
      autoRenew: false,
      nextRenewalDate: null,
      status: 'CANCELLED',
    });
    expect(
      (await ctx.db.raw.member.findUniqueOrThrow({ where: { id: memberId } })).balance.toFixed(2),
    ).toBe('-40000.01');
    expect(
      (
        await client.post(
          `/api/v1/memberships/${body.membership.id}/renewal`,
          { autoRenew: true },
          idem(),
        )
      ).status,
    ).toBe(409);
  });

  it('controla permiso, body e Idempotency-Key de configuracion', async () => {
    const { client, body } = await assign();
    const path = `/api/v1/memberships/${body.membership.id}/renewal`;
    const instructor = await loginAs(gymA, 'INSTRUCTOR');
    expect((await instructor.post(path, { autoRenew: true }, idem())).status).toBe(403);
    expect((await client.post(path, { autoRenew: true })).status).toBe(400);
    expect((await client.post(path, { autoRenew: true, amount: '1.00' }, idem())).status).toBe(422);
  });

  it.each(['renewal', 'cancel'])(
    'carrera %s contra worker deja cadena detenida y no borra deuda',
    async (action) => {
      const { client, memberId, body } = await assign({ autoRenew: true });
      const [response, sweep] = await Promise.all([
        client.post(
          `/api/v1/memberships/${body.membership.id}/${action}`,
          action === 'renewal' ? { autoRenew: false } : { reason: 'Baja solicitada' },
          idem(),
        ),
        renewMemberships({
          prisma: ctx.db.raw,
          logger: pino({ level: 'silent' }),
          now: new Date('2030-02-28T12:00:00Z'),
        }),
      ]);
      expect(response.status).toBe(200);
      expect(sweep.failures).toBe(0);
      expect(await ctx.db.raw.membership.count({ where: { memberId, autoRenew: true } })).toBe(0);
      const periods = await ctx.db.raw.membership.findMany({ where: { memberId } });
      expect(periods.length).toBeGreaterThanOrEqual(1);
      expect(periods.length).toBeLessThanOrEqual(2);
      expect(await ctx.db.raw.ledgerEntry.count({ where: { memberId } })).toBe(periods.length);
      expect(await ctx.db.raw.cashMovement.count({ where: { memberId } })).toBe(0);
      expect(
        (await ctx.db.raw.member.findUniqueOrThrow({ where: { id: memberId } })).balance.toFixed(2),
      ).toBe(periods.length === 1 ? '-40000.01' : '-80000.02');
    },
  );

  it('un id previo detiene sucesor, pero no otra asignacion independiente', async () => {
    const { client, memberId, planId, body } = await assign({ autoRenew: true });
    await renewMemberships({
      prisma: ctx.db.raw,
      logger: pino({ level: 'silent' }),
      now: new Date('2030-02-28T12:00:00Z'),
    });
    const child = await ctx.db.raw.membership.findFirstOrThrow({
      where: { renewedFromId: body.membership.id },
    });
    expect(
      (
        await client.post(
          `/api/v1/memberships/${body.membership.id}/renewal`,
          { autoRenew: false },
          idem(),
        )
      ).status,
    ).toBe(200);
    expect(
      (await ctx.db.raw.membership.findUniqueOrThrow({ where: { id: child.id } })).autoRenew,
    ).toBe(false);
    const independent = await client.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gymA.branch.id,
        startDate: '2031-01-01',
        autoRenew: true,
        charge: { mode: 'DEBT' },
      },
      idem(),
    );
    expect(independent.status).toBe(201);
    expect(
      (
        await client.post(
          `/api/v1/memberships/${body.membership.id}/renewal`,
          { autoRenew: false },
          idem(),
        )
      ).status,
    ).toBe(200);
    const newer = createMembershipResponseSchema.parse(independent.body).membership;
    expect(
      (await ctx.db.raw.membership.findUniqueOrThrow({ where: { id: newer.id } })).autoRenew,
    ).toBe(true);
  });

  it('configuracion no toca una sede propia sin acceso', async () => {
    const { client, body } = await assign();
    const branch = await ctx.db.raw.branch.create({
      data: { gymId: gymA.gym.id, name: 'Restringida' },
    });
    await ctx.db.raw.membership.update({
      where: { id: body.membership.id },
      data: { branchId: branch.id },
    });
    const response = await client.post(
      `/api/v1/memberships/${body.membership.id}/renewal`,
      { autoRenew: true },
      idem(),
    );
    expect(response.status).toBe(404);
    expect(
      (await ctx.db.raw.membership.findUniqueOrThrow({ where: { id: body.membership.id } }))
        .autoRenew,
    ).toBe(false);
  });

  it.each(['cash:operate', 'payment:collect'])('requiere %s en NOW aun con membership:write', async (missing) => {
    const gym = await seedGymWithUsers(ctx.db, { slug: `membership-no-${missing.replace(':', '-')}` });
    const role = await ctx.db.raw.role.findFirstOrThrow({
      where: { gymId: gym.gym.id, code: 'RECEPTIONIST' },
    });
    await ctx.db.raw.role.update({
      where: { id: role.id },
      data: { permissions: ['membership:write', 'member:read', 'cash:operate', 'payment:collect'].filter((p) => p !== missing) },
    });
    const client = await loginAs(gym, 'RECEPTIONIST');
    const memberId = await createMember(gym);
    const planId = await createPlan(gym);
    const response = await client.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gym.branch.id,
        startDate: '2030-09-21',
        charge: { mode: 'NOW', paymentMethodId: randomUUID(), amount: '1000.00' },
      },
      idem(),
    );
    expect(response.status).toBe(403);
    expect(await ctx.db.raw.membership.count({ where: { memberId } })).toBe(0);
  });

  it.each([
    ['TRANSFER', '45000.01'],
    ['MERCADO_PAGO', '40000.01'],
    ['CASH', '40000.01'],
  ])('NOW %s cobra precio completo mas solo el recargo correspondiente', async (code, amount) => {
    const gym = await seedGymWithUsers(ctx.db, {
      slug: `monthly-now-${code.toLowerCase().replaceAll('_', '-')}`,
    });
    const client = await loginAs(gym, 'OWNER');
    const memberId = await createMember(gym);
    const planId = await createPlan(gym, { price: '40000.01' });
    const method = await ctx.db.raw.paymentMethod.create({
      data: { gymId: gym.gym.id, code, name: code },
    });
    const register = await ctx.db.raw.cashRegister.create({
      data: { gymId: gym.gym.id, branchId: gym.branch.id, name: 'Caja' },
    });
    await ctx.db.raw.cashSession.create({
      data: {
        gymId: gym.gym.id,
        branchId: gym.branch.id,
        cashRegisterId: register.id,
        openedByUserId: gym.users['OWNER']!.id,
        openingAmount: '0.00',
        businessDate: new Date('2030-09-21'),
      },
    });
    const input = {
      planId,
      branchId: gym.branch.id,
      startDate: '2030-09-21',
      autoRenew: true,
      charge: { mode: 'NOW', paymentMethodId: method.id, amount },
    };
    const wrong = await client.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        ...input,
        charge: { ...input.charge, amount: '1.00' },
      },
      idem(),
    );
    expect(wrong.status).toBe(422);
    expect(await ctx.db.raw.ledgerEntry.count({ where: { memberId } })).toBe(0);
    const res = await client.post(`/api/v1/members/${memberId}/memberships`, input, idem());
    expect(res.status).toBe(201);
    const body = createMembershipResponseSchema.parse(res.body);
    expect(body.membership.pricePaid).toBe(amount);
    expect(body.cashMovement?.amount).toBe(amount);
    expect(body.membership.endDate).toBe('2030-10-20');
    expect(
      (await ctx.db.raw.member.findUniqueOrThrow({ where: { id: memberId } })).balance.toFixed(2),
    ).toBe('0.00');
    expect(await ctx.db.raw.ledgerEntry.count({ where: { memberId } })).toBe(2);
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
