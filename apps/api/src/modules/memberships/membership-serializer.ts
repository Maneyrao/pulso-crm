import type { Membership as PrismaMembership, Prisma } from '@pulso/db';
import type { LedgerEntryType, LedgerReason } from '@pulso/db';
import { toDateOnly } from '../members/date-only.js';

/**
 * Forma de `Membership` para la API (`membershipSchema` en
 * `packages/contracts/src/memberships.ts`).
 *
 * `startDate` y `endDate` son columnas `@db.Date`: se normalizan a
 * `YYYY-MM-DD` acá para que el `DecimalSerializerInterceptor` global (que
 * convierte cualquier `Date` restante a un instante ISO) no las toque. Mismo
 * criterio que `members/member-serializer.ts`.
 *
 * `pricePaid` queda como `Prisma.Decimal`: el interceptor lo serializa a
 * string decimal en el borde HTTP.
 */
export interface MembershipDto {
  id: string;
  gymId: string;
  memberId: string;
  planId: string;
  branchId: string | null;
  status: PrismaMembership['status'];
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  renewalAnchorDay: number | null;
  nextRenewalDate: string | null;
  renewedFromId: string | null;
  pricePaid: PrismaMembership['pricePaid'];
  classesIncluded: number | null;
  classesRemaining: number | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function serializeMembership(m: PrismaMembership): MembershipDto {
  return {
    id: m.id,
    gymId: m.gymId,
    memberId: m.memberId,
    planId: m.planId,
    branchId: m.branchId,
    status: m.status,
    startDate: toDateOnly(m.startDate),
    endDate: toDateOnly(m.endDate),
    autoRenew: m.autoRenew,
    renewalAnchorDay: m.renewalAnchorDay,
    nextRenewalDate: toDateOnly(m.nextRenewalDate),
    renewedFromId: m.renewedFromId,
    pricePaid: m.pricePaid,
    classesIncluded: m.classesIncluded,
    classesRemaining: m.classesRemaining,
    cancelledAt: m.cancelledAt,
    cancelledReason: m.cancelledReason,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/**
 * Forma de `LedgerEntry` en la respuesta de `POST /members/:id/memberships`.
 * Se declara estructuralmente (no como `PrismaLedgerEntry`) para poder
 * aceptar el shape recortado que devuelve `members/ledger.ts::postLedgerEntry`
 * — no incluye `gymId`, `branchId` ni `createdByUserId` porque el contrato
 * (`ledgerEntrySchema`) tampoco los declara.
 */
export interface LedgerEntryLike {
  id: string;
  memberId: string;
  type: LedgerEntryType;
  reason: LedgerReason;
  amount: Prisma.Decimal;
  balanceAfter: Prisma.Decimal;
  description: string | null;
  membershipId: string | null;
  cashMovementId: string | null;
  reversalOfId: string | null;
  createdAt: Date;
}

export type LedgerEntryDto = LedgerEntryLike;

export function serializeLedgerEntry(entry: LedgerEntryLike): LedgerEntryDto {
  return {
    id: entry.id,
    memberId: entry.memberId,
    type: entry.type,
    reason: entry.reason,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    description: entry.description,
    membershipId: entry.membershipId,
    cashMovementId: entry.cashMovementId,
    reversalOfId: entry.reversalOfId,
    createdAt: entry.createdAt,
  };
}
