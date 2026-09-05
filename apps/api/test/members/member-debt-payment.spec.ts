import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MemberPaymentQuote } from '@pulso/contracts/cash';
import { createTestApp, seedGymWithUsers, TestClient, type TestApp } from '../harness.js';

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;
let other: Awaited<ReturnType<typeof seedGymWithUsers>>;
let client: TestClient;
let cash: string;
let transfer: string;
let card: string;
let seq = 0;

beforeAll(async () => {
  ctx = await createTestApp('member-debt-payment');
  gym = await seedGymWithUsers(ctx.db, { slug: 'debt-a' });
  other = await seedGymWithUsers(ctx.db, { slug: 'debt-b' });
  client = new TestClient(ctx.baseUrl);
  expect((await client.post('/api/v1/auth/login', { email: gym.users.OWNER!.email, password: gym.password })).status).toBe(200);
  const register = await ctx.db.raw.cashRegister.create({ data: { gymId: gym.gym.id, branchId: gym.branch.id, name: 'Recepcion' } });
  await ctx.db.raw.cashSession.create({ data: { gymId: gym.gym.id, branchId: gym.branch.id, cashRegisterId: register.id,
    openedByUserId: gym.users.OWNER!.id, openingAmount: '0.00', businessDate: new Date('2026-09-04') } });
  for (const code of ['CASH', 'TRANSFER', 'CREDIT']) {
    const method = await ctx.db.raw.paymentMethod.create({ data: { gymId: gym.gym.id, code, name: code, countsAsCash: code === 'CASH' } });
    if (code === 'CASH') cash = method.id;
    else if (code === 'TRANSFER') transfer = method.id;
    else card = method.id;
  }
}, 180_000);
afterAll(async () => { await ctx?.close(); });

async function memberWithDebt(periods = 1) {
  seq += 1;
  const member = await ctx.db.raw.member.create({ data: { gymId: gym.gym.id, branchId: gym.branch.id, memberNumber: seq,
    firstName: 'Test', lastName: 'Cobro', documentType: 'DNI', documentNumber: String(33000000 + seq), balance: String(-40000 * periods) } });
  const plan = await ctx.db.raw.plan.findFirst({ where: { gymId: gym.gym.id, name: 'Pase Zen' } }) ?? await ctx.db.raw.plan.create({ data: { gymId: gym.gym.id, name: 'Pase Zen', price: '40000.00', billingCycle: 'MONTHLY' } });
  for (let i = 0; i < periods; i++) {
    const membership = await ctx.db.raw.membership.create({ data: { gymId: gym.gym.id, memberId: member.id, branchId: gym.branch.id,
      planId: plan.id, startDate: new Date(`2026-0${8 + i}-01`), endDate: new Date(`2026-0${8 + i}-28`), pricePaid: '40000.00' } });
    await ctx.db.raw.ledgerEntry.create({ data: { gymId: gym.gym.id, memberId: member.id, membershipId: membership.id,
      type: 'DEBIT', reason: 'MEMBERSHIP_CHARGE', amount: '40000.00', balanceAfter: String(-40000 * (i + 1)) } });
  }
  return member.id;
}
async function quote(id: string, method = cash) {
  const response = await client.get(`/api/v1/members/${id}/payment-quote?paymentMethodId=${method}`);
  expect(response.status).toBe(200);
  return response.body as MemberPaymentQuote;
}
function pay(id: string, value: MemberPaymentQuote, method = cash, key = randomUUID()) {
  return client.post(`/api/v1/members/${id}/pay-debt`, { paymentMethodId: method, expectedTotal: value.total, ledgerVersion: value.ledgerVersion }, { 'Idempotency-Key': key });
}

