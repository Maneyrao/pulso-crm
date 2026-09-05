import { Injectable } from '@nestjs/common';
import { Prisma, scoped } from '@pulso/db';
import type {
  CloseCashSessionRequest,
  ListCashSessionsQuery,
  OpenCashSessionRequest,
} from '@pulso/contracts/cash';
import { addMoney, subMoney, sumMoney, ZERO_MONEY } from '@pulso/config/money';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService } from '../../common/audit/audit.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getBranchTimezone, toBusinessDate } from './lib/business-date.helper.js';
import {
  serializeCashSession,
  serializeClosingDetail,
  type CashSessionDto,
  type ClosingDetailDto,
} from './lib/cash-serializer.js';
import { assertPositiveMoney } from './lib/money.helper.js';
import { translateCashConstraintError } from './lib/pg-errors.js';
import { findOpenSessionForUser } from './lib/session-lookup.js';
import { runSerializable } from './lib/tx.helper.js';

export interface CloseCashSessionResult {
  session: CashSessionDto;
  details: ClosingDetailDto[];
  differenceTotal: string;
}

/**
 * Sesiones de caja: alta (`open`), cierre (`close`), lectura de la sesión
 * OPEN del usuario y listados.
 *
 * Decisión (deviación del brief documentada): `openingAmount` NO se persiste
 * como un `CashMovement` "OPENING_BALANCE". Motivo: `CashMovement` exige
 * `paymentMethodId` (columna no nullable) y `openCashSessionRequestSchema`
 * NO lo declara — habría que inventar/buscar una `PaymentMethod` "efectivo"
 * y crearla lazy, agregando un supuesto que la superficie de datos no tiene.
 * En su lugar, `openingAmount` vive en la columna homónima de `CashSession`
 * (ya existente) y se suma al esperado en efectivo al cerrar. El daybook
 * lo expone leyendo el campo del `session`, no como movimiento inline.
 */
