import { Injectable } from '@nestjs/common';
import { Prisma, scoped } from '@pulso/db';
import type {
  CreateCashMovementRequest,
  ListCashMovementsQuery,
  ReverseCashMovementRequest,
} from '@pulso/contracts/cash';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService } from '../../common/audit/audit.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { postLedgerEntry } from '../members/ledger.js';
import { serializeCashMovement, type CashMovementDto } from './lib/cash-serializer.js';
import { assertPositiveMoney } from './lib/money.helper.js';
import { translateCashConstraintError } from './lib/pg-errors.js';
import { requireOpenSessionForUser } from './lib/session-lookup.js';
import { runSerializable } from './lib/tx.helper.js';

export type CreateCashMovementResult =
  | { status: 'CREATED'; movement: CashMovementDto }
  | { status: 'REQUIRES_APPROVAL'; operationRequestId: string };

export interface ReverseCashMovementResult {
  reversal: CashMovementDto;
  original: CashMovementDto;
}

/**
 * Movimientos de caja: alta y reversa.
 *
 * Los movimientos son INMUTABLES en la base (trigger `cash_movements_immutable`).
 * Corrección se hace SIEMPRE con una reversa (mismo importe, tipo opuesto,
 * `reversalOfId` seteado), nunca con UPDATE/DELETE. El UNIQUE parcial sobre
 * `reversalOfId` garantiza que un original no se puede revertir dos veces.
 *
 * `REQUIRES_APPROVAL` (large expense) queda para más adelante — el brief
 * indica MVP sin aprobación. Se mantiene en el discriminated union del
 * response porque el contrato lo declara; en la práctica siempre respondemos
 * `CREATED`.
 */
