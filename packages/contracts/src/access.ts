/**
 * Acceso y asistencia (API_CONTRACTS.md §9).
 *
 * `AccessMethod` real agrega `MEMBER_NUMBER` (no está en DATA_MODEL.md §6).
 * `AccessReasonCode` real usa otros nombres que el documento (`MEMBER_NOT_FOUND`
 * en vez de `NOT_FOUND`, `MEMBER_INACTIVE` en vez de `MEMBER_SUSPENDED` —
 * coherente con que `MemberStatus` no tiene `SUSPENDED` —, `NO_MEMBERSHIP`
 * en vez de `NO_ACTIVE_MEMBERSHIP`, `BRANCH_NOT_ALLOWED` en vez de
 * `WRONG_BRANCH`, `NO_CLASSES_REMAINING` en vez de `NO_CLASSES_LEFT`) y
 * agrega `MEMBERSHIP_CANCELLED`, `WEEKLY_LIMIT_REACHED` y
 * `MEDICAL_CLEARANCE_EXPIRED`; no tiene `OUTSIDE_SCHEDULE`. Se sigue el schema.
 */
import { z } from 'zod';
import { businessDateSchema, isoInstantSchema, offsetPaginatedResponseSchema, offsetPaginationQuerySchema, uuidSchema } from './common.js';
import { memberStatusSchema } from './members.js';

export const ACCESS_METHODS = ['DOCUMENT', 'CARD', 'MEMBER_NUMBER', 'FINGERPRINT', 'MANUAL'] as const;
export const accessMethodSchema = z.enum(ACCESS_METHODS);
export type AccessMethod = z.infer<typeof accessMethodSchema>;

export const ACCESS_DECISIONS = ['ALLOWED', 'DENIED'] as const;
export const accessDecisionSchema = z.enum(ACCESS_DECISIONS);
export type AccessDecision = z.infer<typeof accessDecisionSchema>;

export const ACCESS_REASON_CODES = [
  'OK',
  'DUPLICATE_WINDOW',
  'MEMBER_NOT_FOUND',
  'MEMBER_INACTIVE',
  'NO_MEMBERSHIP',
  'MEMBERSHIP_EXPIRED',
  'MEMBERSHIP_CANCELLED',
  'BRANCH_NOT_ALLOWED',
  'NO_CLASSES_REMAINING',
  'WEEKLY_LIMIT_REACHED',
  'DEBT_BLOCKED',
  'MEDICAL_CLEARANCE_EXPIRED',
  'BIOMETRIC_NO_MATCH',
] as const;
export const accessReasonCodeSchema = z.enum(ACCESS_REASON_CODES);
export type AccessReasonCode = z.infer<typeof accessReasonCodeSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /access/check — el endpoint más caliente del producto
// ─────────────────────────────────────────────────────────────────────────

export const accessCheckRequestSchema = z.object({
  branchId: uuidSchema,
  method: accessMethodSchema,
  identifier: z.string().min(1),
  registerAttendance: z.boolean().default(true),
});
export type AccessCheckRequest = z.infer<typeof accessCheckRequestSchema>;

const accessCheckMemberSchema = z.object({
  id: uuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  photoUrl: z.string().url().nullable(),
  status: memberStatusSchema,
});

const accessCheckMembershipSchema = z.object({
  planName: z.string(),
  endDate: businessDateSchema.nullable(),
  classesRemaining: z.number().int().nullable(),
});

/**
 * Siempre `200`, incluso si el acceso se deniega: la denegación es un
 * resultado válido de la consulta, no un error de la consulta en sí.
 */
export const accessCheckResponseSchema = z.object({
  decision: accessDecisionSchema,
  reasonCode: accessReasonCodeSchema,
  member: accessCheckMemberSchema.nullable(),
  membership: accessCheckMembershipSchema.nullable(),
  attendanceRegistered: z.boolean(),
  accessAttemptId: uuidSchema,
});
export type AccessCheckResponse = z.infer<typeof accessCheckResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /access/attempts — access:read_history
// ─────────────────────────────────────────────────────────────────────────

