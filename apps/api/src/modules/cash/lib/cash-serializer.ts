import type {
  CashMovement as PrismaCashMovement,
  CashSession as PrismaCashSession,
  CashSessionClosingDetail as PrismaClosingDetail,
  Prisma,
} from '@pulso/db';
import { toDateOnly } from '../../members/date-only.js';

/**
 * Forma de `CashSession` en la API (`cashSessionSchema` en
 * `packages/contracts/src/cash.ts`).
 *
 * `businessDate` es `@db.Date`: se normaliza a `YYYY-MM-DD` acá para que el
 * `DecimalSerializerInterceptor` global (que convierte cualquier `Date`
 * restante a un instante ISO) no la toque. Mismo criterio que
 * `memberships/membership-serializer.ts` con `startDate`/`endDate`.
 *
 * `openingAmount`, `expectedCash`, `declaredCash`, `cashDifference` quedan
 * como `Prisma.Decimal`: el interceptor los serializa a string decimal en
 * el borde HTTP.
 */
export interface CashSessionDto {
  id: string;
  gymId: string;
  branchId: string;
  cashRegisterId: string;
  status: PrismaCashSession['status'];
  openedByUserId: string;
  openedAt: Date;
  openingAmount: Prisma.Decimal;
  openingNotes: string | null;
  closedByUserId: string | null;
  closedAt: Date | null;
  closingNotes: string | null;
  expectedCash: Prisma.Decimal | null;
  declaredCash: Prisma.Decimal | null;
  cashDifference: Prisma.Decimal | null;
  businessDate: string;
}

export function serializeCashSession(s: PrismaCashSession): CashSessionDto {
  return {
    id: s.id,
    gymId: s.gymId,
    branchId: s.branchId,
    cashRegisterId: s.cashRegisterId,
    status: s.status,
    openedByUserId: s.openedByUserId,
    openedAt: s.openedAt,
    openingAmount: s.openingAmount,
    openingNotes: s.openingNotes,
    closedByUserId: s.closedByUserId,
    closedAt: s.closedAt,
    closingNotes: s.closingNotes,
    expectedCash: s.expectedCash,
    declaredCash: s.declaredCash,
    cashDifference: s.cashDifference,
    businessDate: toDateOnly(s.businessDate),
  };
}

export interface CashMovementDto {
  id: string;
  gymId: string;
  cashSessionId: string;
  type: PrismaCashMovement['type'];
  amount: Prisma.Decimal;
  paymentMethodId: string;
  cashConceptId: string;
  description: string | null;
  memberId: string | null;
  member: { id: string; firstName: string; lastName: string } | null;
  membershipId: string | null;
  reversalOfId: string | null;
  isReversed: boolean;
  reversalReason: string | null;
  createdByUserId: string;
  createdAt: Date;
}

type CashMovementWithMember = PrismaCashMovement & {
  member?: { id: string; firstName: string; lastName: string } | null;
};

export function serializeCashMovement(m: CashMovementWithMember): CashMovementDto {
  return {
    id: m.id,
    gymId: m.gymId,
    cashSessionId: m.cashSessionId,
    type: m.type,
    amount: m.amount,
    paymentMethodId: m.paymentMethodId,
    cashConceptId: m.cashConceptId,
    description: m.description,
    memberId: m.memberId,
    member: m.member ?? null,
    membershipId: m.membershipId,
    reversalOfId: m.reversalOfId,
    isReversed: m.isReversed,
    reversalReason: m.reversalReason,
    createdByUserId: m.createdByUserId,
    createdAt: m.createdAt,
  };
}

export interface ClosingDetailDto {
  paymentMethodId: string;
  expectedAmount: Prisma.Decimal;
  declaredAmount: Prisma.Decimal;
  difference: Prisma.Decimal;
}

export function serializeClosingDetail(d: PrismaClosingDetail): ClosingDetailDto {
  return {
    paymentMethodId: d.paymentMethodId,
    expectedAmount: d.expectedAmount,
    declaredAmount: d.declaredAmount,
    difference: d.difference,
  };
}
