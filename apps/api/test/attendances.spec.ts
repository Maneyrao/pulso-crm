import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from './harness.js';

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('attendances');
  gym = await seedGymWithUsers(ctx.db, { slug: 'attendances-a' });
}, 180_000);

afterAll(async () => {
  await ctx?.close();
});

async function loginOwner(): Promise<TestClient> {
  const client = new TestClient(ctx.baseUrl);
  const res = await client.post('/api/v1/auth/login', {
    email: gym.users['OWNER']!.email,
    password: gym.password,
  });
  expect(res.status).toBe(200);
  return client;
}

describe('GET /attendances', () => {
  it('lista asistencias reales con socio, sede y plan para el frontend', async () => {
    const member = await ctx.db.raw.member.create({
      data: {
        gymId: gym.gym.id,
        branchId: gym.branch.id,
        memberNumber: 1,
        firstName: 'Lucía',
        lastName: 'Pérez',
        documentType: 'DNI',
        documentNumber: '30123456',
      },
    });
    const plan = await ctx.db.raw.plan.create({
      data: {
        gymId: gym.gym.id,
        name: 'Musculación',
        price: '28500.00',
        billingCycle: 'MONTHLY',
      },
    });
    const membership = await ctx.db.raw.membership.create({
      data: {
        gymId: gym.gym.id,
        branchId: gym.branch.id,
        memberId: member.id,
        planId: plan.id,
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        endDate: new Date('2026-08-31T00:00:00.000Z'),
        pricePaid: '28500.00',
      },
    });
    const attendance = await ctx.db.raw.attendance.create({
      data: {
        gymId: gym.gym.id,
        branchId: gym.branch.id,
        memberId: member.id,
        membershipId: membership.id,
        method: 'DOCUMENT',
        occurredOn: new Date('2026-08-20T00:00:00.000Z'),
        occurredAt: new Date('2026-08-20T21:30:00.000Z'),
      },
    });

    const owner = await loginOwner();
    const res = await owner.get(
      `/api/v1/attendances?branchId=${gym.branch.id}&from=2026-08-20&to=2026-08-20&limit=10`,
    );

    expect(res.status).toBe(200);
    const body = res.body as {
      data: Array<{
        id: string;
        occurredOn: string;
        method: string;
        branch: { name: string };
        member: { firstName: string; lastName: string; documentMasked: string };
        membership: { planName: string } | null;
      }>;
      pageInfo: { total: number };
    };
    expect(body.pageInfo.total).toBe(1);
    expect(body.data[0]).toMatchObject({
      id: attendance.id,
      occurredOn: '2026-08-20',
      method: 'DOCUMENT',
      branch: { name: 'Sede Única' },
      member: { firstName: 'Lucía', lastName: 'Pérez', documentMasked: '30123456' },
      membership: { planName: 'Musculación' },
    });
  });
});
