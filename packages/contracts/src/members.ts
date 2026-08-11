/**
 * Socios (API_CONTRACTS.md §6).
 *
 * Discrepancias resueltas a favor de schema.prisma:
 *  - `DocumentType` real es `DNI|CUIT|CUIL|PASSPORT|LC|LE|CI` (no
 *    `DNI|CUIT|PASSPORT|CPF|RUT|CURP|OTHER` como dice DATA_MODEL.md §1).
 *    Ya está catalogado en `@pulso/config/document` (`DOCUMENT_TYPES`); se
 *    reusa esa constante para no tener dos fuentes de verdad.
 *  - `MemberStatus` real es sólo `ACTIVE|INACTIVE` (sin `SUSPENDED`).
 *  - El campo de tarjeta es `cardCode`, no `cardNumber`.
 *  - `MemberDocumentKind` real es
 *    `MEDICAL_CLEARANCE|ID_SCAN|CONSENT|OTHER` (no
 *    `MEDICAL_CERTIFICATE|ID|OTHER`).
 */
import { z } from 'zod';
import { DOCUMENT_TYPES, isValidDocument } from '@pulso/config/document';
import { isE164 } from '@pulso/config/phone';
import {
  businessDateSchema,
  isoInstantSchema,
  moneySchema,
  offsetPaginatedResponseSchema,
  offsetPaginationQuerySchema,
  orderSchema,
  searchQuerySchema,
  uuidSchema,
} from './common.js';

// ─────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export type MemberDocumentType = z.infer<typeof documentTypeSchema>;

export const MEMBER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

export const GENDERS = ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;

export const MEMBER_DOCUMENT_KINDS = ['MEDICAL_CLEARANCE', 'ID_SCAN', 'CONSENT', 'OTHER'] as const;
export const memberDocumentKindSchema = z.enum(MEMBER_DOCUMENT_KINDS);
export type MemberDocumentKind = z.infer<typeof memberDocumentKindSchema>;

export const LEDGER_ENTRY_TYPES = ['DEBIT', 'CREDIT'] as const;
export const ledgerEntryTypeSchema = z.enum(LEDGER_ENTRY_TYPES);
export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;

export const LEDGER_REASONS = [
  'MEMBERSHIP_CHARGE',
  'PRODUCT_CHARGE',
  'ADJUSTMENT_CHARGE',
  'PAYMENT',
  'REFUND',
  'REVERSAL',
  'DISCOUNT',
] as const;
export const ledgerReasonSchema = z.enum(LEDGER_REASONS);
export type LedgerReason = z.infer<typeof ledgerReasonSchema>;

/** Filtro de estado de membresía en el buscador de socios; no es un enum de Prisma. */
export const memberMembershipFilterSchema = z.enum(['ACTIVE', 'EXPIRED', 'NONE']);
export type MemberMembershipFilter = z.infer<typeof memberMembershipFilterSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /members
// ─────────────────────────────────────────────────────────────────────────

const MEMBER_SORTABLE_FIELDS = ['lastName', 'firstName', 'createdAt', 'memberNumber', 'balance'] as const;

