/**
 * Primitivas transversales de la API (API_CONTRACTS.md §1).
 *
 * Todo lo que no es específico de un recurso vive acá: errores RFC-7807,
 * paginación, y los tipos escalares que se repiten en cada input (dinero,
 * fechas de negocio, uuids, instantes).
 */
import { z } from 'zod';
import { isMoneyString } from '@pulso/config/money';
import { isBusinessDate } from '@pulso/config/time';

// ─────────────────────────────────────────────────────────────────────────
// Escalares
// ─────────────────────────────────────────────────────────────────────────

/** Dinero (ADR-010): SIEMPRE string decimal, nunca number. Reusa el regex de money.ts. */
export const moneySchema = z
  .string()
  .refine(isMoneyString, { message: 'Debe ser un string decimal, ej. "1500.00"' });
export type Money = z.infer<typeof moneySchema>;

/** Fecha de negocio `YYYY-MM-DD`, sin hora ni zona (API_CONTRACTS §1.7). */
export const businessDateSchema = z
  .string()
  .refine(isBusinessDate, { message: 'Debe ser una fecha YYYY-MM-DD' });
export type BusinessDate = z.infer<typeof businessDateSchema>;

export const uuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof uuidSchema>;

/** Instante ISO-8601 con offset explícito (API_CONTRACTS §1.7). Se guarda en UTC. */
export const isoInstantSchema = z.string().datetime({ offset: true });
export type IsoInstant = z.infer<typeof isoInstantSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Errores — RFC 7807 extendido (API_CONTRACTS §1.4)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Catálogo estable de códigos de error. El frontend hace matching sólo por
 * `code`, nunca por `title` ni `detail` (son para humanos y pueden cambiar).
 *
 * Incluye los códigos transversales de §1.4 más los que aparecen nombrados
 * junto a un status HTTP en cada endpoint del resto del documento.
 */
export const ERROR_CODES = [
  // Transversales (§1.4)
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'FEATURE_NOT_ENABLED',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'BUSINESS_RULE_VIOLATION',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  // Idempotencia (§1.9)
  'IDEMPOTENCY_IN_PROGRESS',
  // Auth (§3)
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'GYM_SUSPENDED',
  'MULTIPLE_GYMS',
  // Tenancy (§4)
  'PLAN_LIMIT_REACHED',
  'BRANCH_HAS_ACTIVE_DATA',
  // IAM (§5)
  'LAST_OWNER',
  // Socios (§6)
  'DUPLICATE_DOCUMENT',
  'DUPLICATE_CARD',
  'MEMBER_HAS_DEBT',
  // Catálogo y membresías (§7)
  'PLAN_IN_USE',
  'OVERLAPPING_MEMBERSHIP',
  'PLAN_NOT_FOUND',
  'PLAN_NOT_AVAILABLE_IN_BRANCH',
  // Caja (§8)
  'CASH_SESSION_NOT_OPEN',
  'CASH_REGISTER_ALREADY_OPEN',
  'USER_ALREADY_HAS_OPEN_SESSION',
  'PENDING_OPERATIONS',
  'SESSION_ALREADY_CLOSED',
  'NOT_SESSION_OWNER',
  'AMOUNT_MUST_BE_POSITIVE',
  'REQUIRES_APPROVAL',
  'ALREADY_REVERSED',
  'SESSION_CLOSED',
  'AMOUNT_EXCEEDS_DEBT',
  // Acceso (§9)
  'BRANCH_NOT_FOUND',
  // Biometría (§10)
  'NO_BIOMETRIC_CONSENT',
  'FINGER_ALREADY_ENROLLED',
  'AGENT_OFFLINE',
  'INVALID_DEVICE_TOKEN',
  'AGENT_REVOKED',
  'TEMPLATE_QUALITY_TOO_LOW',
  /** Las muestras del mismo enrolamiento no se reconocen entre sí. */
  'ENROLLMENT_SAMPLES_INCONSISTENT',
  /** SourceAFIS no respondió: el intento queda registrado y se puede reintentar. */
  'BIOMETRIC_MATCHER_UNAVAILABLE',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export const errorCodeSchema = z.enum(ERROR_CODES);

/** Un problema de validación puntual, referido a un path del body/query. */
export const fieldErrorSchema = z.object({
  path: z.string(),
  code: z.string(),
  message: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

/** Shape único de error en toda la API (API_CONTRACTS §1.4). */
export const problemDetailsSchema = z.object({
  type: z.string().url(),
  code: errorCodeSchema,
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(fieldErrorSchema).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Paginación (API_CONTRACTS §1.5)
// ─────────────────────────────────────────────────────────────────────────

export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_PAGE_LIMIT = 25;

const limitSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(MAX_PAGE_LIMIT)
  .default(DEFAULT_PAGE_LIMIT);

/** Cursor: modo por defecto. `cursor` es opaco, no se interpreta en el cliente. */
export const cursorPaginationQuerySchema = z.object({
  limit: limitSchema,
  cursor: z.string().optional(),
});
export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;

export const cursorPageInfoSchema = z.object({
  limit: z.number().int(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type CursorPageInfo = z.infer<typeof cursorPageInfoSchema>;

/** Offset: sólo para listados donde el usuario salta a una página concreta (socios). */
export const offsetPaginationQuerySchema = z.object({
  limit: limitSchema,
  page: z.coerce.number().int().positive().default(1),
});
export type OffsetPaginationQuery = z.infer<typeof offsetPaginationQuerySchema>;

export const offsetPageInfoSchema = z.object({
  limit: z.number().int(),
  page: z.number().int(),
  hasMore: z.boolean(),
  /** Sólo en modo offset: un COUNT extra tiene costo, no se pide en modo cursor. */
  total: z.number().int(),
});
export type OffsetPageInfo = z.infer<typeof offsetPageInfoSchema>;

/** Envelope de lista paginada por cursor. */
export function cursorPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pageInfo: cursorPageInfoSchema,
  });
}

/** Envelope de lista paginada por offset. */
export function offsetPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    pageInfo: offsetPageInfoSchema,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Orden (API_CONTRACTS §1.6)
// ─────────────────────────────────────────────────────────────────────────

export const orderSchema = z.enum(['asc', 'desc']);
export type SortOrder = z.infer<typeof orderSchema>;

/** Búsqueda de texto libre: mínimo 2 caracteres (rate-limiteado en el backend). */
export const searchQuerySchema = z.string().min(2);

// ─────────────────────────────────────────────────────────────────────────
// Idempotencia (API_CONTRACTS §1.9)
// ─────────────────────────────────────────────────────────────────────────

/** Header `Idempotency-Key` de los endpoints marcados `Idem: sí`. */
export const idempotencyKeySchema = z.string().uuid();
