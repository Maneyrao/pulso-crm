import { Injectable } from '@nestjs/common';
import { Prisma } from '@pulso/db';
import type { DashboardResponse } from '@pulso/contracts/reporting';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { getBranchTimezone, toBusinessDate } from '../cash/lib/business-date.helper.js';
import { businessDateToDbDate } from '../access/access-date.util.js';
import { addDays } from '@pulso/config/time';

/**
 * `GET /reports/dashboard`. Un solo endpoint que arma los 6 indicadores
 * del inicio, consultados en paralelo:
 *
 * 1. Socios activos (status=ACTIVE, no soft-deleted) del gimnasio.
 * 2. Alta de socios en el mes actual (business date de la sede).
 * 3. Deuda total: suma de `member.balance` positivo (DEBIT excede a CREDIT).
 * 4. Ingresos del día: suma de `cash_movements.type=INCOME` cuya sesión
 *    padre tiene `businessDate = hoy`.
 * 5. Asistencias del día: `attendances.occurredOn = hoy`.
 * 6. Membresías que vencen en los próximos 7 días (endDate ∈ [hoy, hoy+7]).
 *
 * "Hoy" se resuelve en la zona de la sede activa (Regla #6). Sin sede
 * activa, se cae a la del gimnasio: cualquier operación cae en un solo
 * día calendario, no en la mitad de dos días.
 */
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(): Promise<DashboardResponse> {
    const ctx = TenantContextStore.require();
    const branchId = ctx.activeBranchId;

    const timezone = branchId
      ? await getBranchTimezone(this.prisma.client, branchId)
      : 'America/Argentina/Buenos_Aires';
    const today = toBusinessDate(new Date(), timezone);
    const todayDate = businessDateToDbDate(today);
    const monthStart = `${today.slice(0, 8)}01`;
    const monthStartDate = businessDateToDbDate(monthStart);
    const inSevenDays = addDays(today, 7);

    // Sumas en Postgres — no en memoria: los tres agregados pueden crecer
    // linealmente con el gimnasio (miles de movements, cientos de socios).
    const [
      activeMembers,
      newMembersThisMonth,
      totalDebtRow,
      todayIncomeRow,
      todayAttendances,
      expiringMemberships,
    ] = await Promise.all([
      this.prisma.client.member.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.client.member.count({
        where: { createdAt: { gte: monthStartDate }, deletedAt: null },
      }),
      this.prisma.client.$queryRaw<{ total: string }[]>`
        SELECT COALESCE(SUM("balance"), 0)::text AS total
        FROM "members"
        WHERE "gymId" = ${ctx.gymId}::uuid
          AND "deletedAt" IS NULL
          AND "balance" > 0
      `,
      this.prisma.client.$queryRaw<{ total: string }[]>`
        SELECT COALESCE(SUM(m."amount"), 0)::text AS total
        FROM "cash_movements" m
        JOIN "cash_sessions" s ON s."id" = m."cashSessionId"
        WHERE m."gymId" = ${ctx.gymId}::uuid
          AND m."type" = 'INCOME'
          AND s."businessDate" = ${todayDate}
          ${branchId ? this.branchFilterSql(branchId) : this.noBranchFilterSql()}
      `,
      this.prisma.client.attendance.count({
        where: {
          occurredOn: todayDate,
          ...(branchId ? { branchId } : {}),
        },
      }),
      this.prisma.client.membership.count({
        where: {
          status: 'ACTIVE',
          endDate: { gte: todayDate, lte: businessDateToDbDate(inSevenDays) },
          ...(branchId ? { branchId } : {}),
        },
      }),
    ]);

    return {
      activeMembers,
      newMembersThisMonth,
      totalDebt: this.formatMoney(totalDebtRow[0]?.total ?? '0'),
      todayIncome: this.formatMoney(todayIncomeRow[0]?.total ?? '0'),
      todayAttendances,
      expiringMembershipsNext7Days: expiringMemberships,
      timezoneUsed: timezone,
    };
  }

  /** SQL parametrizado para el filtro por sede — bind param, nunca string interpolado. */
  private branchFilterSql(branchId: string) {
    return Prisma.sql`AND s."branchId" = ${branchId}::uuid`;
  }

  private noBranchFilterSql() {
    return Prisma.empty;
  }

  /** Money llega desde SQL como string ('12345.00' o '12345.6' o '0'). Normaliza a dos decimales. */
  private formatMoney(raw: string): string {
    const num = Number(raw);
    if (!Number.isFinite(num)) return '0.00';
    return num.toFixed(2);
  }
}