export const listMembersQuerySchema = offsetPaginationQuerySchema.extend({
  q: searchQuerySchema.optional(),
  status: memberStatusSchema.optional(),
  branchId: uuidSchema.optional(),
  planId: uuidSchema.optional(),
  membershipStatus: memberMembershipFilterSchema.optional(),
  hasDebt: z.coerce.boolean().optional(),
  createdFrom: businessDateSchema.optional(),
  createdTo: businessDateSchema.optional(),
  sort: z.enum(MEMBER_SORTABLE_FIELDS).default('lastName'),
  order: orderSchema.default('asc'),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

const memberActiveMembershipSummarySchema = z.object({
  planName: z.string(),
  endDate: businessDateSchema.nullable(),
  classesRemaining: z.number().int().nullable(),
});

export const memberListItemSchema = z.object({
  id: uuidSchema,
  memberNumber: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  /** Enmascarado salvo `member:read_document` (ADR-018). */
  documentMasked: z.string(),
  phone: z.string().nullable(),
  status: memberStatusSchema,
  branch: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  activeMembership: memberActiveMembershipSummarySchema.nullable(),
  balance: moneySchema,
  /** URL prefirmada, TTL 5 minutos. */
  photoUrl: z.string().url().nullable(),
});
export type MemberListItem = z.infer<typeof memberListItemSchema>;

export const listMembersResponseSchema = offsetPaginatedResponseSchema(memberListItemSchema);
export type ListMembersResponse = z.infer<typeof listMembersResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /members
// ─────────────────────────────────────────────────────────────────────────

export const createMemberRequestSchema = z
  .object({
    documentType: documentTypeSchema,
    documentNumber: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    branchId: uuidSchema,
    email: z.string().email().optional(),
    /** Se normaliza a E.164 en el backend; acá se valida el formato de entrada laxo. */
    phone: z.string().min(6).optional(),
    birthDate: businessDateSchema.optional(),
    gender: genderSchema.optional(),
    address: z.string().optional(),
    cardCode: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (!isValidDocument(val.documentType, val.documentNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['documentNumber'],
        message: `Documento inválido para ${val.documentType}`,
      });
    }
  });
export type CreateMemberRequest = z.infer<typeof createMemberRequestSchema>;

/**
 * Teléfono ya normalizado a E.164, tal como lo persiste el backend
 * (`normalizePhone` en `@pulso/config/phone`). Se usa en las respuestas,
 * donde el dato ya pasó la normalización.
 */
export const e164PhoneSchema = z.string().refine(isE164, { message: 'Debe ser E.164, ej. "+5491155555555"' });

export const memberSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  memberNumber: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  documentType: documentTypeSchema,
  documentNumber: z.string(),
  email: z.string().email().nullable(),
  phone: e164PhoneSchema.nullable(),
  birthDate: businessDateSchema.nullable(),
  gender: genderSchema.nullable(),
  address: z.string().nullable(),
  cardCode: z.string().nullable(),
  photoKey: z.string().nullable(),
  status: memberStatusSchema,
  branchId: uuidSchema.nullable(),
  balance: moneySchema,
  medicalClearanceUntil: businessDateSchema.nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Member = z.infer<typeof memberSchema>;

export const createMemberResponseSchema = memberSchema;

// ─────────────────────────────────────────────────────────────────────────
// GET /members/:id — incluye membresías, últimos pagos, últimas asistencias
// ─────────────────────────────────────────────────────────────────────────

const recentMembershipSchema = z.object({
  id: uuidSchema,
  planId: uuidSchema,
  planName: z.string(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED']),
  startDate: businessDateSchema,
  endDate: businessDateSchema.nullable(),
  classesRemaining: z.number().int().nullable(),
});

const recentPaymentSchema = z.object({
  id: uuidSchema,
  amount: moneySchema,
  paymentMethodName: z.string(),
  createdAt: isoInstantSchema,
});

const recentAttendanceSchema = z.object({
  id: uuidSchema,
  occurredOn: businessDateSchema,
  occurredAt: isoInstantSchema,
  branchName: z.string(),
});

export const memberDetailSchema = memberSchema.extend({
  recentMemberships: z.array(recentMembershipSchema),
  recentPayments: z.array(recentPaymentSchema),
  recentAttendances: z.array(recentAttendanceSchema),
});
export type MemberDetail = z.infer<typeof memberDetailSchema>;

export const getMemberResponseSchema = memberDetailSchema;

// ─────────────────────────────────────────────────────────────────────────
// PATCH /members/:id
// ─────────────────────────────────────────────────────────────────────────

export const updateMemberRequestSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().nullable(),
    phone: z.string().min(6).nullable(),
    birthDate: businessDateSchema.nullable(),
    gender: genderSchema.nullable(),
    address: z.string().nullable(),
    cardCode: z.string().nullable(),
    branchId: uuidSchema.nullable(),
    medicalClearanceUntil: businessDateSchema.nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    notes: z.string().nullable(),
  })
  .partial();
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export const updateMemberResponseSchema = memberSchema;