@Injectable()
export class CashSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── GET /cash/sessions/current ────────────────────────────────────────

  async getCurrent(): Promise<CashSessionDto | null> {
    const ctx = TenantContextStore.require();
    const branchId = ctx.activeBranchId ?? undefined;
    // Cast only at the type boundary: the runtime client is still the
    // tenant-scoped client. Avoids a deep generic instantiation caused by the
    // extended Prisma type after adding inventory models.
    const session = await (this.prisma.client as unknown as Prisma.TransactionClient).cashSession.findFirst({
      where: { openedByUserId: ctx.userId, status: 'OPEN', ...(branchId ? { branchId } : {}) },
      select: { id: true, gymId: true, branchId: true, cashRegisterId: true },
    });
    if (!session) return null;

    // findOpenSessionForUser sólo trae ids; para el DTO se relee la fila
    // entera. Es una lectura scoped por gymId y por PK, coste bajo y evita
    // duplicar el shape del select en el helper.
    const full = await this.prisma.client.cashSession.findFirst({ where: { id: session.id } });
    return full ? serializeCashSession(full) : null;
  }

  // ── GET /cash/sessions ────────────────────────────────────────────────

  async list(query: ListCashSessionsQuery): Promise<{ data: CashSessionDto[] }> {
    // `TenantContextStore.requireBranch` traduce id ajeno a 404, mismo criterio
    // que el resto de la API (ADR-008).
    const branchFilter = query.branchId
      ? { branchId: TenantContextStore.requireBranch(query.branchId) }
      : {};
    const statusFilter = query.status ? { status: query.status } : {};
    const dateFilter = buildBusinessDateFilter(query.from, query.to);

    const rows = await this.prisma.client.cashSession.findMany({
      where: { ...branchFilter, ...statusFilter, ...dateFilter },
      orderBy: [{ openedAt: 'desc' }],
      take: 100,
    });
    return { data: rows.map(serializeCashSession) };
  }

  // ── POST /cash/sessions/open ──────────────────────────────────────────

  async open(input: OpenCashSessionRequest): Promise<{ session: CashSessionDto }> {
    const ctx = TenantContextStore.require();
    // openingAmount se permite ser cero; el check `cash_sessions_opening_non_negative`
    // lo cubre en la base. No usar `assertPositiveMoney` — abrir con 0 es válido.
    if (input.openingAmount.startsWith('-')) {
      throw AppError.validation(
        [
          {
            field: 'openingAmount',
            code: 'too_small',
            message: 'El fondo inicial no puede ser negativo.',
          },
        ],
        'El fondo inicial no puede ser negativo.',
      );
    }

    // Validar que la caja pertenezca al gimnasio y a una sede a la que el
    // usuario tenga acceso. Se hace ANTES de abrir la transacción para no
    // meter la lectura de un id ajeno en el lock scope.
    const register = await this.prisma.client.cashRegister.findFirst({
      where: { id: input.cashRegisterId, isActive: true },
    });
    if (!register) throw AppError.notFound('La caja');
    // Sede validada contra `ctx.branchIds`: register de sede ajena (a la que
    // el user no tiene acceso) → 404, indistinguible de inexistente.
    if (!ctx.branchIds.includes(register.branchId)) {
      throw AppError.notFound('La caja');
    }

    const timezone = await getBranchTimezone(this.prisma.client, register.branchId);
    const businessDate = toBusinessDate(new Date(), timezone);

    try {
      const created = await runSerializable(this.prisma.client, async (tx) => {
        // Lock del register: dos requests concurrentes abriendo la misma caja
        // se serializan acá antes de llegar al check parcial UNIQUE
        // (`cash_sessions_one_open_per_register`), que sólo actúa en la
        // escritura. Idem carrera de un mismo usuario contra dos cajas:
        // el segundo lock queda esperando al primer commit y ve la fila OPEN
        // ya en su chequeo previo.
        await tx.$queryRaw`SELECT id FROM cash_registers WHERE id = ${register.id}::uuid FOR UPDATE`;

        // Chequeos pre-write con mensaje claro. Los índices parciales UNIQUE
        // de la base son la garantía dura (traducidos en `pg-errors.ts`
        // cuando un race llega al INSERT); estos son para el camino feliz.
        const otherOpenSameUser = await tx.cashSession.findFirst({
          where: { openedByUserId: ctx.userId, status: 'OPEN' },
          select: { id: true },
        });
        if (otherOpenSameUser) {
          throw AppError.conflict(
            ErrorCode.USER_HAS_OPEN_SESSION,
            'Ya tenés una caja abierta. Cerrala antes de abrir otra.',
          );
        }
        const otherOpenSameRegister = await tx.cashSession.findFirst({
          where: { cashRegisterId: register.id, status: 'OPEN' },
          select: { id: true },
        });
        if (otherOpenSameRegister) {
          throw AppError.conflict(
            ErrorCode.CASH_REGISTER_BUSY,
            'Esa caja ya tiene una sesión abierta.',
          );
        }

        const session = await tx.cashSession.create({
          data: scoped({
            branchId: register.branchId,
            cashRegisterId: register.id,
            status: 'OPEN',
            openedByUserId: ctx.userId,
            openingAmount: new Prisma.Decimal(input.openingAmount),
            openingNotes: input.notes ?? null,
            businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          }),
        });

        await this.audit.recordIn(tx, {
          action: 'CASH_SESSION_OPENED',
          resourceType: 'CashSession',
          resourceId: session.id,
          after: {
            cashRegisterId: session.cashRegisterId,
            branchId: session.branchId,
            openingAmount: input.openingAmount,
            businessDate,
          },
          branchId: session.branchId,
        });

        return session;
      });

      return { session: serializeCashSession(created) };
    } catch (err) {
      // Un race que atraviesa los chequeos pre-write choca contra el UNIQUE
      // parcial y aterriza acá; `translateCashConstraintError` lo convierte
      // en el 409 con `code` correcto (USER_HAS_OPEN_SESSION o CASH_REGISTER_BUSY).
      throw translateCashConstraintError(err) ?? err;
    }
  }

  // ── POST /cash/sessions/close ─────────────────────────────────────────

  async close(input: CloseCashSessionRequest): Promise<CloseCashSessionResult> {
    const ctx = TenantContextStore.require();
    for (const item of input.declared) {
      assertPositiveMoney(item.amount, 'declared.amount');
    }

    // Duplicados de `paymentMethodId` en el body no son ambiguos por
    // negocio (dos cajas para el mismo método) pero sí lo son para el
    // UNIQUE(cashSessionId, paymentMethodId) al persistir el detail —
    // se rechazan con 422 explícito antes de abrir la transacción.
    const seen = new Set<string>();
    for (const item of input.declared) {
      if (seen.has(item.paymentMethodId)) {
        throw AppError.validation(
          [
            {
              field: 'declared',
              code: 'duplicate',
              message: 'Hay entradas duplicadas para el mismo método de pago.',
            },
          ],
          'No repitas un mismo método de pago en el arqueo.',
        );
      }
      seen.add(item.paymentMethodId);
    }

    // El cliente tenant-extended dispara una instanciación genérica profunda
    // al entrar al helper; el cast acota el contrato de lectura sin cambiar
    // el cliente scoped que se ejecuta en runtime.
    const openSession = await findOpenSessionForUser(
      this.prisma.client as unknown as Prisma.TransactionClient,
      ctx.userId,
    );
    if (!openSession) {
      throw AppError.conflict(
        ErrorCode.NO_OPEN_CASH_SESSION,
        'No tenés una caja abierta que cerrar.',
      );
    }

    // Chequeo de operaciones pendientes (aprobaciones): si hay al menos una
    // PENDING para esta sesión, no se puede cerrar (regla del brief y del
    // comentario en `schema.prisma`).
    const pending = await this.prisma.client.cashOperationRequest.count({
      where: { cashSessionId: openSession.id, status: 'PENDING' },
    });
    if (pending > 0) {
      throw AppError.conflict(
        ErrorCode.CASH_SESSION_HAS_PENDING_OPERATIONS,
        'La caja tiene operaciones pendientes de aprobación. Resolvelas antes de cerrar.',
        { pending },
      );
    }

    try {
      const result = await runSerializable(this.prisma.client, async (tx) => {
        // Lock de la sesión: nadie puede crear movements nuevos mientras
        // computamos el esperado. `cash_movements` referencia `cashSession`
        // via FK y Postgres serializa el INSERT hijo bajo esta fila
        // padre bloqueada.
        await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${openSession.id}::uuid FOR UPDATE`;

        const session = await tx.cashSession.findFirst({ where: { id: openSession.id } });
        if (!session) {
          throw AppError.notFound('La sesión de caja');
        }
        if (session.status !== 'OPEN') {
          throw AppError.conflict(ErrorCode.CASH_SESSION_CLOSED, 'La sesión ya estaba cerrada.');
        }

        // Sumar movements por (paymentMethodId, type). Se hace en SQL, no
        // en memoria: hay potencialmente cientos de movements en una jornada.
        const rows = await tx.$queryRaw<
          { paymentMethodId: string; type: 'INCOME' | 'EXPENSE'; total: string }[]
        >`
          SELECT "paymentMethodId", "type", COALESCE(SUM("amount"), 0)::text AS total
          FROM "cash_movements"
          WHERE "cashSessionId" = ${session.id}::uuid AND "gymId" = ${session.gymId}::uuid
          GROUP BY "paymentMethodId", "type"
        `;
        const expectedByMethod = new Map<string, string>();
        for (const row of rows) {
          const current = expectedByMethod.get(row.paymentMethodId) ?? ZERO_MONEY;
          const next =
            row.type === 'INCOME' ? addMoney(current, row.total) : subMoney(current, row.total);
          expectedByMethod.set(row.paymentMethodId, next);
        }

        // Métodos que cuentan como efectivo: al esperado se le suma el fondo
        // de apertura, PRORRATEADO al método cash que reciba el ajuste.
        // Convención MVP: si hay al menos un método `countsAsCash` declarado
        // en el arqueo, se suma el fondo al PRIMER cash-method declarado
        // (respeta el orden que mandó el usuario). Si ninguno de los métodos
        // declarados cuenta como cash, el fondo se ignora silenciosamente en
        // el desglose por método y sólo entra al esperado global.
        const paymentMethods = await tx.paymentMethod.findMany({
          where: {
            id: { in: [...new Set(input.declared.map((d) => d.paymentMethodId))] },
          },
          select: { id: true, countsAsCash: true },
        });
        const paymentMethodById = new Map(paymentMethods.map((p) => [p.id, p]));
        for (const item of input.declared) {
          if (!paymentMethodById.has(item.paymentMethodId)) {
            throw AppError.notFound('El método de pago');
          }
        }

        const opening = session.openingAmount.toFixed(2);
        const firstCashMethod = input.declared.find(
          (d) => paymentMethodById.get(d.paymentMethodId)?.countsAsCash,
        );
        if (firstCashMethod) {
          const before = expectedByMethod.get(firstCashMethod.paymentMethodId) ?? ZERO_MONEY;
          expectedByMethod.set(firstCashMethod.paymentMethodId, addMoney(before, opening));
        }

        // Persistir el detail por método declarado. Métodos con movements
        // pero SIN declaración quedan implícitos en 0 declarado — se
        // registran como filas para que el arqueo sea auditablemente
        // completo (patrón: "nada declarado en un método que tuvo
        // movimientos es una diferencia negativa, no un dato ausente").
        const declaredMethodIds = new Set(input.declared.map((d) => d.paymentMethodId));
        const methodsWithMovements = [...expectedByMethod.keys()];
        for (const methodId of methodsWithMovements) {
          if (!declaredMethodIds.has(methodId)) {
            input.declared.push({ paymentMethodId: methodId, amount: ZERO_MONEY });
            declaredMethodIds.add(methodId);
          }
        }

        const details: ClosingDetailDto[] = [];
        for (const item of input.declared) {
          const expected = expectedByMethod.get(item.paymentMethodId) ?? ZERO_MONEY;
          const difference = subMoney(item.amount, expected);
          const row = await tx.cashSessionClosingDetail.create({
            data: scoped({
              cashSessionId: session.id,
              paymentMethodId: item.paymentMethodId,
              expectedAmount: new Prisma.Decimal(expected),
              declaredAmount: new Prisma.Decimal(item.amount),
              difference: new Prisma.Decimal(difference),
            }),
          });
          details.push(serializeClosingDetail(row));
        }

        // Totales cash-only para las columnas del `CashSession`:
        // `expectedCash` = suma del esperado en métodos cash,
        // `declaredCash` = suma del declarado en métodos cash.
        // `cash_sessions_closed_has_data` exige que declaredCash sea NOT NULL
        // al cerrar; se pone 0.00 aunque no haya cash-methods declarados.
        const cashMethodIds = new Set(
          paymentMethods.filter((p) => p.countsAsCash).map((p) => p.id),
        );
        const expectedCash = sumMoney(
          [...expectedByMethod.entries()].filter(([id]) => cashMethodIds.has(id)).map(([, v]) => v),
        );
        const declaredCash = sumMoney(
          input.declared.filter((d) => cashMethodIds.has(d.paymentMethodId)).map((d) => d.amount),
        );
        const cashDifference = subMoney(declaredCash, expectedCash);
        const differenceTotal = sumMoney(details.map((d) => d.difference.toFixed(2)));

        const closed = await tx.cashSession.update({
          where: { id: session.id },
          data: {
            status: 'CLOSED',
            closedByUserId: ctx.userId,
            closedAt: new Date(),
            closingNotes: input.notes ?? null,
            expectedCash: new Prisma.Decimal(expectedCash),
            declaredCash: new Prisma.Decimal(declaredCash),
            cashDifference: new Prisma.Decimal(cashDifference),
          },
        });

        await this.audit.recordIn(tx, {
          action: 'CASH_SESSION_CLOSED',
          resourceType: 'CashSession',
          resourceId: session.id,
          before: { status: session.status },
          after: {
            status: closed.status,
            expectedCash,
            declaredCash,
            cashDifference,
            differenceTotal,
            details: details.map((d) => ({
              paymentMethodId: d.paymentMethodId,
              expected: d.expectedAmount.toFixed(2),
              declared: d.declaredAmount.toFixed(2),
              difference: d.difference.toFixed(2),
            })),
          },
          branchId: closed.branchId,
        });

        return { session: closed, details, differenceTotal };
      });

      return {
        session: serializeCashSession(result.session),
        details: result.details,
        differenceTotal: result.differenceTotal,
      };
    } catch (err) {
      throw translateCashConstraintError(err) ?? err;
    }
  }
}

/**
 * Filtro por `businessDate` en formato `YYYY-MM-DD`. La columna es `@db.Date`
 * (fecha sin hora) y Prisma la acepta como `Date` a medianoche UTC.
 * `to` es INCLUSIVO en la semántica de negocio ("del 1 al 5 incluye el 5"),
 * pero se traduce a `lt: to+1` para poder aprovechar índices.
 */
function buildBusinessDateFilter(
  from: string | undefined,
  to: string | undefined,
): Record<string, unknown> {
  if (!from && !to) return {};
  const filter: { gte?: Date; lt?: Date } = {};
  if (from) filter.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) {
    const inclusive = new Date(`${to}T00:00:00.000Z`);
    inclusive.setUTCDate(inclusive.getUTCDate() + 1);
    filter.lt = inclusive;
  }
  return { businessDate: filter };
}

// Exportado para reuso por `cash-daybook.service.ts`.
export { buildBusinessDateFilter };
