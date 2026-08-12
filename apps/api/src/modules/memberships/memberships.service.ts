import { Injectable } from '@nestjs/common';
import { Prisma, scoped } from '@pulso/db';
import type { BillingCycle, Plan as PrismaPlan } from '@pulso/db';
import type { CancelMembershipRequest, CreateMembershipRequest } from '@pulso/contracts/memberships';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService } from '../../common/audit/audit.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { mentionsConstraint } from '../members/db-errors.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { fromDateOnly } from '../members/date-only.js';
import { postLedgerEntry } from '../members/ledger.js';
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
 * el `DecimalSerializerInterceptor` en el borde HTTP. `cashMovement` va a
 * aparecer sólo cuando llegue `mode: NOW` en M5.
 */
export interface CreateMembershipResult {
  membership: MembershipDto;
  ledgerEntry: LedgerEntryDto;
}

/**
 * Duración por defecto de cada ciclo de facturación cuando `Plan.durationDays`
 * no está seteado.
 *
 * Decisión (fija, mismo criterio que documenta el brief M4): días fijos,
 * calculados con aritmética simple sobre `startDate` — no `addMonths` de
 * calendario. Un plan `ANNUAL` que arranca un 29/02 no tiene que salirse a
 * discutir con qué día "el mismo día del año que viene". `CLASS_PACK`
 * vence por consumo, no por fecha: `endDate` es `null` incluso cuando el
 * plan declara `durationDays` (ese durationDays se usa para métricas y
 * expiración por inactividad, no para cortar `endDate`).
 */
const DEFAULT_CYCLE_DAYS: Record<Exclude<BillingCycle, 'CLASS_PACK'>, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  BIANNUAL: 180,
  ANNUAL: 365,
};

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── POST /members/:id/memberships ─────────────────────────────────────

  async create(memberId: string, input: CreateMembershipRequest): Promise<CreateMembershipResult> {
    const ctx = TenantContextStore.require();

    // `mode: NOW` va en M5 (necesita el módulo de caja abierto + sesión).
    // Hasta entonces se responde 409 con detail explícito para que el
    // frontend pueda mostrar el mensaje sin romper el contrato.
    if (input.charge.mode === 'NOW') {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'El cobro por caja llega en el próximo milestone. Usá mode: DEBT.',
      );
    }

    // Cross-tenant: las tres lecturas salen scoped por gymId (extension), así
    // que un id ajeno responde 404 igual que uno inexistente (API_CONTRACTS §1.3).
    const member = await this.prisma.client.member.findFirst({
      where: { id: memberId, deletedAt: null },
    });
    if (!member) throw AppError.notFound('El socio');

    const plan = await this.prisma.client.plan.findFirst({
      where: { id: input.planId, deletedAt: null },
    });
    if (!plan) throw AppError.notFound('El plan');
    if (!plan.isActive) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'El plan está desactivado. Reactivalo antes de asignarlo.',
      );
    }

    // Valida que la sede pertenezca al gimnasio y que el usuario tenga acceso.
    // Un branchId ajeno responde 404, mismo criterio que arriba.
    const branchId = TenantContextStore.requireBranch(input.branchId);

    const pricePaid = input.priceOverride ?? plan.price.toFixed(2);
    const startDate = fromDateOnly(input.startDate);
    const endDate = computeEndDate(startDate, plan);
    const classesIncluded = plan.classesIncluded;
    const classesRemaining = plan.classesIncluded;

    try {
      const result = await this.prisma.client.$transaction(async (tx) => {
        const membership = await tx.membership.create({
          data: scoped({
            memberId,
            planId: plan.id,
            branchId,
            status: 'ACTIVE' as const,
            startDate,
            endDate,
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
          },
          branchId,
        });

        return { membership, entry };
      });

      return {
        membership: serializeMembership(result.membership),
        ledgerEntry: serializeLedgerEntry(result.entry),
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
    const existing = await this.prisma.client.membership.findFirst({ where: { id } });
    if (!existing) throw AppError.notFound('La membresía');

    if (existing.status !== 'ACTIVE') {
      // `currentStatus`, no `status`: el filtro global esparce el `meta` en la
      // respuesta y una clave `status` colisionaría con el HTTP status del
      // ProblemDetails (`GlobalExceptionFilter.toProblem`).
      throw AppError.conflict(
        ErrorCode.MEMBERSHIP_NOT_ACTIVE,
        'La membresía ya no está activa (cancelada, expirada o suspendida). No se puede cancelar de nuevo.',
        { currentStatus: existing.status },
      );
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.membership.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledReason: input.reason,
        },
      });

      await this.audit.recordIn(tx, {
        action: 'MEMBERSHIP_CANCELLED',
        resourceType: 'Membership',
        resourceId: id,
        before: { status: existing.status },
        after: { status: row.status, reason: input.reason },
        branchId: row.branchId,
      });

      return row;
    });

    return serializeMembership(updated);
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

/**
 * Fin de vigencia calculado a partir del ciclo de facturación:
 *
 *  - `CLASS_PACK` → `null` (vence por consumo, no por fecha).
 *  - Otro ciclo → `startDate + (plan.durationDays ?? default del ciclo)`.
 *    Días fijos: `MONTHLY=30`, `QUARTERLY=90`, `BIANNUAL=180`, `ANNUAL=365`.
 *    Se suma a `startDate` como UTC (`@db.Date` guarda medianoche UTC).
 *
 * `endDate` es la ÚLTIMA fecha inclusive de vigencia — el EXCLUDE
 * constraint arma internamente `[startDate, endDate + 1)`, así que no hace
 * falta compensar acá.
 */
function computeEndDate(startDate: Date, plan: PrismaPlan): Date | null {
  if (plan.billingCycle === 'CLASS_PACK') return null;
  const days = plan.durationDays ?? DEFAULT_CYCLE_DAYS[plan.billingCycle];
  const end = new Date(startDate.getTime());
  end.setUTCDate(end.getUTCDate() + days - 1);
  return end;
}
