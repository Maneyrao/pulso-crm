import { Injectable } from '@nestjs/common';
import type { DaybookQuery } from '@pulso/contracts/cash';
import { addMoney, ZERO_MONEY } from '@pulso/config/money';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getBranchTimezone } from './lib/business-date.helper.js';
import {
  serializeCashMovement,
  serializeCashSession,
  type CashMovementDto,
  type CashSessionDto,
} from './lib/cash-serializer.js';
import { toDateOnly } from '../members/date-only.js';

interface DaybookMethodTotal {
  paymentMethodId: string;
  income: string;
  expense: string;
}

interface DaybookDay {
  businessDate: string;
  sessions: CashSessionDto[];
  movements: CashMovementDto[];
  totalsByMethod: DaybookMethodTotal[];
}

export interface DaybookResult {
  data: DaybookDay[];
  timezoneUsed: string;
}

/**
 * Libro diario (API_CONTRACTS §8 "Caja > `GET /cash/daybook`").
 *
 * Devuelve las sesiones y sus movements agrupados por día de negocio de la
 * SEDE activa (ADR-021). Los totales por método por día son la contraparte
 * "post" del arqueo: el operador puede verificar contra el efectivo real en
 * cualquier momento del día, no sólo al cierre.
 */
@Injectable()
export class CashDaybookService {
  constructor(private readonly prisma: PrismaService) {}

  async get(query: DaybookQuery): Promise<DaybookResult> {
    const ctx = TenantContextStore.require();
    // `branchId` opcional: si no viene, se usa la sede activa (misma regla que
    // el resto de endpoints tenant-scoped por sede).
    const branchId = TenantContextStore.requireBranch(query.branchId);
    if (query.from > query.to) {
      throw AppError.unprocessable(
        ErrorCode.VALIDATION_ERROR,
        'El rango de fechas es inválido: `from` no puede ser posterior a `to`.',
      );
    }

    const timezone = await getBranchTimezone(this.prisma.client, branchId);

    const fromDate = new Date(`${query.from}T00:00:00.000Z`);
    const toInclusive = new Date(`${query.to}T00:00:00.000Z`);
    toInclusive.setUTCDate(toInclusive.getUTCDate() + 1);

    // Sesiones del rango. Se traen enteras (no sólo ids) para poder
    // devolverlas serializadas sin round-trip extra.
    const sessions = await this.prisma.client.cashSession.findMany({
      where: {
        branchId,
        businessDate: { gte: fromDate, lt: toInclusive },
      },
      orderBy: [{ businessDate: 'asc' }, { openedAt: 'asc' }],
    });

    // Movements de esas sesiones. Alternativa (SQL con JOIN + agrupamiento) es
    // más eficiente para libros grandes pero para un solo día devuelve
    // decenas o cientos de filas — el findMany scoped alcanza.
    const sessionIds = sessions.map((s) => s.id);
    const movements = sessionIds.length
      ? await this.prisma.client.cashMovement.findMany({
          where: { cashSessionId: { in: sessionIds } },
          orderBy: [{ createdAt: 'asc' }],
        })
      : [];

    // Agrupamiento por día. Se usa el `businessDate` de la SESIÓN (ya
    // calculado en la zona de la sede al abrir), no el `createdAt` del
    // movement — un movement de las 23:30 hora local pertenece al mismo día
    // que su sesión, no al siguiente por UTC.
    const dayIndex = new Map<
      string,
      { sessions: CashSessionDto[]; movements: CashMovementDto[]; totals: Map<string, { income: string; expense: string }> }
    >();
    const ensureDay = (date: string) => {
      let entry = dayIndex.get(date);
      if (!entry) {
        entry = { sessions: [], movements: [], totals: new Map() };
        dayIndex.set(date, entry);
      }
      return entry;
    };

    const sessionById = new Map(sessions.map((s) => [s.id, s]));
    for (const s of sessions) {
      const day = toDateOnly(s.businessDate);
      ensureDay(day).sessions.push(serializeCashSession(s));
    }
    for (const m of movements) {
      const parent = sessionById.get(m.cashSessionId);
      if (!parent) continue;
      const day = toDateOnly(parent.businessDate);
      const entry = ensureDay(day);
      entry.movements.push(serializeCashMovement(m));
      const bucket = entry.totals.get(m.paymentMethodId) ?? { income: ZERO_MONEY, expense: ZERO_MONEY };
      if (m.type === 'INCOME') bucket.income = addMoney(bucket.income, m.amount.toFixed(2));
      else bucket.expense = addMoney(bucket.expense, m.amount.toFixed(2));
      entry.totals.set(m.paymentMethodId, bucket);
    }

    const data: DaybookDay[] = [...dayIndex.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([businessDate, entry]) => ({
        businessDate,
        sessions: entry.sessions,
        movements: entry.movements,
        totalsByMethod: [...entry.totals.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([paymentMethodId, totals]) => ({
            paymentMethodId,
            income: totals.income,
            expense: totals.expense,
          })),
      }));

    // Aunque `ctx.gymId` no se usa en la consulta (todo va scoped por Prisma),
    // se lee para asegurar que el contexto está poblado (falla temprano si
    // alguien llamara al service fuera de un request).
    void ctx.gymId;

    return { data, timezoneUsed: timezone };
  }
}
