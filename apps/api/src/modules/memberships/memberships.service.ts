import { Injectable } from '@nestjs/common';
import { Prisma, scoped } from '@pulso/db';
import {
  addDays,
  compareMoney,
  membershipEndDate,
  nextMonthlyDateAfter,
  quoteEnrollmentPrice,
  toBusinessDate,
} from '@pulso/config';
import type { PulsoTransactionClient } from '@pulso/db';
import type {
  CancelMembershipRequest,
  CreateMembershipRequest,
  ConfigureMembershipRenewalRequest,
} from '@pulso/contracts/memberships';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService } from '../../common/audit/audit.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { mentionsConstraint } from '../members/db-errors.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { fromDateOnly, toDateOnly } from '../members/date-only.js';
import { postLedgerEntry } from '../members/ledger.js';
import { requireOpenSessionForUser } from '../cash/lib/session-lookup.js';
import { ensureSystemConcept } from '../cash/lib/system-concepts.js';
import { serializeCashMovement, type CashMovementDto } from '../cash/lib/cash-serializer.js';
import {
  serializeLedgerEntry,
  serializeMembership,
  type LedgerEntryDto,
  type MembershipDto,
} from './membership-serializer.js';

/**
 * Respuesta de `POST /members/:id/memberships`. Espeja
 * `createMembershipResponseSchema` (packages/contracts/src/memberships.ts)
 * MENOS la conversión final de `Decimal → string` de los importes, que hace
 * el `DecimalSerializerInterceptor` en el borde HTTP. `cashMovement` aparece
 * sólo con `mode: NOW` (M5).
 */
