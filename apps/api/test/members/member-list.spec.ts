import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;
let client: TestClient;
let expiredPaidId: string;
let renewedId: string;

beforeAll(async () => {
  ctx = await createTestApp('member-list');
  gym = await seedGymWithUsers(ctx.db, { slug: 'member-list' });
  client = new TestClient(ctx.baseUrl);
  const login = await client.post('/api/v1/auth/login', {
    email: gym.users.OWNER!.email,
    password: gym.password,
  });
  expect(login.status).toBe(200);

  const plan = await ctx.db.raw.plan.create({
    data: {
      gymId: gym.gym.id,
      name: 'Pase mensual listado',
      price: '40000.00',
      billingCycle: 'MONTHLY',
    },
  });

  const expiredPaid = await ctx.db.raw.member.create({
    data: {
      gymId: gym.gym.id,
      branchId: gym.branch.id,
      memberNumber: 1,
      firstName: 'Período',
      lastName: 'Saldado',
      documentType: 'DNI',
      documentNumber: '41111111',
      balance: '0.00',
    },
  });
  expiredPaidId = expiredPaid.id;
  await ctx.db.raw.membership.create({
    data: {
      gymId: gym.gym.id,
      memberId: expiredPaid.id,
      branchId: gym.branch.id,
      planId: plan.id,
      status: 'EXPIRED',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-30'),
      pricePaid: '40000.00',
    },
  });

  const renewed = await ctx.db.raw.member.create({
    data: {
      gymId: gym.gym.id,
      branchId: gym.branch.id,
      memberNumber: 2,
      firstName: 'Período',
      lastName: 'Renovado',
      documentType: 'DNI',
      documentNumber: '42222222',
      balance: '0.00',
    },
  });
  renewedId = renewed.id;
  await ctx.db.raw.membership.createMany({
    data: [
      {
        gymId: gym.gym.id,
        memberId: renewed.id,
        branchId: gym.branch.id,
        planId: plan.id,
        status: 'EXPIRED',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-30'),
        pricePaid: '40000.00',
      },
      {
        gymId: gym.gym.id,
        memberId: renewed.id,
        branchId: gym.branch.id,
        planId: plan.id,
        status: 'ACTIVE',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-30'),
        pricePaid: '40000.00',
      },
    ],
  });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

describe('GET /members', () => {
  it('expone el período vencido separado del saldo y no confunde renovados', async () => {
    const response = await client.get('/api/v1/members?page=1&limit=100');
    expect(response.status).toBe(200);
    const body = response.body as {
      data: Array<{
        id: string;
        activeMembership: unknown;
        latestMembership: {
          planName: string;
          status: string;
          startDate: string;
          endDate: string | null;
        } | null;
        balance: string;
      }>;
    };
    const expired = body.data.find((member) => member.id === expiredPaidId);
    const renewed = body.data.find((member) => member.id === renewedId);

    expect(expired).toMatchObject({
      activeMembership: null,
      latestMembership: {
        planName: 'Pase mensual listado',
        status: 'EXPIRED',
        startDate: '2026-08-01',
        endDate: '2026-08-30',
      },
      balance: '0.00',
    });
    expect(renewed?.latestMembership).toMatchObject({ status: 'ACTIVE' });
  });

  it('el segmento Vencidos sólo devuelve socios sin un período activo', async () => {
    const response = await client.get(
      '/api/v1/members?membershipStatus=EXPIRED&page=1&limit=100',
    );
    expect(response.status).toBe(200);
    const ids = (response.body as { data: Array<{ id: string }> }).data.map((member) => member.id);
    expect(ids).toContain(expiredPaidId);
    expect(ids).not.toContain(renewedId);
  });
});
