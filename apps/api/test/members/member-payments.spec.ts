import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

let ctx: TestApp;
let gymA: Awaited<ReturnType<typeof seedGymWithUsers>>;
let gymB: Awaited<ReturnType<typeof seedGymWithUsers>>;
let memberId: string;
let foreignMemberId: string;

beforeAll(async () => {
  ctx = await createTestApp('member-payments');
  gymA = await seedGymWithUsers(ctx.db, { slug: 'member-payments-a' });
  gymB = await seedGymWithUsers(ctx.db, { slug: 'member-payments-b' });

  memberId = await seedMemberPaymentHistory(gymA, '30222111');
  foreignMemberId = await seedMemberPaymentHistory(gymB, '30999111');
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

async function loginAs(
  gym: Awaited<ReturnType<typeof seedGymWithUsers>>,
  role: keyof typeof gym.users,
): Promise<TestClient> {
  const client = new TestClient(ctx.baseUrl);
  const response = await client.post('/api/v1/auth/login', {
    email: gym.users[role]!.email,
    password: gym.password,
  });
  expect(response.status).toBe(200);
  return client;
}

async function seedMemberPaymentHistory(
  gym: Awaited<ReturnType<typeof seedGymWithUsers>>,
  documentNumber: string,
): Promise<string> {
  const member = await ctx.db.raw.member.create({
    data: {
      gymId: gym.gym.id,
      branchId: gym.branch.id,
      memberNumber: Number(documentNumber.slice(-5)),
      firstName: 'Socio',
      lastName: 'Pagos',
      documentType: 'DNI',
      documentNumber,
    },
  });
  const plan = await ctx.db.raw.plan.create({
    data: {
      gymId: gym.gym.id,
      name: 'Pase Entrenamiento',
      price: '45000.00',
      billingCycle: 'MONTHLY',
    },
  });
  const membership = await ctx.db.raw.membership.create({
    data: {
      gymId: gym.gym.id,
      memberId: member.id,
      planId: plan.id,
      branchId: gym.branch.id,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2026-08-30T00:00:00.000Z'),
      pricePaid: '45000.00',
      createdByUserId: gym.users.OWNER!.id,
    },
  });
  const register = await ctx.db.raw.cashRegister.create({
    data: { gymId: gym.gym.id, branchId: gym.branch.id, name: 'Caja recepción' },
  });
  const session = await ctx.db.raw.cashSession.create({
    data: {
      gymId: gym.gym.id,
      branchId: gym.branch.id,
      cashRegisterId: register.id,
      openedByUserId: gym.users.OWNER!.id,
      openingAmount: '0.00',
      businessDate: new Date('2026-08-10T00:00:00.000Z'),
    },
  });
  const paymentMethod = await ctx.db.raw.paymentMethod.create({
    data: {
      gymId: gym.gym.id,
      code: 'TRANSFER',
      name: 'Mercado Pago / Transferencia',
    },
  });
  const paymentConcept = await ctx.db.raw.cashConcept.create({
    data: {
      gymId: gym.gym.id,
      code: 'MEMBERSHIP_PAYMENT',
      name: 'Cobro de cuota',
      type: 'INCOME',
    },
  });
  const refundConcept = await ctx.db.raw.cashConcept.create({
    data: {
      gymId: gym.gym.id,
      code: 'MEMBERSHIP_REFUND',
      name: 'Reintegro de cuota',
      type: 'EXPENSE',
    },
  });

  await ctx.db.raw.cashMovement.createMany({
    data: [
      {
        gymId: gym.gym.id,
        cashSessionId: session.id,
        type: 'INCOME',
        amount: '45000.00',
        paymentMethodId: paymentMethod.id,
        cashConceptId: paymentConcept.id,
        description: 'Cuota agosto',
        memberId: member.id,
        membershipId: membership.id,
        createdByUserId: gym.users.OWNER!.id,
        createdAt: new Date('2026-08-10T18:30:00.000Z'),
      },
      {
        gymId: gym.gym.id,
        cashSessionId: session.id,
        type: 'INCOME',
        amount: '10000.00',
        paymentMethodId: paymentMethod.id,
        cashConceptId: paymentConcept.id,
        description: 'Pago cargado por error',
        memberId: member.id,
        membershipId: membership.id,
        isReversed: true,
        reversalReason: 'Cobro duplicado durante la prueba',
        createdByUserId: gym.users.OWNER!.id,
        createdAt: new Date('2026-08-09T18:30:00.000Z'),
      },
      {
        gymId: gym.gym.id,
        cashSessionId: session.id,
        type: 'EXPENSE',
        amount: '5000.00',
        paymentMethodId: paymentMethod.id,
        cashConceptId: refundConcept.id,
        description: 'Reintegro parcial',
        memberId: member.id,
        membershipId: membership.id,
        createdByUserId: gym.users.OWNER!.id,
        createdAt: new Date('2026-08-11T18:30:00.000Z'),
      },
    ],
  });

  return member.id;
}

describe('GET /members/:id/payments', () => {
  it('lista sólo cobros, muestra su contexto y no suma pagos anulados', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const response = await receptionist.get(`/api/v1/members/${memberId}/payments?page=1&limit=25`);

    expect(response.status).toBe(200);
    const body = response.body as {
      data: Array<{
        amount: string;
        status: string;
        paidOn: string;
        paymentMethod: { name: string };
        concept: { name: string };
        membership: { planName: string } | null;
        registeredBy: { fullName: string };
      }>;
      pageInfo: { total: number };
      summary: { paymentCount: number; totalPaid: string; lastPaymentAt: string | null };
    };

    expect(body.pageInfo.total).toBe(2);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({
      amount: '45000.00',
      status: 'VALID',
      paidOn: '2026-08-10',
      paymentMethod: { name: 'Mercado Pago / Transferencia' },
      concept: { name: 'Cobro de cuota' },
      membership: { planName: 'Pase Entrenamiento' },
      registeredBy: { fullName: 'OWNER Test' },
    });
    expect(body.data[1]?.status).toBe('REVERSED');
    expect(body.summary).toEqual({
      paymentCount: 1,
      totalPaid: '45000.00',
      lastPaymentAt: '2026-08-10T18:30:00.000Z',
    });
  });

  it('completa recentPayments en la ficha del socio', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const response = await receptionist.get(`/api/v1/members/${memberId}`);

    expect(response.status).toBe(200);
    expect((response.body as { recentPayments: unknown[] }).recentPayments).toEqual([
      expect.objectContaining({
        amount: '45000.00',
        paymentMethodName: 'Mercado Pago / Transferencia',
        createdAt: '2026-08-10T18:30:00.000Z',
      }),
    ]);
  });

  it('no permite consultar pagos de un socio de otro gimnasio', async () => {
    const receptionist = await loginAs(gymA, 'RECEPTIONIST');
    const response = await receptionist.get(`/api/v1/members/${foreignMemberId}/payments`);

    expect(response.status).toBe(404);
  });
});
