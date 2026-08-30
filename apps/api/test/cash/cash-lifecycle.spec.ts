import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';

/**
 * Ciclo completo de caja end-to-end (M5): abrir sesión, cobrar una membresía
 * en modo NOW (crea CashMovement + LedgerEntry CREDIT que cancela el DEBIT
 * del alta → balance neto 0), registrar un ingreso extra, revertir un
 * movement, y cerrar la sesión con arqueo.
 *
 * Este spec sirve de red mínima integradora sobre las tres piezas nuevas
 * (cash-session, cash-movement, memberships mode NOW). Los edge cases
 * granulares de cada una (concurrencia de apertura, reversa doble, arqueo
 * con diferencia, etc.) quedan como deuda declarada para una segunda pasada
 * si el MVP se estabiliza.
 */

let ctx: TestApp;
let gym: Awaited<ReturnType<typeof seedGymWithUsers>>;

beforeAll(async () => {
  ctx = await createTestApp('cash-lifecycle');
  gym = await seedGymWithUsers(ctx.db, { slug: 'cash-lifecycle-gym' });
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

const idem = (): Record<string, string> => ({ 'Idempotency-Key': randomUUID() });

async function ensureCashRegister(): Promise<string> {
  const existing = await ctx.db.raw.cashRegister.findFirst({
    where: { gymId: gym.gym.id, branchId: gym.branch.id, isActive: true },
  });
  if (existing) return existing.id;
  const created = await ctx.db.raw.cashRegister.create({
    data: { gymId: gym.gym.id, branchId: gym.branch.id, name: 'Caja principal' },
  });
  return created.id;
}

async function ensureCashPaymentMethod(): Promise<string> {
  const existing = await ctx.db.raw.paymentMethod.findFirst({
    where: { gymId: gym.gym.id, code: 'CASH' },
  });
  if (existing) return existing.id;
  const created = await ctx.db.raw.paymentMethod.create({
    data: { gymId: gym.gym.id, code: 'CASH', name: 'Efectivo', countsAsCash: true },
  });
  return created.id;
}

async function ensureExpenseConcept(): Promise<string> {
  const existing = await ctx.db.raw.cashConcept.findFirst({
    where: { gymId: gym.gym.id, code: 'CLEANING' },
  });
  if (existing) return existing.id;
  const created = await ctx.db.raw.cashConcept.create({
    data: { gymId: gym.gym.id, code: 'CLEANING', name: 'Limpieza', type: 'EXPENSE' },
  });
  return created.id;
}

async function createMember(): Promise<string> {
  const owner = await loginAs('OWNER');
  const res = await owner.post(
    '/api/v1/members',
    {
      firstName: 'Ciclo',
      lastName: 'Caja',
      documentType: 'DNI',
      documentNumber: '30111222',
      branchId: gym.branch.id,
    },
    idem(),
  );
  expect(res.status).toBe(201);
  return (res.body as { id: string }).id;
}

async function createMonthlyPlan(): Promise<string> {
  const owner = await loginAs('OWNER');
  const res = await owner.post(
    '/api/v1/plans',
    { name: 'Mensual libre', price: '15000.00', billingCycle: 'MONTHLY' },
    idem(),
  );
  expect(res.status).toBe(201);
  return (res.body as { id: string }).id;
}

describe('ciclo completo de caja + membresía mode NOW', () => {
  it('abre sesión → cobra membresía → registra egreso → revierte → cierra', async () => {
    const [registerId, cashMethodId, expenseConceptId, memberId, planId] = await Promise.all([
      ensureCashRegister(),
      ensureCashPaymentMethod(),
      ensureExpenseConcept(),
      createMember(),
      createMonthlyPlan(),
    ]);

    const owner = await loginAs('OWNER');

    // 1) Sin sesión abierta, /current devuelve null.
    const currentBefore = await owner.get('/api/v1/cash/sessions/current');
    expect(currentBefore.status).toBe(200);
    expect(currentBefore.body).toBeNull();

    // 2) Abrir sesión con fondo 5000.
    const openRes = await owner.post(
      '/api/v1/cash/sessions/open',
      { cashRegisterId: registerId, openingAmount: '5000.00' },
      idem(),
    );
    expect(openRes.status).toBe(201);
    const openBody = openRes.body as { session: { id: string; status: string } };
    expect(openBody.session.status).toBe('OPEN');
    const sessionId = openBody.session.id;

    // 3) Cobrar membresía en modo NOW: se crea membership + LedgerEntry
    //    DEBIT (alta) + LedgerEntry CREDIT (pago) + CashMovement INCOME.
    const membershipRes = await owner.post(
      `/api/v1/members/${memberId}/memberships`,
      {
        planId,
        branchId: gym.branch.id,
        startDate: '2026-03-01',
        charge: { mode: 'NOW', paymentMethodId: cashMethodId, amount: '15000.00' },
      },
      idem(),
    );
    expect(membershipRes.status).toBe(201);
    const mBody = membershipRes.body as {
      membership: { id: string };
      ledgerEntry: { type: string; amount: string };
      cashMovement?: { id: string; type: string; amount: string };
    };
    expect(mBody.ledgerEntry.type).toBe('DEBIT');
    expect(mBody.cashMovement?.type).toBe('INCOME');
    expect(mBody.cashMovement?.amount).toBe('15000.00');

    // Balance del socio debe estar en cero (DEBIT 15000 cancelado por CREDIT 15000).
    const member = await ctx.db.raw.member.findFirstOrThrow({ where: { id: memberId } });
    expect(member.balance.toFixed(2)).toBe('0.00');

    // 4) Registrar un egreso adicional (limpieza).
    const expenseRes = await owner.post(
      '/api/v1/cash/movements',
      {
        cashSessionId: sessionId,
        type: 'EXPENSE',
        amount: '2000.00',
        paymentMethodId: cashMethodId,
        cashConceptId: expenseConceptId,
        detail: 'Insumos de limpieza',
      },
      idem(),
    );
    expect(expenseRes.status).toBe(201);
    const expenseBody = expenseRes.body as { status: string; movement: { id: string } };
    expect(expenseBody.status).toBe('CREATED');
    const expenseId = expenseBody.movement.id;

    // 5) Revertir el egreso.
    const reverseRes = await owner.post(
      `/api/v1/cash/movements/${expenseId}/reverse`,
      { reason: 'Compra cancelada por proveedor' },
      idem(),
    );
    expect(reverseRes.status).toBe(201);
    const reverseBody = reverseRes.body as {
      reversal: { type: string; reversalOfId: string };
      original: { isReversed: boolean };
    };
    expect(reverseBody.reversal.type).toBe('INCOME');
    expect(reverseBody.reversal.reversalOfId).toBe(expenseId);
    expect(reverseBody.original.isReversed).toBe(true);

    // 6) Listar movements: 3 filas (cobro membresía + egreso + reversa).
    const list = await owner.get('/api/v1/cash/movements');
    expect(list.status).toBe(200);
    const listBody = list.body as { data: unknown[] };
    expect(listBody.data.length).toBe(3);

    // 7) Cerrar la sesión declarando 20000 en efectivo (fondo 5000 + cobro
    //    15000 + egreso 2000 revertido = esperado 20000). Diferencia 0.
    const closeRes = await owner.post(
      '/api/v1/cash/sessions/close',
      { declared: [{ paymentMethodId: cashMethodId, amount: '20000.00' }] },
      idem(),
    );
    // Close usa @HttpCode default (200) por ser update de estado, no create.
    expect(closeRes.status).toBe(200);
    const closeBody = closeRes.body as {
      session: { status: string };
      details: Array<{
        paymentMethodId: string;
        expectedAmount: string;
        declaredAmount: string;
        difference: string;
      }>;
      differenceTotal: string;
    };
    expect(closeBody.session.status).toBe('CLOSED');
    expect(closeBody.details[0]?.expectedAmount).toBe('20000.00');
    expect(closeBody.details[0]?.declaredAmount).toBe('20000.00');
    expect(closeBody.details[0]?.difference).toBe('0.00');
    expect(closeBody.differenceTotal).toBe('0.00');

    // 8) Post-close, /current vuelve a ser null.
    const currentAfter = await owner.get('/api/v1/cash/sessions/current');
    expect(currentAfter.status).toBe(200);
    expect(currentAfter.body).toBeNull();
  });
});