// ─────────────────────────────────────────────────────────────────────────
// POST /members/:id/deactivate
// ─────────────────────────────────────────────────────────────────────────

export const deactivateMemberRequestSchema = z
  .object({
    force: z.boolean().default(false),
    reason: z.string().min(5).optional(),
  })
  .refine((v) => !v.force || Boolean(v.reason), {
    message: 'reason es obligatorio cuando force = true',
    path: ['reason'],
  });
export type DeactivateMemberRequest = z.infer<typeof deactivateMemberRequestSchema>;

export const deactivateMemberResponseSchema = memberSchema;

// ─────────────────────────────────────────────────────────────────────────
// POST /members/:id/photo/upload-url y /documents/upload-url
// ─────────────────────────────────────────────────────────────────────────

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const photoUploadUrlRequestSchema = z.object({
  mimeType: z.enum(IMAGE_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
});
export type PhotoUploadUrlRequest = z.infer<typeof photoUploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string(),
  expiresAt: isoInstantSchema,
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'] as const;

export const documentUploadUrlRequestSchema = z.object({
  kind: memberDocumentKindSchema,
  fileName: z.string().min(1),
  mimeType: z.enum(DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  validUntil: businessDateSchema.optional(),
});
export type DocumentUploadUrlRequest = z.infer<typeof documentUploadUrlRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Ledger (cuenta corriente)
// ─────────────────────────────────────────────────────────────────────────

export const ledgerEntrySchema = z.object({
  id: uuidSchema,
  memberId: uuidSchema,
  type: ledgerEntryTypeSchema,
  reason: ledgerReasonSchema,
  amount: moneySchema,
  balanceAfter: moneySchema,
  description: z.string().nullable(),
  membershipId: uuidSchema.nullable(),
  cashMovementId: uuidSchema.nullable(),
  reversalOfId: uuidSchema.nullable(),
  createdAt: isoInstantSchema,
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

/** `GET /members/:id/ledger` — `member:read`. */
export const getMemberLedgerResponseSchema = z.object({
  entries: z.array(ledgerEntrySchema),
  balance: moneySchema,
});
export type GetMemberLedgerResponse = z.infer<typeof getMemberLedgerResponseSchema>;

/**
 * `POST /members/:id/ledger` — `payment:collect`, Idem. Ajuste manual: el
 * backend siempre lo graba con `reason: ADJUSTMENT_CHARGE`; el `reason` de
 * este request es el motivo en texto libre que exige el endpoint, no el
 * enum `LedgerReason`.
 */
export const createLedgerAdjustmentRequestSchema = z.object({
  type: ledgerEntryTypeSchema,
  amount: moneySchema,
  reason: z.string().min(10),
});
export type CreateLedgerAdjustmentRequest = z.infer<typeof createLedgerAdjustmentRequestSchema>;

export const createLedgerAdjustmentResponseSchema = ledgerEntrySchema;

// ─────────────────────────────────────────────────────────────────────────
// GET /members/:id/attendances
// ─────────────────────────────────────────────────────────────────────────

export const listMemberAttendancesQuerySchema = offsetPaginationQuerySchema.extend({
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
});
export type ListMemberAttendancesQuery = z.infer<typeof listMemberAttendancesQuerySchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /members/debtors
// ─────────────────────────────────────────────────────────────────────────

export const listDebtorsQuerySchema = offsetPaginationQuerySchema.extend({
  branchId: uuidSchema.optional(),
  sort: z.enum(['debtAge', 'balance']).default('debtAge'),
  order: orderSchema.default('desc'),
});
export type ListDebtorsQuery = z.infer<typeof listDebtorsQuerySchema>;

export const debtorListItemSchema = memberListItemSchema.extend({
  /** Fecha del asiento `DEBIT` más antiguo aún no saldado. */
  debtSince: businessDateSchema.nullable(),
});
export type DebtorListItem = z.infer<typeof debtorListItemSchema>;

export const listDebtorsResponseSchema = offsetPaginatedResponseSchema(debtorListItemSchema);
export type ListDebtorsResponse = z.infer<typeof listDebtorsResponseSchema>;
