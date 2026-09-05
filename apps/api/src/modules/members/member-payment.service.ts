import { Injectable } from '@nestjs/common';
import { Prisma, scoped, type PulsoTransactionClient } from '@pulso/db';
import type { MemberPaymentQuote, PayDebtRequest, PayDebtResponse } from '@pulso/contracts/cash';
import { TRANSFER_SURCHARGE } from '@pulso/config/billing';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest constructor injection
import { PrismaService } from '../../infra/prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest constructor injection
import { AuditService } from '../../common/audit/audit.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { requireOpenSessionForUser } from '../cash/lib/session-lookup.js';
import { runSerializable } from '../cash/lib/tx.helper.js';
import { ensureSystemConcept } from '../cash/lib/system-concepts.js';
import { serializeCashMovement } from '../cash/lib/cash-serializer.js';
import { postLedgerEntry } from './ledger.js';

const SURCHARGE_DESCRIPTION = 'Recargo por transferencia';

@Injectable()
export class MemberPaymentService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  quote(id: string, paymentMethodId?: string): Promise<MemberPaymentQuote> {
    return this.prisma.client.$transaction((tx) => this.buildQuote(tx, id, paymentMethodId), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  pay(id: string, input: PayDebtRequest): Promise<PayDebtResponse> {
    const ctx = TenantContextStore.require();
    return runSerializable(this.prisma.client, async (tx) => {
      await tx.$queryRaw`SELECT id FROM members WHERE id = ${id}::uuid AND "gymId" = ${ctx.gymId}::uuid FOR UPDATE`;
      const quote = await this.buildQuote(tx, id, input.paymentMethodId);
      if (new Prisma.Decimal(quote.debt).lte(0)) {
        throw AppError.conflict(ErrorCode.CONFLICT, 'Este socio no tiene deuda pendiente. Revisá su historial de pagos.');
      }
      if (quote.ledgerVersion !== input.ledgerVersion || !new Prisma.Decimal(quote.total).eq(input.expectedTotal)) {
        throw AppError.conflict(ErrorCode.CONFLICT, 'El saldo cambió. Actualizá el importe antes de confirmar el pago.');
      }
      const session = await requireOpenSessionForUser(tx, ctx.userId);
      TenantContextStore.requireBranch(session.branchId);
      await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${session.id}::uuid FOR UPDATE`;
      const open = await tx.cashSession.findFirst({ where: { id: session.id, status: 'OPEN' } });
      if (!open) throw AppError.conflict(ErrorCode.CASH_SESSION_CLOSED, 'La caja se cerró. Abrí una caja para cobrar.');
      const concept = await ensureSystemConcept(tx, 'DEBT_PAYMENT');
      const cashMovements: PayDebtResponse['cashMovements'] = [];
      for (const line of quote.lines) {
        const fee = new Prisma.Decimal(line.surcharge);
        if (fee.gt(0)) {
          await postLedgerEntry(tx, ctx.gymId, {
            memberId: id, membershipId: line.membershipId, type: 'DEBIT', reason: 'ADJUSTMENT_CHARGE',
            amount: fee, description: SURCHARGE_DESCRIPTION, branchId: session.branchId, createdByUserId: ctx.userId,
          });
        }
        const movement = await tx.cashMovement.create({ data: scoped({
          cashSessionId: session.id, type: 'INCOME', amount: new Prisma.Decimal(line.amount).plus(fee),
          paymentMethodId: input.paymentMethodId, cashConceptId: concept.id, memberId: id,
          membershipId: line.membershipId, description: `Pago: ${line.label}`, createdByUserId: ctx.userId,
        }) });
        await postLedgerEntry(tx, ctx.gymId, {
          memberId: id, membershipId: line.membershipId, cashMovementId: movement.id,
          type: 'CREDIT', reason: 'PAYMENT', amount: movement.amount, description: movement.description,
          branchId: session.branchId, createdByUserId: ctx.userId,
        });
        await this.audit.recordIn(tx, { action: 'CASH_MOVEMENT_CREATED', resourceType: 'CashMovement', resourceId: movement.id,
          after: { memberId: id, membershipId: line.membershipId, amount: movement.amount.toFixed(2), paymentMethodId: input.paymentMethodId }, branchId: session.branchId });
        cashMovements.push({ ...serializeCashMovement(movement), amount: movement.amount.toFixed(2), createdAt: movement.createdAt.toISOString() });
      }
      const member = await tx.member.findFirstOrThrow({ where: { id } });
      return { cashMovements, balance: member.balance.toFixed(2) };
    });
  }

  private async buildQuote(tx: PulsoTransactionClient, id: string, paymentMethodId?: string): Promise<MemberPaymentQuote> {
    const member = await tx.member.findFirst({ where: { id, deletedAt: null } });
    if (!member) throw AppError.notFound('El socio');
    let methodCode = 'CASH';
    if (paymentMethodId) {
      const method = await tx.paymentMethod.findFirst({ where: { id: paymentMethodId, isActive: true } });
      if (!method) throw AppError.unprocessable(ErrorCode.VALIDATION_ERROR, 'El medio de pago no está disponible.');
      if (!['CASH', 'QR', 'MERCADO_PAGO', 'MERCADOPAGO', 'TRANSFER'].includes(method.code)) {
        throw AppError.unprocessable(ErrorCode.VALIDATION_ERROR, 'Usá efectivo, Mercado Pago o transferencia.');
      }
      methodCode = method.code;
    }
    const entries = await tx.ledgerEntry.findMany({ where: { memberId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { membership: { include: { plan: true } } } });
    const balance = entries.reduce((sum, entry) => entry.type === 'DEBIT' ? sum.minus(entry.amount) : sum.plus(entry.amount), new Prisma.Decimal(0));
    if (!balance.eq(member.balance)) {
      throw AppError.conflict(ErrorCode.CONFLICT, 'La cuenta corriente necesita conciliación. No se registró ningún cobro.');
    }
    const quote: MemberPaymentQuote = { balance: balance.toFixed(2), ledgerVersion: entries.at(-1)?.id ?? null,
      debt: Prisma.Decimal.max(0, balance.neg()).toFixed(2), surcharge: '0.00', total: '0.00', lines: [] };
    if (balance.gte(0)) return quote;

    // Unlinked historical credits are applied FIFO to outstanding periods.
    const groups = new Map<string | null, { amount: Prisma.Decimal; entry: typeof entries[number]; feeApplied: boolean }>();
    for (const entry of entries) {
      const group = groups.get(entry.membershipId) ?? { amount: new Prisma.Decimal(0), entry, feeApplied: false };
      group.amount = entry.type === 'DEBIT' ? group.amount.plus(entry.amount) : group.amount.minus(entry.amount);
      group.feeApplied ||= entry.type === 'DEBIT' && entry.description === SURCHARGE_DESCRIPTION;
      groups.set(entry.membershipId, group);
    }
    const legacyTransfers = await tx.cashMovement.findMany({ where: { memberId: id, membershipId: { not: null }, type: 'INCOME',
      paymentMethod: { code: 'TRANSFER' } }, select: { membershipId: true } });
    const transferred = new Set(legacyTransfers.map((row) => row.membershipId));
    let credit = [...groups.values()].reduce((sum, group) => group.amount.lt(0) ? sum.minus(group.amount) : sum, new Prisma.Decimal(0));
    for (const [membershipId, group] of groups) {
      if (group.amount.lte(0)) continue;
      const applied = Prisma.Decimal.min(credit, group.amount);
      credit = credit.minus(applied);
      const amount = group.amount.minus(applied);
      if (amount.lte(0)) continue;
      const membership = group.entry.membership;
      const surcharge = methodCode === 'TRANSFER' && membershipId && !group.feeApplied && !transferred.has(membershipId) ? TRANSFER_SURCHARGE : '0.00';
      quote.lines.push({ membershipId, label: membership?.plan.name ?? 'Saldo de cuenta corriente',
        startDate: membership?.startDate.toISOString().slice(0, 10) ?? null,
        endDate: membership?.endDate?.toISOString().slice(0, 10) ?? null,
        amount: amount.toFixed(2), surcharge });
    }
    quote.surcharge = quote.lines.reduce((sum, line) => sum.plus(line.surcharge), new Prisma.Decimal(0)).toFixed(2);
    quote.total = new Prisma.Decimal(quote.debt).plus(quote.surcharge).toFixed(2);
    return quote;
  }
}