export interface CreateMembershipResult {
  membership: MembershipDto;
  ledgerEntry: LedgerEntryDto;
  cashMovement?: CashMovementDto;
}

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── POST /members/:id/memberships ─────────────────────────────────────

  async create(memberId: string, input: CreateMembershipRequest): Promise<CreateMembershipResult> {
    const ctx = TenantContextStore.require();
    const branchId = TenantContextStore.requireBranch(input.branchId);

    // `mode: NOW`: exige sesión OPEN del usuario en la sede. La superficie del
    // check corre ANTES de la tx principal para responder 409 rápido sin
    // levantar locks — la tx re-toma el estado.
    if (input.charge.mode === 'NOW') {
      if (!ctx.permissions.has('cash:operate') || !ctx.permissions.has('payment:collect')) {
        throw AppError.forbidden();
      }
      await requireOpenSessionForUser(
        {
          cashSession: {
            findFirst: (args: Prisma.CashSessionFindFirstArgs) =>
              this.prisma.client.cashSession.findFirst(args),
          },
        },
        ctx.userId,
        branchId,
      );
    }

    try {
      const result = await this.prisma.client.$transaction(async (tx) => {
        // Lock order: cash session -> member -> membership. Cash close cannot
        // race an immediate collection; renewals use the same member lock.
        if (input.charge.mode === 'NOW') {
          await tx.$queryRaw`
            SELECT "id" FROM "cash_sessions"
            WHERE "gymId" = ${ctx.gymId}::uuid AND "openedByUserId" = ${ctx.userId}::uuid
              AND "branchId" = ${branchId}::uuid AND "status" = 'OPEN' FOR UPDATE
          `;
          await requireOpenSessionForUser(
            {
              cashSession: {
                findFirst: (args: Prisma.CashSessionFindFirstArgs) =>
                  tx.cashSession.findFirst(args),
              },
            },
            ctx.userId,
            branchId,
          );
        }
        await lockMember(tx, ctx.gymId, memberId);

        // Cross-tenant: las tres lecturas salen scoped por gymId (extension), así
        // que un id ajeno responde 404 igual que uno inexistente (API_CONTRACTS §1.3).
        const member = await tx.member.findFirst({
          where: { id: memberId, deletedAt: null },
        });
        if (!member) throw AppError.notFound('El socio');
        if (member.status !== 'ACTIVE') {
          throw AppError.conflict(ErrorCode.CONFLICT, 'El socio esta inactivo.');
        }

        await tx.$queryRaw`
      SELECT "id" FROM "plans" WHERE "id" = ${input.planId}::uuid
        AND "gymId" = ${ctx.gymId}::uuid FOR SHARE
    `;
        const plan = await tx.plan.findFirst({
          where: { id: input.planId, deletedAt: null },
        });
        if (!plan) throw AppError.notFound('El plan');
        if (!plan.isActive) {
          throw AppError.conflict(
            ErrorCode.CONFLICT,
            'El plan está desactivado. Reactivalo antes de asignarlo.',
          );
        }
        if (plan.price.lte(0)) {
          throw AppError.unprocessable(
            ErrorCode.VALIDATION_ERROR,
            'La cuota requiere un precio de plan positivo.',
          );
        }

        const branch = await tx.branch.findFirst({
          where: { id: branchId, isActive: true, deletedAt: null },
        });
        if (!branch) throw AppError.notFound('La sede');
        if (input.autoRenew && plan.billingCycle !== 'MONTHLY') {
          throw AppError.unprocessable(
            ErrorCode.VALIDATION_ERROR,
            'Solo los planes mensuales admiten recurrencia.',
          );
        }
        if (
          input.priceOverride !== undefined &&
          compareMoney(input.priceOverride, plan.price.toFixed(2)) !== 0
        ) {
          throw AppError.unprocessable(
            ErrorCode.VALIDATION_ERROR,
            'El importe debe coincidir con el precio completo del plan.',
          );
        }

        const startDate = fromDateOnly(input.startDate);
        const selectedPaymentMethod =
          input.charge.mode === 'NOW'
            ? await tx.paymentMethod.findFirst({
                where: { id: input.charge.paymentMethodId, isActive: true },
              })
            : null;
        if (input.charge.mode === 'NOW' && !selectedPaymentMethod) {
          throw AppError.notFound('El método de pago');
        }
        const priceQuote = quoteEnrollmentPrice(
          plan.price.toFixed(2),
          input.startDate,
          selectedPaymentMethod?.code,
        );
        const pricePaid = priceQuote.total;
        if (
          input.charge.mode === 'NOW' &&
          compareMoney(input.charge.amount!, priceQuote.total) !== 0
        ) {
          throw AppError.unprocessable(
            ErrorCode.VALIDATION_ERROR,
            `El importe correcto para esta fecha y método es ${priceQuote.total}.`,
          );
        }
        const end = membershipEndDate(input.startDate, plan.billingCycle, plan.durationDays);
        const endDate = end ? fromDateOnly(end) : null;
        const renewalAnchorDay = plan.billingCycle === 'MONTHLY' ? startDate.getUTCDate() : null;
        const today = toBusinessDate(new Date(), branch.timezone);
        const nextRenewalDate =
          input.autoRenew && end && renewalAnchorDay
            ? fromDateOnly(
                end >= today ? addDays(end, 1) : nextMonthlyDateAfter(today, renewalAnchorDay),
              )
            : null;
        const classesIncluded = plan.classesIncluded;
        const classesRemaining = plan.classesIncluded;

        // A new assignment supersedes recurrence, not the old period or its debt.
        if (
          input.autoRenew &&
          (await tx.membership.findFirst({ where: { memberId, startDate: { gt: startDate } } }))
        ) {
          throw AppError.conflict(
            ErrorCode.CONFLICT,
            'Configura la recurrencia en el ultimo periodo del socio.',
          );
        }
        const previous = await tx.membership.findMany({
          where: { memberId, autoRenew: true, startDate: { lte: startDate } },
        });
        for (const period of previous) {
          if (period.branchId) TenantContextStore.requireBranch(period.branchId);
          await tx.membership.update({
            where: { id: period.id },
            data: { autoRenew: false, nextRenewalDate: null },
          });
          await recordRenewalChange(
            tx,
            period.id,
            period.branchId,
            { autoRenew: true },
            {
              autoRenew: false,
              reason: 'NEW_ASSIGNMENT',
            },
          );
        }
        const membership = await tx.membership.create({
          data: scoped({
            memberId,
            planId: plan.id,
            branchId,
            status: 'ACTIVE' as const,
            startDate,
            endDate,
            autoRenew: input.autoRenew ?? false,
            renewalAnchorDay,
            nextRenewalDate,
            pricePaid: new Prisma.Decimal(pricePaid),
            classesIncluded,
            classesRemaining,
            createdByUserId: ctx.userId,
          }),
        });

        // `postLedgerEntry` toma SELECT ... FOR UPDATE sobre el socio,
        // recalcula el balance y crea el asiento — todo dentro de esta
        // misma transacción (regla no negociable, ver members/ledger.ts).
        const { entry } = await postLedgerEntry(tx, ctx.gymId, {
          memberId,
          type: 'DEBIT',
          reason: 'MEMBERSHIP_CHARGE',
          amount: new Prisma.Decimal(pricePaid),
          membershipId: membership.id,
          branchId,
          createdByUserId: ctx.userId,
          description: `Alta de membresía: ${plan.name}`,
        });

        // Modo NOW: cobra en el momento. En la MISMA tx:
        //   1) Se relee la sesión OPEN (podría haber cambiado — el chequeo
        //      previo era optimista, sin lock).
        //   2) Se garantiza el concepto de sistema `MEMBERSHIP_CHARGE`.
        //   3) Se crea un CashMovement INCOME asociado al member y a la
        //      membresía, con el mismo importe que el DEBIT del alta.
        //   4) Se crea el LedgerEntry CREDIT (razón PAYMENT) que cancela el
        //      DEBIT — balance neto de esta operación = 0.
        // Si algo falla, la tx entera rollback (no queda membresía con deuda
        // fantasma ni movement suelto).
        let cashMovement: CashMovementDto | undefined;
        if (input.charge.mode === 'NOW') {
          const openSession = await requireOpenSessionForUser(
            {
              cashSession: {
                findFirst: (args: Prisma.CashSessionFindFirstArgs) =>
                  tx.cashSession.findFirst(args),
              },
            },
            ctx.userId,
            branchId,
          );
          const paymentMethodId = input.charge.paymentMethodId!;
          const chargeAmount = priceQuote.total;

          const [paymentMethod, concept] = await Promise.all([
            tx.paymentMethod.findFirst({ where: { id: paymentMethodId, isActive: true } }),
            // `ensureSystemConcept` acepta un cliente estructuralmente
            // compatible con la tx extendida; el genérico de Prisma no coincide
            // exacto por argumentos fluent, se pasa como unknown y el helper
            // usa sólo `cashConcept.findFirst`/`create`.
            ensureSystemConcept(
              tx as unknown as Parameters<typeof ensureSystemConcept>[0],
              'MEMBERSHIP_CHARGE',
            ),
          ]);
          if (!paymentMethod) throw AppError.notFound('El método de pago');

          const movement = await tx.cashMovement.create({
            data: scoped({
              cashSessionId: openSession.id,
              type: 'INCOME',
              amount: new Prisma.Decimal(chargeAmount),
              paymentMethodId: paymentMethod.id,
              cashConceptId: concept.id,
              description: `Cobro de membresía: ${plan.name}`,
              memberId,
              membershipId: membership.id,
              createdByUserId: ctx.userId,
            }),
          });

          await postLedgerEntry(tx, ctx.gymId, {
            memberId,
            type: 'CREDIT',
            reason: 'PAYMENT',
            amount: new Prisma.Decimal(chargeAmount),
            membershipId: membership.id,
            cashMovementId: movement.id,
            branchId: openSession.branchId,
            createdByUserId: ctx.userId,
            description: `Pago de membresía: ${plan.name}`,
          });

          cashMovement = serializeCashMovement(movement);
        }

        await this.audit.recordIn(tx, {
          action: 'MEMBERSHIP_CREATED',
          resourceType: 'Membership',
          resourceId: membership.id,
          after: {
            planId: plan.id,
            branchId,
            startDate: input.startDate,
            pricePaid,
            mode: input.charge.mode,
            autoRenew: membership.autoRenew,
            nextRenewalDate: toDateOnly(membership.nextRenewalDate),
          },
          branchId,
        });

        return { membership, entry, cashMovement };
      });

      return {
        membership: serializeMembership(result.membership),
        ledgerEntry: serializeLedgerEntry(result.entry),
        ...(result.cashMovement ? { cashMovement: result.cashMovement } : {}),
      };
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  // ── GET /members/:id/memberships ──────────────────────────────────────

  async listByMember(memberId: string): Promise<{ data: MembershipDto[] }> {
    // Cross-tenant: la lectura del socio ya sale scoped por gymId; si el id
    // pertenece a otro gimnasio, responde 404 (indistinguible de inexistente).
    const member = await this.prisma.client.member.findFirst({
      where: { id: memberId, deletedAt: null },
    });
    if (!member) throw AppError.notFound('El socio');

    const rows = await this.prisma.client.membership.findMany({
      where: { memberId },
      orderBy: { startDate: 'desc' },
    });
    return { data: rows.map(serializeMembership) };
  }

  // ── POST /memberships/:id/cancel ──────────────────────────────────────

  async cancel(id: string, input: CancelMembershipRequest): Promise<MembershipDto> {
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const existing = await this.lockPeriod(tx, id);
      if (!['ACTIVE', 'EXPIRED'].includes(existing.status)) {
        // `currentStatus`, no `status`: el filtro global esparce el `meta` en la
        // respuesta y una clave `status` colisionaría con el HTTP status del
        // ProblemDetails (`GlobalExceptionFilter.toProblem`).
        throw AppError.conflict(
          ErrorCode.MEMBERSHIP_NOT_ACTIVE,
          'La membresía esta cancelada o suspendida. No se puede cancelar de nuevo.',
          { currentStatus: existing.status },
        );
      }
      const row = await tx.membership.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledReason: input.reason,
          autoRenew: false,
          nextRenewalDate: null,
        },
      });
      // A renewal might have committed just before this cancellation. Stop its
      // current successor too, without cancelling or forgiving that period.
      await stopRenewalDescendants(tx, id);

      await this.audit.recordIn(tx, {
        action: 'MEMBERSHIP_CANCELLED',
        resourceType: 'Membership',
        resourceId: id,
        before: { status: existing.status },
        after: { status: row.status, reason: input.reason, autoRenew: false },
        branchId: row.branchId,
      });

      return row;
    });

    return serializeMembership(updated);
  }

  async configureRenewal(
    id: string,
    input: ConfigureMembershipRenewalRequest,
  ): Promise<MembershipDto> {
    const result = await this.prisma.client.$transaction(async (tx) => {
      const existing = await this.lockPeriod(tx, id);
      let anchor = existing.renewalAnchorDay;
      let next = existing.nextRenewalDate;
      if (input.autoRenew) {
        const member = await tx.member.findFirst({
          where: { id: existing.memberId, status: 'ACTIVE', deletedAt: null },
        });
        const plan = await tx.plan.findFirst({
          where: { id: existing.planId, isActive: true, deletedAt: null, billingCycle: 'MONTHLY' },
        });
        const branch = existing.branchId
          ? await tx.branch.findFirst({
              where: { id: existing.branchId, isActive: true, deletedAt: null },
            })
          : null;
        if (
          !member ||
          !plan || plan.price.lte(0) ||
          !branch ||
          !existing.endDate ||
          !['ACTIVE', 'EXPIRED'].includes(existing.status)
        ) {
          throw AppError.conflict(
            ErrorCode.CONFLICT,
            'Esta membresia no admite renovacion mensual.',
          );
        }
        const newer = await tx.membership.findFirst({
          where: {
            memberId: existing.memberId,
            id: { not: id },
            OR: [{ renewedFromId: id }, { startDate: { gt: existing.startDate } }],
          },
        });
        if (newer) {
          throw AppError.conflict(
            ErrorCode.CONFLICT,
            'Configura la recurrencia en el ultimo periodo del socio.',
          );
        }
        anchor ??= existing.startDate.getUTCDate();
        if (!existing.autoRenew) {
          const today = toBusinessDate(new Date(), branch.timezone);
          const end = toDateOnly(existing.endDate);
          next = fromDateOnly(end >= today ? addDays(end, 1) : nextMonthlyDateAfter(today, anchor));
        }
      } else {
        // Also handles a stale id after the worker has already renewed it.
        await stopRenewalDescendants(tx, id);
        next = null;
      }
      const row = await tx.membership.update({
        where: { id },
        data: {
          autoRenew: input.autoRenew,
          renewalAnchorDay: anchor,
          nextRenewalDate: next,
        },
      });
      await recordRenewalChange(
        tx,
        id,
        row.branchId,
        { autoRenew: existing.autoRenew, nextRenewalDate: toDateOnly(existing.nextRenewalDate) },
        { autoRenew: row.autoRenew, nextRenewalDate: toDateOnly(row.nextRenewalDate) },
      );
      return row;
    });
    return serializeMembership(result);
  }

  private async lockPeriod(tx: PulsoTransactionClient, id: string) {
    const ctx = TenantContextStore.require();
    const found = await tx.membership.findFirst({ where: { id } });
    if (!found) throw AppError.notFound('La membresia');
    if (found.branchId) TenantContextStore.requireBranch(found.branchId);
    await lockMember(tx, ctx.gymId, found.memberId);
    await tx.$queryRaw`SELECT "id" FROM "memberships"
      WHERE "id" = ${id}::uuid AND "gymId" = ${ctx.gymId}::uuid FOR UPDATE`;
    return tx.membership.findFirstOrThrow({ where: { id } });
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * Traduce el EXCLUDE constraint de Postgres (código `23P01`, no clasificado
   * por Prisma con un código propio) a 409 `MEMBERSHIP_OVERLAP`. El nombre
   * del constraint (`memberships_no_overlap`) es lo único disponible para
   * distinguirlo — mismo patrón que `cash/lib/pg-errors.ts`.
   */
  private translateWriteError(err: unknown): unknown {
    if (mentionsConstraint(err, 'memberships_no_overlap')) {
      return AppError.conflict(
        ErrorCode.MEMBERSHIP_OVERLAP,
        'El socio ya tiene otra membresía activa que se solapa con estas fechas.',
      );
    }
    if (mentionsConstraint(err, 'memberships_dates_ordered')) {
      return AppError.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        'La fecha de fin no puede ser anterior a la de inicio.',
      );
    }
    return err;
  }
}

