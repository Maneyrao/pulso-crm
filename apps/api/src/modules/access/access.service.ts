import { Injectable } from '@nestjs/common';
import { scoped } from '@pulso/db';
import type {
  AccessCheckRequest,
  AccessCheckResponse,
  ListAccessAttemptsQuery,
  ListAccessAttemptsResponse,
} from '@pulso/contracts/access';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getBranchTimezone, toBusinessDate } from '../cash/lib/business-date.helper.js';
import { evaluateAccess } from './access-decision.js';
import { businessDateToDbDate, dbDateToBusinessDate, mondayOfWeek } from './access-date.util.js';

/**
 * Superficie HTTP de la Regla de acceso #2 (docs/BUSINESS_RULES.md).
 *
 * `access-decision.ts` es la función pura que decide. Este service es el
 * puente entre la DB y esa función:
 *   1) Resuelve al socio por el identificador (DOCUMENT / CARD /
 *      MEMBER_NUMBER — biometría fuera del MVP).
 *   2) Arma el snapshot con la sede activa, la membresía vigente, el plan,
 *      y el conteo de asistencias de la semana.
 *   3) Delega el veredicto en `evaluateAccess()`.
 *   4) Escribe `AccessAttempt` (append-only) y — si el resultado es ALLOWED
 *      y el caller pidió registrar — `Attendance` con el UNIQUE por
 *      (gym, member, branch, día de negocio), que también funciona como
 *      idempotencia natural: reintentos el mismo día no duplican fila.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async check(input: AccessCheckRequest): Promise<AccessCheckResponse> {
    TenantContextStore.require();
    const branchId = TenantContextStore.requireBranch(input.branchId);

    // Zona de la sede — Regla #6: el "hoy" que decide el corte de día es el
    // de la sede, no UTC ni el del server.
    const timezone = await getBranchTimezone(this.prisma.client, branchId);
    const today = toBusinessDate(new Date(), timezone);

    const member = await this.findMemberByIdentifier(input);
    // Sin member: se registra el intento igual (auditoría de escaneos que no
    // pertenecen a este gimnasio), pero sin `memberId` en la fila.
    if (!member) {
      const attempt = await this.prisma.client.accessAttempt.create({
        data: scoped({
          branchId,
          memberId: null,
          method: input.method,
          rawInput: input.identifier.slice(0, 64),
          decision: 'DENIED',
          reasonCode: 'MEMBER_NOT_FOUND',
          detail: 'No se encontró un socio con ese identificador.',
        }),
      });
      return {
        decision: 'DENIED',
        reasonCode: 'MEMBER_NOT_FOUND',
        member: null,
        membership: null,
        attendanceRegistered: false,
        accessAttemptId: attempt.id,
      };
    }

    // Membresía activa vigente (la que se usa para decidir): la más reciente
    // no cancelada. `evaluateAccess` chequea después si está vencida — acá se
    // trae la mejor candidata para reflejar el estado real, no filtrar a la
    // fuerza para que "sea válida".
    const membership = await this.prisma.client.membership.findFirst({
      where: { memberId: member.id, status: { in: ['ACTIVE', 'EXPIRED', 'SUSPENDED'] } },
      orderBy: [{ startDate: 'desc' }],
      include: { plan: { include: { branches: true } } },
    });

    const attendance = await this.attendanceSnapshot(member.id, branchId, today);

    const decision = evaluateAccess({
      branchId,
      today,
      member: {
        id: member.id,
        status: member.status,
        medicalClearanceUntil: member.medicalClearanceUntil
          ? dbDateToBusinessDate(member.medicalClearanceUntil)
          : null,
      },
      membership: membership
        ? {
            id: membership.id,
            status: membership.status,
            endDate: membership.endDate ? dbDateToBusinessDate(membership.endDate) : null,
            classesRemaining: membership.classesRemaining,
          }
        : null,
      plan: membership
        ? {
            id: membership.plan.id,
            weeklyAccessLimit: membership.plan.weeklyAccessLimit,
            allowedBranchIds:
              membership.plan.branches.length > 0
                ? membership.plan.branches.map((pb) => pb.branchId)
                : null,
          }
        : null,
      attendance,
      config: {},
    });

    // Escribe el intento y, si corresponde, la asistencia — en la misma
    // transacción para que un intento ALLOWED con `registerAttendance: true`
    // nunca quede huérfano de su fila `attendances`. El UNIQUE parcial
    // `(gym, member, branch, occurredOn)` cubre el caso de reintentos:
    // el segundo choca y se cae al `catch`, se marca `attendanceRegistered:
    // false` con el DUPLICATE_WINDOW reason del snapshot.
    const shouldRecordAttendance =
      decision.decision === 'ALLOWED' &&
      input.registerAttendance !== false &&
      decision.reasonCode === 'OK'; // DUPLICATE_WINDOW no crea otra fila

    try {
      const result = await this.prisma.client.$transaction(async (tx) => {
        let attendanceId: string | null = null;
        if (shouldRecordAttendance) {
          const created = await tx.attendance.create({
            data: scoped({
              memberId: member.id,
              membershipId: membership?.id ?? null,
              branchId,
              method: input.method,
              occurredOn: businessDateToDbDate(today),
            }),
          });
          attendanceId = created.id;

          // Descontar del pack si aplica. `Membership.classesRemaining`
          // tiene un `check (>= 0)` — si la carrera lo dejaría en -1, falla
          // acá y hace rollback (la asistencia no se guarda tampoco).
          if (
            membership &&
            membership.classesRemaining !== null &&
            membership.classesRemaining > 0
          ) {
            await tx.membership.update({
              where: { id: membership.id },
              data: { classesRemaining: { decrement: 1 } },
            });
          }
        }

        const attempt = await tx.accessAttempt.create({
          data: scoped({
            branchId,
            memberId: member.id,
            method: input.method,
            rawInput: input.identifier.slice(0, 64),
            decision: decision.decision,
            reasonCode: decision.reasonCode,
            detail: decision.detail,
            attendanceId,
          }),
        });

        return { attempt, attendanceRegistered: attendanceId !== null };
      });

      return {
        decision: decision.decision,
        reasonCode: decision.reasonCode,
        member: {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          // photoKey es un identificador de S3, no una URL — el frontend puede
          // pedir la URL prefirmada aparte cuando exista ese endpoint. Por
          // ahora se devuelve null.
          photoUrl: null,
          status: member.status,
        },
        membership: membership
          ? {
              planName: membership.plan.name,
              endDate: membership.endDate ? dbDateToBusinessDate(membership.endDate) : null,
              classesRemaining:
                shouldRecordAttendance && membership.classesRemaining !== null
                  ? membership.classesRemaining - 1
                  : membership.classesRemaining,
            }
          : null,
        attendanceRegistered: result.attendanceRegistered,
        accessAttemptId: result.attempt.id,
      };
    } catch (err) {
      // Race del UNIQUE: otra request ya registró la asistencia en este mismo
      // día. Se persiste el intento sin attendanceId; el veredicto pasa a
      // DUPLICATE_WINDOW porque el estado real es "ya ingresó hoy".
      if (isDuplicateAttendance(err)) {
        const attempt = await this.prisma.client.accessAttempt.create({
          data: scoped({
            branchId,
            memberId: member.id,
            method: input.method,
            rawInput: input.identifier.slice(0, 64),
            decision: 'ALLOWED',
            reasonCode: 'DUPLICATE_WINDOW',
            detail: 'El socio ya registró un ingreso hoy en esta sede.',
          }),
        });
        return {
          decision: 'ALLOWED',
          reasonCode: 'DUPLICATE_WINDOW',
          member: {
            id: member.id,
            firstName: member.firstName,
            lastName: member.lastName,
            // photoKey es un identificador de S3, no una URL — el frontend puede
          // pedir la URL prefirmada aparte cuando exista ese endpoint. Por
          // ahora se devuelve null.
          photoUrl: null,
            status: member.status,
          },
          membership: membership
            ? {
                planName: membership.plan.name,
                endDate: membership.endDate ? dbDateToBusinessDate(membership.endDate) : null,
                classesRemaining: membership.classesRemaining,
              }
            : null,
          attendanceRegistered: false,
          accessAttemptId: attempt.id,
        };
      }
      throw err;
    }
  }

  async listAttempts(query: ListAccessAttemptsQuery): Promise<ListAccessAttemptsResponse> {
    const branchFilter = query.branchId
      ? { branchId: TenantContextStore.requireBranch(query.branchId) }
      : {};
    const where = {
      ...branchFilter,
      ...(query.decision ? { decision: query.decision } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.memberId ? { memberId: query.memberId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const page = query.page;
    const limit = query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.client.accessAttempt.count({ where }),
      this.prisma.client.accessAttempt.findMany({
        where,
        // El schema usa `occurredAt` (default now()), no `createdAt`.
        orderBy: [{ occurredAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        branchId: r.branchId,
        memberId: r.memberId,
        method: r.method,
        rawInputMasked: r.rawInput ? maskIdentifier(r.rawInput) : null,
        decision: r.decision,
        reasonCode: r.reasonCode,
        detail: r.detail,
        matchScore: r.matchScore,
        attendanceId: r.attendanceId,
        occurredAt: r.occurredAt.toISOString(),
      })),
      pageInfo: {
        limit,
        page,
        hasMore: page * limit < total,
        total,
      },
    };
  }

  /**
   * Traduce el identificador que llegó por HTTP a la fila del socio.
   * DOCUMENT → matching por `documentNumber` normalizado (sin puntos ni
   * espacios, ya que la columna se guarda así). CARD → `cardCode`
   * (columna real en `Member`, chequear). MEMBER_NUMBER → `memberNumber`.
   * FINGERPRINT queda fuera del MVP (biometría, Etapa 8) y se rechaza
   * antes de llegar acá.
   */
  private async findMemberByIdentifier(input: AccessCheckRequest) {
    if (input.method === 'FINGERPRINT') {
      throw AppError.conflict(
        ErrorCode.ACCESS_INPUT_INVALID,
        'El acceso por huella no está habilitado en este MVP.',
      );
    }

    const normalized = input.identifier.replace(/[.\s-]/g, '').trim();
    if (input.method === 'DOCUMENT') {
      return this.prisma.client.member.findFirst({
        where: { documentNumber: normalized, deletedAt: null },
      });
    }
    if (input.method === 'MEMBER_NUMBER') {
      const num = Number(normalized);
      if (!Number.isFinite(num) || num <= 0) return null;
      return this.prisma.client.member.findFirst({
        where: { memberNumber: num, deletedAt: null },
      });
    }
    if (input.method === 'CARD') {
      return this.prisma.client.member.findFirst({
        where: { cardCode: normalized, deletedAt: null },
      });
    }
    // MANUAL: se resuelve por documento como fallback amable.
    return this.prisma.client.member.findFirst({
      where: { documentNumber: normalized, deletedAt: null },
    });
  }

  /** Datos de asistencia que necesita `evaluateAccess`. */
  private async attendanceSnapshot(
    memberId: string,
    branchId: string,
    today: string,
  ): Promise<{ existsToday: boolean; distinctDaysThisWeekExcludingToday: number }> {
    const monday = mondayOfWeek(today);
    const rows = await this.prisma.client.attendance.findMany({
      where: {
        memberId,
        branchId,
        occurredOn: { gte: businessDateToDbDate(monday) },
      },
      select: { occurredOn: true },
    });
    const daysExcludingToday = new Set<string>();
    let existsToday = false;
    for (const r of rows) {
      const day = dbDateToBusinessDate(r.occurredOn);
      if (day === today) existsToday = true;
      else daysExcludingToday.add(day);
    }
    return { existsToday, distinctDaysThisWeekExcludingToday: daysExcludingToday.size };
  }
}

/**
 * `unique(gymId, memberId, branchId, occurredOn)` de `attendances`. El error
 * de Prisma llega con code P2002; en Postgres es un 23505.
 */
function isDuplicateAttendance(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return code === 'P2002' || code === '23505';
}

/**
 * Enmascara el identificador escaneado para el historial: mantiene los
 * primeros dos y los últimos dos caracteres, el resto en asteriscos.
 * Idempotente con el enmascaramiento del socio en el resto de la app
 * (ADR-018): la privacidad manda incluso en logs operativos.
 */
function maskIdentifier(raw: string): string {
  if (raw.length <= 4) return '*'.repeat(raw.length);
  return `${raw.slice(0, 2)}${'*'.repeat(raw.length - 4)}${raw.slice(-2)}`;
}