describe('Cobro completo de deuda', () => {
  it('usa el importe del periodo, guarda historial y rechaza nuevo pago si ya no debe', async () => {
    const id = await memberWithDebt();
    const value = await quote(id);
    expect(value.total).toBe('40000.00');
    expect(value.lines[0]?.label).toBe('Pase Zen');
    const key = randomUUID();
    expect((await pay(id, value, cash, key)).status).toBe(201);
    expect((await pay(id, value, cash, key)).status).toBe(201);
    expect((await pay(id, value)).status).toBe(409);
    expect((await ctx.db.raw.member.findUniqueOrThrow({ where: { id } })).balance.toFixed(2)).toBe('0.00');
    expect(await ctx.db.raw.cashMovement.count({ where: { memberId: id } })).toBe(1);
    expect((await quote(id)).total).toBe('0.00');
    const history = await client.get(`/api/v1/members/${id}/payments`);
    expect(history.status).toBe(200);
    expect(JSON.stringify(history.body)).toContain('Pase Zen');
  });
  it('aplica $5000 por servicio solo por transferencia, nunca otra vez tras una reversa', async () => {
    const id = await memberWithDebt(2);
    const value = await quote(id, transfer);
    expect(value.surcharge).toBe('10000.00');
    expect(value.total).toBe('90000.00');
    const result = await pay(id, value, transfer);
    expect(result.status).toBe(201);
    const movements = await ctx.db.raw.cashMovement.findMany({ where: { memberId: id } });
    expect(movements).toHaveLength(2);
    const reversed = await client.post(`/api/v1/cash/movements/${movements[0]!.id}/reverse`, { reason: 'Cobro cargado por error de recepcion' }, { 'Idempotency-Key': randomUUID() });
    expect(reversed.status).toBe(201);
    const again = await quote(id, transfer);
    expect(again.total).toBe('45000.00');
    expect(again.surcharge).toBe('0.00');
  });
  it('aplica historicos no vinculados al periodo sin sobrecobrar', async () => {
    const id = await memberWithDebt(2);
    await ctx.db.raw.ledgerEntry.create({ data: { gymId: gym.gym.id, memberId: id, type: 'CREDIT', reason: 'PAYMENT', amount: '50000.00', balanceAfter: '-30000.00' } });
    await ctx.db.raw.member.update({ where: { id }, data: { balance: '-30000.00' } });
    const value = await quote(id);
    expect(value.total).toBe('30000.00');
    expect(value.lines).toHaveLength(1);
    expect((await pay(id, value)).status).toBe(201);
  });
  it('rechaza cotizacion vieja, importe arbitrario y tarjeta', async () => {
    const id = await memberWithDebt();
    const value = await quote(id);
    expect((await pay(id, { ...value, total: '1.00' })).status).toBe(409);
    expect((await client.post(`/api/v1/members/${id}/pay-debt`, { paymentMethodId: cash, expectedTotal: value.total,
      ledgerVersion: value.ledgerVersion, amount: '1.00' }, { 'Idempotency-Key': randomUUID() })).status).toBe(422);
    expect((await client.get(`/api/v1/members/${id}/payment-quote?paymentMethodId=${card}`)).status).toBe(422);
    expect(await ctx.db.raw.cashMovement.count({ where: { memberId: id } })).toBe(0);
  });
  it('dos claves concurrentes no duplican un cobro', async () => {
    const id = await memberWithDebt();
    const value = await quote(id);
    const a = pay(id, value);
    const b = pay(id, value);
    const results = [await a, await b];
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ctx.db.raw.cashMovement.count({ where: { memberId: id } })).toBe(1);
  });
  it('no accede a socios de otro gimnasio y no cobra sin caja propia', async () => {
    const id = await memberWithDebt();
    const foreign = new TestClient(ctx.baseUrl);
    await foreign.post('/api/v1/auth/login', { email: other.users.OWNER!.email, password: other.password });
    expect((await foreign.get(`/api/v1/members/${id}/payment-quote`)).status).toBe(404);
    const value = await quote(id);
    expect((await foreign.post(`/api/v1/members/${id}/pay-debt`, { paymentMethodId: cash, expectedTotal: value.total, ledgerVersion: value.ledgerVersion }, { 'Idempotency-Key': randomUUID() })).status).toBe(404);
    const noCash = new TestClient(ctx.baseUrl);
    await noCash.post('/api/v1/auth/login', { email: gym.users.RECEPTIONIST!.email, password: gym.password });
    expect((await noCash.post(`/api/v1/members/${id}/pay-debt`, { paymentMethodId: cash, expectedTotal: value.total, ledgerVersion: value.ledgerVersion }, { 'Idempotency-Key': randomUUID() })).status).toBe(409);
  });
});
