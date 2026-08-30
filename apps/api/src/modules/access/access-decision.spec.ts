import { describe, expect, it } from 'vitest';
import {
  type AccessCheckSnapshot,
  type MemberSnapshot,
  type MembershipSnapshot,
  type PlanSnapshot,
  evaluateAccess,
} from './access-decision.js';

const BRANCH_A = 'branch-a';
const BRANCH_B = 'branch-b';
const TODAY = '2026-08-09';

const member = (over: Partial<MemberSnapshot> = {}): MemberSnapshot => ({
  id: 'member-1',
  status: 'ACTIVE',
  medicalClearanceUntil: null,
  ...over,
});

const membership = (over: Partial<MembershipSnapshot> = {}): MembershipSnapshot => ({
  id: 'membership-1',
  status: 'ACTIVE',
  endDate: null,
  classesRemaining: null,
  ...over,
});

const plan = (over: Partial<PlanSnapshot> = {}): PlanSnapshot => ({
  id: 'plan-1',
  weeklyAccessLimit: null,
  allowedBranchIds: null,
  ...over,
});

/** Snapshot base: todo en regla, decisión esperada ALLOWED/OK. */
function baseSnapshot(over: Partial<AccessCheckSnapshot> = {}): AccessCheckSnapshot {
  return {
    branchId: BRANCH_A,
    today: TODAY,
    member: member(),
    membership: membership(),
    plan: plan(),
    attendance: { existsToday: false, distinctDaysThisWeekExcludingToday: 0 },
    config: {},
    ...over,
  };
}

