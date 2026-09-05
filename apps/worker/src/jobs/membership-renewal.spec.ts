import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, seedMinimalGym, type TestDatabase } from '@pulso/db/testing';
import type { Prisma } from '@pulso/db';
import pino from 'pino';
import { renewMemberships } from './membership-renewal.js';
import { expireMemberships } from './membership-expiration.js';

let db: TestDatabase;
const logger = pino({ level: 'silent' });
let sequence = 0;

beforeAll(async () => {
  db = await createTestDatabase('monthly-renewal');
}, 180_000);
afterAll(async () => {
  await db?.destroy();
});

async function fixture(overrides: Partial<Prisma.MembershipUncheckedCreateInput> = {}) {
  const { gym, branch } = await seedMinimalGym(db.raw, { slug: `renewal-${sequence++}` });
  const member = await db.raw.member.create({
    data: {
      gymId: gym.id,
      branchId: branch.id,
      memberNumber: 1,
      firstName: 'Test',
      lastName: 'Renewal',
      documentType: 'DNI',
      documentNumber: '99990000',
      balance: '-40000.00',
    },
  });
  const plan = await db.raw.plan.create({
    data: {
      gymId: gym.id,
      name: 'Mensual',
      billingCycle: 'MONTHLY',
      price: '40000.00',
      durationDays: 30,
    },
  });
  const period = await db.raw.membership.create({
    data: {
      gymId: gym.id,
      branchId: branch.id,
      memberId: member.id,
      planId: plan.id,
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-30'),
      pricePaid: '40000.00',
      autoRenew: true,
      renewalAnchorDay: 1,
      nextRenewalDate: new Date('2026-10-01'),
      ...overrides,
    },
  });
  await db.raw.ledgerEntry.create({
    data: {
      gymId: gym.id,
      memberId: member.id,
      membershipId: period.id,
      type: 'DEBIT',
      reason: 'MEMBERSHIP_CHARGE',
      amount: '40000.00',
      balanceAfter: '-40000.00',
    },
  });
  return { gym, branch, member, plan, period };
}

const run = (now = '2026-10-01T12:00:00Z') =>
  renewMemberships({ prisma: db.raw, logger, now: new Date(now) });
const read = (id: string) => db.raw.membership.findUniqueOrThrow({ where: { id } });