@Injectable()
export class CashMovementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── GET /cash/movements ───────────────────────────────────────────────

  async list(query: ListCashMovementsQuery): Promise<{ data: CashMovementDto[] }> {
    const ctx = TenantContextStore.require();
    const branchFilter = query.branchId
      ? { cashSession: { branchId: TenantContextStore.requireBranch(query.branchId) } }
      : {};
    const sessionFilter = query.cashSessionId ? { cashSessionId: query.cashSessionId } : {};
    const memberFilter = query.memberId ? { memberId: query.memberId } : {};
    const typeFilter = query.type ? { type: query.type } : {};
    const dateFilter = buildBusinessDateFilterForSession(query.from, query.to);

    // Si no vino filtro de sesión ni de branch ni de fecha ni de member,
    // por default listamos SOLO la sesión OPEN del usuario. Esto evita
    // devolver el histórico entero al toque de un botón "movimientos".
    let sessionScope = sessionFilter;
    if (!query.cashSessionId && !query.branchId && !query.memberId && !query.from && !query.to) {
      const open = await this.prisma.client.cashSession.findFirst({
        where: { openedByUserId: ctx.userId, status: 'OPEN' },
        select: { id: true },
      });
      // Sin sesión abierta y sin filtros: lista vacía (no un error).
      if (!open) return { data: [] };
      sessionScope = { cashSessionId: open.id };
    }

    const rows = await this.prisma.client.cashMovement.findMany({
      where: {
        ...sessionScope,
        ...branchFilter,
        ...memberFilter,
        ...typeFilter,
        ...dateFilter,
      },
      orderBy: [{ createdAt: 'asc' }],
      take: 500,
      include: { member: { select: { id: true, firstName: true, lastName: true } } },
    });
    return { data: rows.map(serializeCashMovement) };
  }

  // ── POST /cash/movements ──────────────────────────────────────────────

  async create(input: CreateCashMovementRequest): Promise<CreateCashMovementResult> {
    assertPositiveMoney(input.amount);
    const ctx = TenantContextStore.require();

    const session = await requireOpenSessionForUser(this.prisma.client, ctx.userId);

    try {
      const result = await runSerializable(this.prisma.client, async (tx) => {
        // Concept y payment method: se releen dentro de la tx para que un id
        // ajeno sea rechazado por el filtro de tenant (Prisma extension) —
        // 404 indistinguible de inexistente, mismo criterio que memberships.
        const [concept, paymentMethod] = await Promise.all([
          tx.cashConcept.findFirst({ where: { id: input.cashConceptId, isActive: true } }),
          tx.paymentMethod.findFirst({ where: { id: input.paymentMethodId, isActive: true } }),
        ]);
        if (!concept) throw AppError.notFound('El concepto de caja');
        if (!paymentMethod) throw AppError.notFound('El método de pago');
        if (concept.type !== input.type) {
          throw AppError.unprocessable(
            ErrorCode.VALIDATION_ERROR,
            `El concepto "${concept.name}" es de tipo ${concept.type}, no ${input.type}.`,
          );
        }

        // Si el movement está ligado a un socio, se releé la fila (scoped
        // por tenant) y se creará el LedgerEntry correspondiente después del
        // movement, para que el ledger apunte al `cashMovementId` real.
        let memberId: string | null = null;
        if (input.memberId) {
          const member = await tx.member.findFirst({
            where: { id: input.memberId, deletedAt: null },
            select: { id: true },
          });
          if (!member) throw AppError.notFound('El socio');
          memberId = member.id;
        }

        const movement = await tx.cashMovement.create({
          data: scoped({
            cashSessionId: session.id,
            type: input.type,
            amount: new Prisma.Decimal(input.amount),
            paymentMethodId: paymentMethod.id,
            cashConceptId: concept.id,
            description: input.detail ?? null,
            memberId,
            createdByUserId: ctx.userId,
          }),
        });

        // Ledger: INCOME con memberId → CREDIT (paga la deuda / a cuenta),
        // EXPENSE con memberId → DEBIT (reintegro deja crédito a favor del
        // gimnasio contra el socio). El caller decide con qué concepto lo
        // asocia — la regla del signo la determina `type`, no el concept
        // (que sólo etiqueta el motivo para el reporte).
        if (memberId) {
          await postLedgerEntry(tx, ctx.gymId, {
            memberId,
            type: input.type === 'INCOME' ? 'CREDIT' : 'DEBIT',
            reason: input.type === 'INCOME' ? 'PAYMENT' : 'REFUND',
            amount: new Prisma.Decimal(input.amount),
            description: input.detail ?? concept.name,
            cashMovementId: movement.id,
            branchId: session.branchId,
            createdByUserId: ctx.userId,
          });
        }

        await this.audit.recordIn(tx, {
          action: 'CASH_MOVEMENT_CREATED',
          resourceType: 'CashMovement',
          resourceId: movement.id,
          after: {
            cashSessionId: movement.cashSessionId,
            type: movement.type,
            amount: input.amount,
            paymentMethodId: movement.paymentMethodId,
            cashConceptId: movement.cashConceptId,
            memberId,
          },
          branchId: session.branchId,
        });

        return movement;
      });

      return { status: 'CREATED', movement: serializeCashMovement(result) };
    } catch (err) {
      throw translateCashConstraintError(err) ?? err;
    }
  }

  // ── POST /cash/movements/:id/reverse ─────────────────────────────────

  async reverse(id: string, input: ReverseCashMovementRequest): Promise<ReverseCashMovementResult> {
    const ctx = TenantContextStore.require();

    // Lectura fuera de tx para poder responder 404 rápido con un id ajeno o
    // inexistente. Prisma sale scoped por gymId → cross-tenant devuelve null.
    const original = await this.prisma.client.cashMovement.findFirst({ where: { id } });
    if (!original) throw AppError.notFound('El movimiento de caja');

    if (original.reversalOfId !== null) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'No se puede revertir una reversa. Si te equivocaste, hacé un movimiento nuevo con el signo correcto.',
      );
    }
    if (original.isReversed) {
      throw AppError.conflict(
        ErrorCode.MOVEMENT_ALREADY_REVERSED,
        'Ese movimiento ya fue revertido.',
      );
    }

    // La sesión del original tiene que estar OPEN. Si se cerró, la corrección
    // pasa por `CashOperationRequest` (fuera de alcance del MVP).
    const originalSession = await this.prisma.client.cashSession.findFirst({
      where: { id: original.cashSessionId },
    });
    if (!originalSession) throw AppError.notFound('La sesión de caja');
    if (originalSession.status !== 'OPEN') {
      throw AppError.conflict(
        ErrorCode.CASH_SESSION_CLOSED,
        'La sesión que contiene ese movimiento ya está cerrada. Una reversa exige la caja abierta.',
      );
    }

    const reverseType = original.type === 'INCOME' ? 'EXPENSE' : 'INCOME';

    try {
      const result = await runSerializable(this.prisma.client, async (tx) => {
        // Lock del original: dos reversas concurrentes del mismo id se
        // serializan acá antes de chocar con el UNIQUE(reversalOfId).
        // La reversa del signo también protege contra un doble-click que
        // duplique el asiento contable del socio.
        await tx.$queryRaw`SELECT id FROM cash_movements WHERE id = ${original.id}::uuid FOR UPDATE`;

        // Re-lee con el lock puesto: si otro ganó la carrera, ya está marcado.
        const relocked = await tx.cashMovement.findFirst({ where: { id: original.id } });
        if (!relocked) throw AppError.notFound('El movimiento de caja');
        if (relocked.isReversed) {
          throw AppError.conflict(
            ErrorCode.MOVEMENT_ALREADY_REVERSED,
            'Ese movimiento ya fue revertido.',
          );
        }

        const reversal = await tx.cashMovement.create({
          data: scoped({
            cashSessionId: relocked.cashSessionId,
            type: reverseType,
            amount: relocked.amount,
            paymentMethodId: relocked.paymentMethodId,
            cashConceptId: relocked.cashConceptId,
            description: input.reason,
            memberId: relocked.memberId,
            membershipId: relocked.membershipId,
            reversalOfId: relocked.id,
            reversalReason: input.reason,
            createdByUserId: ctx.userId,
          }),
        });

        const updatedOriginal = await tx.cashMovement.update({
          where: { id: relocked.id },
          data: { isReversed: true, reversalReason: input.reason },
        });

        // Ledger inverso si había asiento asociado. Un INCOME al socio (que
        // creó un CREDIT) se compensa con un DEBIT, y viceversa. El helper
        // recomputa Member.balance con lock — no hay lost update.
        if (relocked.memberId) {
          await postLedgerEntry(tx, ctx.gymId, {
            memberId: relocked.memberId,
            type: relocked.type === 'INCOME' ? 'DEBIT' : 'CREDIT',
            reason: 'REVERSAL',
            amount: relocked.amount,
            description: `Reversa: ${input.reason}`,
            cashMovementId: reversal.id,
            branchId: originalSession.branchId,
            createdByUserId: ctx.userId,
          });
        }

        await this.audit.recordIn(tx, {
          action: 'CASH_MOVEMENT_REVERSED',
          resourceType: 'CashMovement',
          resourceId: relocked.id,
          before: { isReversed: false },
          after: {
            isReversed: true,
            reversalId: reversal.id,
            reason: input.reason,
          },
          branchId: originalSession.branchId,
        });

        return { reversal, original: updatedOriginal };
      });

      return {
        reversal: serializeCashMovement(result.reversal),
        original: serializeCashMovement(result.original),
      };
    } catch (err) {
      throw translateCashConstraintError(err) ?? err;
    }
  }
}

/**
 * Filtro `from`/`to` sobre el `businessDate` de la sesión padre del movement.
 * Prisma soporta `some`/`is`/scalar filters en relaciones — se usa `is` para
 * componer el rango sobre la fecha de negocio de la sesión.
 */
function buildBusinessDateFilterForSession(
  from: string | undefined,
  to: string | undefined,
): Record<string, unknown> {
  if (!from && !to) return {};
  const range: { gte?: Date; lt?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const inclusive = new Date(`${to}T00:00:00.000Z`);
    inclusive.setUTCDate(inclusive.getUTCDate() + 1);
    range.lt = inclusive;
  }
  return { cashSession: { is: { businessDate: range } } };
}