export const listAccessAttemptsQuerySchema = offsetPaginationQuerySchema.extend({
  branchId: uuidSchema.optional(),
  decision: accessDecisionSchema.optional(),
  method: accessMethodSchema.optional(),
  memberId: uuidSchema.optional(),
  from: isoInstantSchema.optional(),
  to: isoInstantSchema.optional(),
});
export type ListAccessAttemptsQuery = z.infer<typeof listAccessAttemptsQuerySchema>;

export const accessAttemptSchema = z.object({
  id: uuidSchema,
  branchId: uuidSchema,
  memberId: uuidSchema.nullable(),
  method: accessMethodSchema,
  /** Lo que se tipeó/escaneó, ya enmascarado por el backend antes de salir. */
  rawInputMasked: z.string().nullable(),
  decision: accessDecisionSchema,
  reasonCode: accessReasonCodeSchema,
  detail: z.string().nullable(),
  matchScore: z.number().int().nullable(),
  attendanceId: uuidSchema.nullable(),
  occurredAt: isoInstantSchema,
});
export type AccessAttempt = z.infer<typeof accessAttemptSchema>;

export const listAccessAttemptsResponseSchema = offsetPaginatedResponseSchema(accessAttemptSchema);
export type ListAccessAttemptsResponse = z.infer<typeof listAccessAttemptsResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /attendances — attendance:read
// ─────────────────────────────────────────────────────────────────────────

export const attendanceSchema = z.object({
  id: uuidSchema,
  branchId: uuidSchema,
  memberId: uuidSchema,
  membershipId: uuidSchema.nullable(),
  method: accessMethodSchema,
  /** Día de negocio en la zona de la sede. Es la clave del unique anti-doble-registro. */
  occurredOn: businessDateSchema,
  occurredAt: isoInstantSchema,
  branch: z.object({ id: uuidSchema, name: z.string() }),
  member: z.object({
    id: uuidSchema,
    firstName: z.string(),
    lastName: z.string(),
    documentMasked: z.string(),
  }),
  membership: z
    .object({
      id: uuidSchema,
      planName: z.string(),
    })
    .nullable(),
});
export type Attendance = z.infer<typeof attendanceSchema>;

export const listAttendancesQuerySchema = offsetPaginationQuerySchema.extend({
  branchId: uuidSchema.optional(),
  memberId: uuidSchema.optional(),
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
});
export type ListAttendancesQuery = z.infer<typeof listAttendancesQuerySchema>;

export const listAttendancesResponseSchema = offsetPaginatedResponseSchema(attendanceSchema);
export type ListAttendancesResponse = z.infer<typeof listAttendancesResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /attendances/stats — stats:read
// ─────────────────────────────────────────────────────────────────────────

export const attendanceStatsQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  from: businessDateSchema,
  to: businessDateSchema,
  hourFrom: z.number().int().min(0).max(23).optional(),
  hourTo: z.number().int().min(0).max(23).optional(),
});
export type AttendanceStatsQuery = z.infer<typeof attendanceStatsQuerySchema>;

export const attendanceStatsResponseSchema = z.object({
  total: z.number().int(),
  byWeekday: z.array(z.object({ weekday: z.number().int().min(0).max(6), count: z.number().int() })),
  byHour: z.array(z.object({ hour: z.number().int().min(0).max(23), count: z.number().int() })),
  /** Documento siempre enmascarado (ADR-018), incluso acá. */
  ranking: z.array(
    z.object({
      memberId: uuidSchema,
      fullName: z.string(),
      documentMasked: z.string(),
      count: z.number().int(),
    }),
  ),
  timezoneUsed: z.string(),
});
export type AttendanceStatsResponse = z.infer<typeof attendanceStatsResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /access/manual-attendance — access:operate, Idem
// ─────────────────────────────────────────────────────────────────────────

export const manualAttendanceRequestSchema = z.object({
  memberId: uuidSchema,
  branchId: uuidSchema,
  reason: z.string().min(10),
});
export type ManualAttendanceRequest = z.infer<typeof manualAttendanceRequestSchema>;

export const manualAttendanceResponseSchema = z.object({
  attendance: attendanceSchema,
});
export type ManualAttendanceResponse = z.infer<typeof manualAttendanceResponseSchema>;
