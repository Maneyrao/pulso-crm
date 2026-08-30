/**
 * Reportes (API_CONTRACTS.md §12).
 *
 * Todos aceptan `from`, `to`, `branchId?`, interpretados en la zona de la
 * sede filtrada; si el filtro abarca sedes con zonas distintas, la
 * respuesta declara `timezoneUsed` (API_CONTRACTS §1.7). Documento siempre
 * enmascarado, incluso en exportaciones, salvo `member:read_document`.
 */
import { z } from 'zod';
import { businessDateSchema, moneySchema, uuidSchema } from './common.js';

export const reportDateRangeQuerySchema = z.object({
  from: businessDateSchema,
  to: businessDateSchema,
  branchId: uuidSchema.optional(),
  hourFrom: z.number().int().min(0).max(23).optional(),
  hourTo: z.number().int().min(0).max(23).optional(),
});
export type ReportDateRangeQuery = z.infer<typeof reportDateRangeQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /reports/dashboard — stats:read
// ─────────────────────────────────────────────────────────────────────────

export const dashboardResponseSchema = z.object({
  activeMembers: z.number().int(),
  newMembersThisMonth: z.number().int(),
  totalDebt: moneySchema,
  todayIncome: moneySchema,
  todayAttendances: z.number().int(),
  expiringMembershipsNext7Days: z.number().int(),
  timezoneUsed: z.string(),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /reports/attendance — stats:read
// ─────────────────────────────────────────────────────────────────────────

export const attendanceReportResponseSchema = z.object({
  total: z.number().int(),
  byWeekday: z.array(
    z.object({ weekday: z.number().int().min(0).max(6), count: z.number().int() }),
  ),
  byHour: z.array(z.object({ hour: z.number().int().min(0).max(23), count: z.number().int() })),
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
export type AttendanceReportResponse = z.infer<typeof attendanceReportResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /reports/finance — stats:read
// ─────────────────────────────────────────────────────────────────────────

export const financeReportResponseSchema = z.object({
  byPaymentMethod: z.array(
    z.object({ paymentMethodId: uuidSchema, name: z.string(), total: moneySchema }),
  ),
  byConcept: z.array(z.object({ cashConceptId: uuidSchema, name: z.string(), total: moneySchema })),
  byBranch: z.array(z.object({ branchId: uuidSchema, name: z.string(), total: moneySchema })),
  series: z.array(z.object({ date: businessDateSchema, amount: moneySchema })),
  timezoneUsed: z.string(),
});
export type FinanceReportResponse = z.infer<typeof financeReportResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /reports/members — stats:read
// ─────────────────────────────────────────────────────────────────────────

export const membersReportResponseSchema = z.object({
  signups: z.number().int(),
  cancellations: z.number().int(),
  byPlan: z.array(z.object({ planId: uuidSchema, name: z.string(), count: z.number().int() })),
  /** 0..1 — proporción de socios activos al cierre del período que ya lo estaban al inicio. */
  retentionRate: z.number().min(0).max(1),
  timezoneUsed: z.string(),
});
export type MembersReportResponse = z.infer<typeof membersReportResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /reports/export — stats:export
// ─────────────────────────────────────────────────────────────────────────

export const REPORT_KINDS = ['dashboard', 'attendance', 'finance', 'members'] as const;
export const reportKindSchema = z.enum(REPORT_KINDS);
export type ReportKind = z.infer<typeof reportKindSchema>;

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export const exportFormatSchema = z.enum(EXPORT_FORMATS);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportReportRequestSchema = z.object({
  report: reportKindSchema,
  from: businessDateSchema,
  to: businessDateSchema,
  branchId: uuidSchema.optional(),
  format: exportFormatSchema.default('csv'),
});
export type ExportReportRequest = z.infer<typeof exportReportRequestSchema>;

/**
 * `202`: la generación se encola y no bloquea el request. La URL prefirmada
 * de descarga llega por un canal separado (job status / notificación) que
 * el documento no especifica en detalle todavía.
 */
export const exportReportResponseSchema = z.object({
  jobId: uuidSchema,
  status: z.literal('QUEUED'),
});
export type ExportReportResponse = z.infer<typeof exportReportResponseSchema>;
