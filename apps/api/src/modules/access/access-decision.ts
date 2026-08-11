import type { AccessDecision, AccessReasonCode } from '@pulso/contracts';
import type { BusinessDate } from '@pulso/config/time';

/**
 * Cadena de autorización de `POST /access/check`, como función pura.
 *
 * A propósito no toca la base ni el reloj: recibe un snapshot ya resuelto y
 * devuelve un veredicto. Así los diez casos de la Regla #2 se prueban con
 * datos en memoria, sin levantar PostgreSQL, y el mismo veredicto puede
 * volver a ejecutarse en un test de integración para confirmar que la capa
 * de acceso a datos arma el snapshot correctamente.
 *
 * Orden de evaluación (el primero que falla decide — Regla #2):
 *   socio existe → socio activo → tiene membresía → membresía vigente
 *   (no vencida/cancelada) → sede permitida por el plan → quedan clases
 *   (si es pack) → no superó el límite semanal → apto médico vigente →
 *   ya ingresó hoy (DUPLICATE_WINDOW) → OK.
 *
 * `DEBT_BLOCKED` y `BIOMETRIC_NO_MATCH` existen en el enum de Prisma pero no
 * se evalúan acá: el primero requeriría una política de gimnasio que todavía
 * no existe en el modelo de datos, y el segundo es Etapa 8 (biometría, fuera
 * de alcance — ver `access.service.ts`).
 */

export interface MemberSnapshot {
  id: string;
  status: 'ACTIVE' | 'INACTIVE';
  /** `null` = el gimnasio no le exige apto médico a este socio. */
  medicalClearanceUntil: BusinessDate | null;
}

export interface MembershipSnapshot {
  id: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';
  /** `null` en packs de clases: no vencen por fecha. */
  endDate: BusinessDate | null;
  /** `null` = acceso libre (no es un pack de clases). */
  classesRemaining: number | null;
}

export interface PlanSnapshot {
  id: string;
  /** `null` = sin límite semanal. */
  weeklyAccessLimit: number | null;
  /** `null` = el plan vale en todas las sedes (sin filas en `PlanBranch`). */
  allowedBranchIds: string[] | null;
}

export interface AttendanceSnapshot {
  /** Ya existe una `Attendance` para HOY en esta sede. */
  existsToday: boolean;
  /**
   * Días de negocio distintos asistidos en la semana actual, SIN CONTAR hoy.
   * Se excluye hoy a propósito: una re-entrada el mismo día (salir a comprar
   * agua y volver) no puede empujarlo por encima del límite semanal — ese es
   * exactamente el caso que Regla #5 protege, aplicado también acá.
   */
  distinctDaysThisWeekExcludingToday: number;
}

/**
 * Punto de extensión para políticas configurables del gimnasio que hoy no
 * existen en el modelo de datos (p.ej. bloqueo por deuda). No afecta la
 * decisión todavía; está tipado para que agregar una no requiera cambiar la
 * firma de `evaluateAccess`.
 */
export type AccessCheckConfig = Record<string, unknown>;

export interface AccessCheckSnapshot {
  branchId: string;
  /** Día de negocio en la zona de la SEDE (Regla #6), no UTC ni la del server. */
  today: BusinessDate;
  member: MemberSnapshot | null;
  membership: MembershipSnapshot | null;
  plan: PlanSnapshot | null;
  attendance: AttendanceSnapshot;
  config: AccessCheckConfig;
}

export interface AccessDecisionResult {
  decision: AccessDecision;
  reasonCode: AccessReasonCode;
  detail: string;
}

function allowed(reasonCode: AccessReasonCode, detail: string): AccessDecisionResult {
  return { decision: 'ALLOWED', reasonCode, detail };
}

function denied(reasonCode: AccessReasonCode, detail: string): AccessDecisionResult {
  return { decision: 'DENIED', reasonCode, detail };
}

export function evaluateAccess(snapshot: AccessCheckSnapshot): AccessDecisionResult {
  const { member, membership, plan, attendance, branchId, today } = snapshot;

  if (!member) {
    return denied('MEMBER_NOT_FOUND', 'No se encontró un socio con ese identificador.');
  }

  if (member.status !== 'ACTIVE') {
    return denied('MEMBER_INACTIVE', 'El socio está inactivo.');
  }

  if (!membership || !plan) {
    return denied('NO_MEMBERSHIP', 'El socio no tiene una membresía.');
  }

  if (membership.status === 'CANCELLED') {
    return denied('MEMBERSHIP_CANCELLED', 'La membresía fue cancelada.');
  }

  // EXPIRED, SUSPENDED, o ACTIVE-pero-vencida (defensivo: el job de
  // vencimientos debería haberla pasado a EXPIRED, pero no se confía en eso).
  if (membership.status !== 'ACTIVE' || (membership.endDate !== null && membership.endDate < today)) {
    return denied('MEMBERSHIP_EXPIRED', 'La membresía está vencida.');
  }

  if (plan.allowedBranchIds !== null && !plan.allowedBranchIds.includes(branchId)) {
    return denied('BRANCH_NOT_ALLOWED', 'El plan no habilita el acceso a esta sede.');
  }

  if (membership.classesRemaining !== null && membership.classesRemaining <= 0) {
    return denied('NO_CLASSES_REMAINING', 'No quedan clases disponibles en el pack.');
  }

  if (
    plan.weeklyAccessLimit !== null &&
    attendance.distinctDaysThisWeekExcludingToday >= plan.weeklyAccessLimit
  ) {
    return denied('WEEKLY_LIMIT_REACHED', 'Se alcanzó el límite semanal de accesos.');
  }

  if (member.medicalClearanceUntil !== null && member.medicalClearanceUntil < today) {
    return denied('MEDICAL_CLEARANCE_EXPIRED', 'El apto médico está vencido.');
  }

  if (attendance.existsToday) {
    return allowed('DUPLICATE_WINDOW', 'El socio ya registró un ingreso hoy en esta sede.');
  }

  return allowed('OK', 'Acceso permitido.');
}