describe('renovacion mensual persistida', () => {
  it('crea cuota DEBT al precio vigente sin caja; no modifica historicos', async () => {
    const f = await fixture();
    await db.raw.plan.update({ where: { id: f.plan.id }, data: { price: '45000.25' } });
    const ledgerBefore = await db.raw.ledgerEntry.findMany({
      where: { membershipId: f.period.id },
    });
    await run();
    const child = await db.raw.membership.findFirstOrThrow({
      where: { renewedFromId: f.period.id },
    });
    expect(child).toMatchObject({
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
      autoRenew: true,
      renewalAnchorDay: 1,
      nextRenewalDate: new Date('2026-11-01'),
    });
    expect(child.pricePaid.toFixed(2)).toBe('45000.25');
    const previous = await read(f.period.id);
    expect(previous.pricePaid.toFixed(2)).toBe('40000.00');
    expect(previous.startDate).toEqual(f.period.startDate);
    expect(previous.endDate).toEqual(f.period.endDate);
    expect(previous.autoRenew).toBe(false);
    expect(await db.raw.ledgerEntry.findMany({ where: { membershipId: f.period.id } })).toEqual(
      ledgerBefore,
    );
    expect(
      (await db.raw.member.findUniqueOrThrow({ where: { id: f.member.id } })).balance.toFixed(2),
    ).toBe('-85000.25');
    expect(await db.raw.cashMovement.count({ where: { memberId: f.member.id } })).toBe(0);
    expect(
      await db.raw.auditEvent.count({
        where: { resourceId: child.id, action: 'MEMBERSHIP_RENEWED' },
      }),
    ).toBe(1);
  });

  it('20 workers concurrentes y reintento crean un solo periodo y DEBIT', async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 20 }, () => run()));
    expect(results.every((r) => r.failures === 0)).toBe(true);
    await run();
    expect(await db.raw.membership.count({ where: { renewedFromId: f.period.id } })).toBe(1);
    expect(await db.raw.ledgerEntry.count({ where: { memberId: f.member.id } })).toBe(2);
    expect(
      (await db.raw.member.findUniqueOrThrow({ where: { id: f.member.id } })).balance.toFixed(2),
    ).toBe('-80000.00');
  });

  it('no renueva hasta medianoche de la sede; expiry previo no impide renovar', async () => {
    const f = await fixture();
    await run('2026-10-01T02:59:59Z');
    expect(await db.raw.membership.count({ where: { renewedFromId: f.period.id } })).toBe(0);
    await expireMemberships({ prisma: db.raw, logger, now: new Date('2026-10-01T03:00:00Z') });
    expect((await read(f.period.id)).status).toBe('EXPIRED');
    await run('2026-10-01T03:00:00Z');
    expect(await db.raw.membership.count({ where: { renewedFromId: f.period.id } })).toBe(1);
  });

  it('mantiene ancla 31 al cruzar febrero y marzo', async () => {
    const f = await fixture({
      startDate: new Date('2028-01-31'),
      endDate: new Date('2028-02-28'),
      renewalAnchorDay: 31,
      nextRenewalDate: new Date('2028-02-29'),
    });
    await run('2028-02-29T12:00:00Z');
    const feb = await db.raw.membership.findFirstOrThrow({ where: { renewedFromId: f.period.id } });
    expect(feb.endDate).toEqual(new Date('2028-03-30'));
    expect(feb.nextRenewalDate).toEqual(new Date('2028-03-31'));
    await run('2028-03-31T12:00:00Z');
    const march = await db.raw.membership.findFirstOrThrow({ where: { renewedFromId: feb.id } });
    expect(march.nextRenewalDate).toEqual(new Date('2028-04-30'));
  });

  it('caida prolongada crea solo periodo actual, no backlog', async () => {
    const f = await fixture({
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
      nextRenewalDate: new Date('2026-02-01'),
    });
    await run('2026-10-20T12:00:00Z');
    const child = await db.raw.membership.findFirstOrThrow({
      where: { renewedFromId: f.period.id },
    });
    expect(child.startDate).toEqual(new Date('2026-10-01'));
    expect(child.endDate).toEqual(new Date('2026-10-31'));
    expect(await db.raw.membership.count({ where: { memberId: f.member.id } })).toBe(2);
    expect(await db.raw.ledgerEntry.count({ where: { memberId: f.member.id } })).toBe(2);
    const audit = await db.raw.auditEvent.findFirstOrThrow({
      where: { resourceId: child.id, action: 'MEMBERSHIP_RENEWED' },
    });
    expect(audit.after).toMatchObject({ pastPeriodsSkipped: 8 });
  });

  it.each([
    'CANCELLED',
    'SUSPENDED',
    'MEMBER_INACTIVE',
    'PLAN_INACTIVE',
    'PLAN_CYCLE',
    'BRANCH_INACTIVE',
    'REPLACED',
    'OPT_OUT',
  ])('no genera deuda para %s', async (reason) => {
    const f = await fixture();
    if (reason === 'CANCELLED' || reason === 'SUSPENDED') {
      await db.raw.membership.update({ where: { id: f.period.id }, data: { status: reason } });
    } else if (reason === 'MEMBER_INACTIVE') {
      await db.raw.member.update({ where: { id: f.member.id }, data: { status: 'INACTIVE' } });
    } else if (reason === 'PLAN_INACTIVE') {
      await db.raw.plan.update({ where: { id: f.plan.id }, data: { isActive: false } });
    } else if (reason === 'PLAN_CYCLE') {
      await db.raw.plan.update({ where: { id: f.plan.id }, data: { billingCycle: 'ANNUAL' } });
    } else if (reason === 'BRANCH_INACTIVE') {
      await db.raw.branch.update({ where: { id: f.branch.id }, data: { isActive: false } });
    } else if (reason === 'OPT_OUT') {
      await db.raw.membership.update({
        where: { id: f.period.id },
        data: { autoRenew: false, nextRenewalDate: null },
      });
    } else {
      await db.raw.membership.create({
        data: {
          gymId: f.gym.id,
          memberId: f.member.id,
          planId: f.plan.id,
          branchId: f.branch.id,
          startDate: new Date('2026-10-01'),
          endDate: new Date('2026-10-31'),
          pricePaid: '40000.00',
        },
      });
    }
    await run();
    expect(await db.raw.membership.count({ where: { renewedFromId: f.period.id } })).toBe(0);
    expect(await db.raw.ledgerEntry.count({ where: { memberId: f.member.id } })).toBe(1);
    expect((await read(f.period.id)).autoRenew).toBe(false);
  });

  it('unique y FK impiden doble sucesor y linkage entre gimnasios/socios', async () => {
    const a = await fixture();
    const b = await fixture();
    await run();
    const data = {
      gymId: a.gym.id,
      memberId: a.member.id,
      planId: a.plan.id,
      startDate: new Date('2027-01-01'),
      endDate: new Date('2027-01-31'),
      pricePaid: '100.00',
      renewedFromId: a.period.id,
      status: 'EXPIRED' as const,
    };
    await expect(db.raw.membership.create({ data })).rejects.toThrow();
    await expect(
      db.raw.membership.create({ data: { ...data, renewedFromId: b.period.id } }),
    ).rejects.toThrow();
  });

  it('fallo contable revierte periodo, agenda y saldo; reintento puede completar', async () => {
    const f = await fixture();
    await db.raw.member.update({
      where: { id: f.member.id },
      data: { balance: '-999999999999.99' },
    });
    const result = await run();
    expect(result.failures).toBeGreaterThan(0);
    expect((await read(f.period.id)).autoRenew).toBe(true);
    expect(await db.raw.membership.count({ where: { renewedFromId: f.period.id } })).toBe(0);
    expect(await db.raw.ledgerEntry.count({ where: { memberId: f.member.id } })).toBe(1);
    await db.raw.member.update({ where: { id: f.member.id }, data: { balance: '-40000.00' } });
    await run();
    expect(await db.raw.membership.count({ where: { renewedFromId: f.period.id } })).toBe(1);
  });
});