async function lockMember(tx: PulsoTransactionClient, gymId: string, memberId: string) {
  await tx.$queryRaw`SELECT "id" FROM "members"
    WHERE "id" = ${memberId}::uuid AND "gymId" = ${gymId}::uuid FOR UPDATE`;
}

async function stopRenewalDescendants(tx: PulsoTransactionClient, id: string) {
  let parentId = id;
  let child = await tx.membership.findFirst({ where: { renewedFromId: parentId } });
  while (child) {
    if (child.branchId) TenantContextStore.requireBranch(child.branchId);
    if (child.autoRenew) {
      await tx.membership.update({
        where: { id: child.id },
        data: { autoRenew: false, nextRenewalDate: null },
      });
      await recordRenewalChange(
        tx,
        child.id,
        child.branchId,
        { autoRenew: true },
        {
          autoRenew: false,
          reason: 'PREDECESSOR_STOPPED',
          predecessorId: id,
        },
      );
    }
    parentId = child.id;
    child = await tx.membership.findFirst({ where: { renewedFromId: parentId } });
  }
}

async function recordRenewalChange(
  tx: PulsoTransactionClient,
  id: string,
  branchId: string | null,
  before: Prisma.InputJsonObject,
  after: Prisma.InputJsonObject,
) {
  const ctx = TenantContextStore.require();
  await tx.auditEvent.create({
    data: scoped({
      actorUserId: ctx.userId,
      actorType: 'USER',
      action: 'MEMBERSHIP_RENEWAL_CONFIGURED',
      resourceType: 'Membership',
      resourceId: id,
      branchId,
      before,
      after,
      requestId: ctx.requestId,
    }),
  });
}