describe('evaluateAccess — un test por reasonCode', () => {
  it('OK: todo en regla', () => {
    const result = evaluateAccess(baseSnapshot());
    expect(result).toEqual({ decision: 'ALLOWED', reasonCode: 'OK', detail: expect.any(String) });
  });

  it('MEMBER_NOT_FOUND: no se encontró socio', () => {
    const result = evaluateAccess(baseSnapshot({ member: null, membership: null, plan: null }));
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('MEMBER_NOT_FOUND');
  });

  it('MEMBER_INACTIVE: socio dado de baja', () => {
    const result = evaluateAccess(baseSnapshot({ member: member({ status: 'INACTIVE' }) }));
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('MEMBER_INACTIVE');
  });

  it('NO_MEMBERSHIP: socio activo sin ninguna membresía', () => {
    const result = evaluateAccess(baseSnapshot({ membership: null, plan: null }));
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('NO_MEMBERSHIP');
  });

  it('MEMBERSHIP_CANCELLED: la membresía fue cancelada', () => {
    const result = evaluateAccess(
      baseSnapshot({ membership: membership({ status: 'CANCELLED' }) }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('MEMBERSHIP_CANCELLED');
  });

  it('MEMBERSHIP_EXPIRED: status EXPIRED', () => {
    const result = evaluateAccess(baseSnapshot({ membership: membership({ status: 'EXPIRED' }) }));
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('MEMBERSHIP_EXPIRED');
  });

  it('MEMBERSHIP_EXPIRED: status SUSPENDED se trata como no vigente', () => {
    const result = evaluateAccess(
      baseSnapshot({ membership: membership({ status: 'SUSPENDED' }) }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('MEMBERSHIP_EXPIRED');
  });

  it('MEMBERSHIP_EXPIRED: status ACTIVE pero endDate ya pasó (defensivo)', () => {
    const result = evaluateAccess(
      baseSnapshot({ membership: membership({ status: 'ACTIVE', endDate: '2026-08-01' }) }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('MEMBERSHIP_EXPIRED');
  });

  it('endDate futuro no vence la membresía', () => {
    const result = evaluateAccess(
      baseSnapshot({ membership: membership({ status: 'ACTIVE', endDate: '2026-12-31' }) }),
    );
    expect(result.decision).toBe('ALLOWED');
    expect(result.reasonCode).toBe('OK');
  });

  it('BRANCH_NOT_ALLOWED: el plan no incluye esta sede', () => {
    const result = evaluateAccess(
      baseSnapshot({ branchId: BRANCH_A, plan: plan({ allowedBranchIds: [BRANCH_B] }) }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('BRANCH_NOT_ALLOWED');
  });

  it('allowedBranchIds null habilita cualquier sede', () => {
    const result = evaluateAccess(baseSnapshot({ plan: plan({ allowedBranchIds: null }) }));
    expect(result.decision).toBe('ALLOWED');
  });

  it('NO_CLASSES_REMAINING: pack sin clases', () => {
    const result = evaluateAccess(
      baseSnapshot({ membership: membership({ classesRemaining: 0 }) }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('NO_CLASSES_REMAINING');
  });

  it('classesRemaining null (no es pack) nunca bloquea', () => {
    const result = evaluateAccess(
      baseSnapshot({ membership: membership({ classesRemaining: null }) }),
    );
    expect(result.decision).toBe('ALLOWED');
  });

  it('classesRemaining positivo permite el acceso', () => {
    const result = evaluateAccess(
      baseSnapshot({ membership: membership({ classesRemaining: 3 }) }),
    );
    expect(result.decision).toBe('ALLOWED');
  });

  it('WEEKLY_LIMIT_REACHED: ya asistió el máximo de días esta semana', () => {
    const result = evaluateAccess(
      baseSnapshot({
        plan: plan({ weeklyAccessLimit: 3 }),
        attendance: { existsToday: false, distinctDaysThisWeekExcludingToday: 3 },
      }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('WEEKLY_LIMIT_REACHED');
  });

  it('weeklyAccessLimit null nunca bloquea por límite semanal', () => {
    const result = evaluateAccess(
      baseSnapshot({
        plan: plan({ weeklyAccessLimit: null }),
        attendance: { existsToday: false, distinctDaysThisWeekExcludingToday: 50 },
      }),
    );
    expect(result.decision).toBe('ALLOWED');
  });

  it('el límite semanal EXCLUYE la asistencia de hoy: reentrar no cuenta como día nuevo', () => {
    // El socio ya usó sus 3 días permitidos esta semana, uno de ellos hoy.
    // distinctDaysThisWeekExcludingToday no cuenta hoy, así que la reentrada
    // no debe caer en WEEKLY_LIMIT_REACHED: cae en DUPLICATE_WINDOW más abajo.
    const result = evaluateAccess(
      baseSnapshot({
        plan: plan({ weeklyAccessLimit: 3 }),
        attendance: { existsToday: true, distinctDaysThisWeekExcludingToday: 2 },
      }),
    );
    expect(result.decision).toBe('ALLOWED');
    expect(result.reasonCode).toBe('DUPLICATE_WINDOW');
  });

  it('MEDICAL_CLEARANCE_EXPIRED: apto médico vencido', () => {
    const result = evaluateAccess(
      baseSnapshot({ member: member({ medicalClearanceUntil: '2026-08-01' }) }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('MEDICAL_CLEARANCE_EXPIRED');
  });

  it('medicalClearanceUntil null no exige apto médico', () => {
    const result = evaluateAccess(
      baseSnapshot({ member: member({ medicalClearanceUntil: null }) }),
    );
    expect(result.decision).toBe('ALLOWED');
  });

  it('apto médico vigente (fecha futura) permite el acceso', () => {
    const result = evaluateAccess(
      baseSnapshot({ member: member({ medicalClearanceUntil: '2026-12-31' }) }),
    );
    expect(result.decision).toBe('ALLOWED');
  });

  it('DUPLICATE_WINDOW: ya hay asistencia hoy en esta sede — ALLOWED, no un error', () => {
    const result = evaluateAccess(
      baseSnapshot({ attendance: { existsToday: true, distinctDaysThisWeekExcludingToday: 1 } }),
    );
    expect(result.decision).toBe('ALLOWED');
    expect(result.reasonCode).toBe('DUPLICATE_WINDOW');
  });
});

describe('evaluateAccess — orden de evaluación (el primero que falla decide)', () => {
  it('un socio inactivo sin membresía se rechaza por MEMBER_INACTIVE, no por NO_MEMBERSHIP', () => {
    const result = evaluateAccess(
      baseSnapshot({ member: member({ status: 'INACTIVE' }), membership: null, plan: null }),
    );
    expect(result.reasonCode).toBe('MEMBER_INACTIVE');
  });

  it('una membresía cancelada en una sede no permitida se rechaza por MEMBERSHIP_CANCELLED, no por BRANCH_NOT_ALLOWED', () => {
    const result = evaluateAccess(
      baseSnapshot({
        membership: membership({ status: 'CANCELLED' }),
        plan: plan({ allowedBranchIds: [BRANCH_B] }),
      }),
    );
    expect(result.reasonCode).toBe('MEMBERSHIP_CANCELLED');
  });

  it('sin clases y con el límite semanal alcanzado se rechaza por NO_CLASSES_REMAINING primero', () => {
    const result = evaluateAccess(
      baseSnapshot({
        membership: membership({ classesRemaining: 0 }),
        plan: plan({ weeklyAccessLimit: 1 }),
        attendance: { existsToday: false, distinctDaysThisWeekExcludingToday: 5 },
      }),
    );
    expect(result.reasonCode).toBe('NO_CLASSES_REMAINING');
  });

  it('apto médico vencido con asistencia ya registrada hoy se rechaza igual: el chequeo de salud va antes que DUPLICATE_WINDOW', () => {
    const result = evaluateAccess(
      baseSnapshot({
        member: member({ medicalClearanceUntil: '2026-01-01' }),
        attendance: { existsToday: true, distinctDaysThisWeekExcludingToday: 1 },
      }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.reasonCode).toBe('MEDICAL_CLEARANCE_EXPIRED');
  });
});
