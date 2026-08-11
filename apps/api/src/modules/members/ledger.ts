import { Prisma, type PulsoTransactionClient } from '@pulso/db';
import { AppError } from '../../common/errors/app-error.js';

/**
 * Cuenta corriente del socio: postea un asiento y recalcula `Member.balance`
 * DENTRO de la misma transacción (regla no negociable).
 *
 * `Member.balance` es una CACHÉ; la verdad es la suma de `LedgerEntry`. Acá se
 * toma `SELECT ... FOR UPDATE` sobre la fila del socio antes de leer el saldo
 * vigente, así dos asientos concurrentes sobre el mismo socio no pisan el
 * saldo del otro.
 *
 * Reutilizable a propósito: el módulo de caja (cobros, reversas, pagos de
 * deuda) va a necesitar exactamente esta misma operación. Se exporta desde acá
 * para que no haya dos implementaciones del recálculo de saldo.
 */

export type LedgerEntryKind = 'DEBIT' | 'CREDIT';

export type LedgerReasonValue =
  | 'MEMBERSHIP_CHARGE'
  | 'PRODUCT_CHARGE'
  | 'ADJUSTMENT_CHARGE'
  | 'PAYMENT'
  | 'REFUND'
  | 'REVERSAL'
  | 'DISCOUNT';

export interface PostLedgerEntryInput {
  memberId: string;
  type: LedgerEntryKind;
  reason: LedgerReasonValue;
  /** Siempre positivo; el signo lo da `type`. */
  amount: Prisma.Decimal | string;
  description?: string | null;
  membershipId?: string | null;
  cashMovementId?: string | null;
  createdByUserId?: string | null;
  branchId?: string | null;
}

export interface PostLedgerEntryResult {
  entry: {
    id: string;
    memberId: string;
    type: LedgerEntryKind;
    reason: LedgerReasonValue;
    amount: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    description: string | null;
    membershipId: string | null;
    cashMovementId: string | null;
    reversalOfId: string | null;
    createdAt: Date;
  };
  balance: Prisma.Decimal;
}

export async function postLedgerEntry(
  tx: PulsoTransactionClient,
  gymId: string,
  input: PostLedgerEntryInput,
): Promise<PostLedgerEntryResult> {
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(0)) {
    throw new Error('El importe de un asiento de cuenta corriente tiene que ser positivo.');
  }

  // Lock pesimista sobre la fila del socio: nadie más puede leer/actualizar su
  // saldo hasta que esta transacción termine.
  const rows = await tx.$queryRaw<{ id: string; balance: Prisma.Decimal | string }[]>`
    SELECT "id", "balance" FROM "members"
    WHERE "id" = ${input.memberId}::uuid AND "gymId" = ${gymId}::uuid
    FOR UPDATE
  `;
  const member = rows[0];
  if (!member) {
    throw AppError.notFound('El socio');
  }

  const currentBalance = new Prisma.Decimal(member.balance);
  const delta = input.type === 'DEBIT' ? amount.neg() : amount;
  const newBalance = currentBalance.plus(delta);

  const entry = await tx.ledgerEntry.create({
    data: {
      gymId,
      memberId: input.memberId,
      type: input.type,
      reason: input.reason,
      amount,
      balanceAfter: newBalance,
      description: input.description ?? null,
      membershipId: input.membershipId ?? null,
      cashMovementId: input.cashMovementId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      branchId: input.branchId ?? null,
    },
  });

  await tx.member.update({
    where: { id: input.memberId },
    data: { balance: newBalance },
  });

  return { entry, balance: newBalance };
}

/**
 * Recalcula `Member.balance` desde cero, sumando todo `LedgerEntry`.
 *
 * No se usa en el camino feliz (ahí el saldo se mantiene incrementalmente en
 * `postLedgerEntry`), pero es la herramienta para verificar consistencia
 * (tests) o para reparar una caché desincronizada.
 */
export async function recalculateMemberBalance(
  tx: PulsoTransactionClient,
  gymId: string,
  memberId: string,
): Promise<Prisma.Decimal> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "members" WHERE "id" = ${memberId}::uuid AND "gymId" = ${gymId}::uuid FOR UPDATE
  `;
  if (!rows[0]) {
    throw AppError.notFound('El socio');
  }

  const sums = await tx.$queryRaw<{ type: LedgerEntryKind; total: string }[]>`
    SELECT "type", COALESCE(SUM("amount"), 0)::text AS total
    FROM "ledger_entries"
    WHERE "memberId" = ${memberId}::uuid AND "gymId" = ${gymId}::uuid
    GROUP BY "type"
  `;

  let balance = new Prisma.Decimal(0);
  for (const row of sums) {
    const total = new Prisma.Decimal(row.total);
    balance = row.type === 'DEBIT' ? balance.minus(total) : balance.plus(total);
  }

  await tx.member.update({ where: { id: memberId }, data: { balance } });
  return balance;
}
