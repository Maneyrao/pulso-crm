/**
 * Caja (API_CONTRACTS.md §8).
 *
 * Discrepancia grande resuelta a favor de schema.prisma: `CashMovementType`
 * real es sólo `INCOME|EXPENSE` (DATA_MODEL.md §5 describe 7 valores:
 * `INCOME, EXPENSE, MEMBERSHIP_PAYMENT, DEBT_PAYMENT, SALE, REFUND,
 * REVERSAL`, más un campo `direction` que tampoco existe en el modelo real).
 * La distinción de "para qué fue" vive en `cashConceptId` (con
 * `CashConcept.isSystem` para los conceptos que no se pueden borrar, p.ej.
 * cobro de cuota o pago de deuda) y las reversas se modelan con
 * `reversalOfId` + `isReversed`, no con un tercer valor de `type`.
 *
 * También: `PaymentMethod` no tiene un `kind` enum (`CASH`/`CARD_DEBIT`/…)
 * en el schema real — sólo `code`, `name`, `countsAsCash`. Y
 * `CashOperationRequest.kind` es `LARGE_EXPENSE|REVERSAL|CLOSED_SESSION_CHANGE`,
 * no `REVERSAL|EXPENSE_OVER_LIMIT|REFUND` como dice el documento.
 */
import { z } from 'zod';
import { businessDateSchema, isoInstantSchema, moneySchema, uuidSchema } from './common.js';

// ─────────────────────────────────────────────────────────────────────────
// PaymentMethod
// ─────────────────────────────────────────────────────────────────────────

export const paymentMethodSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  code: z.string(),
  name: z.string(),
  /** Si cuenta para el arqueo de efectivo al cerrar la caja. */
  countsAsCash: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const listPaymentMethodsResponseSchema = z.object({ data: z.array(paymentMethodSchema) });
export type ListPaymentMethodsResponse = z.infer<typeof listPaymentMethodsResponseSchema>;

export const createPaymentMethodRequestSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  countsAsCash: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});
export type CreatePaymentMethodRequest = z.infer<typeof createPaymentMethodRequestSchema>;

export const createPaymentMethodResponseSchema = paymentMethodSchema;

export const updatePaymentMethodRequestSchema = z
  .object({
    name: z.string().min(1),
    countsAsCash: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
  })
  .partial();
export type UpdatePaymentMethodRequest = z.infer<typeof updatePaymentMethodRequestSchema>;

export const updatePaymentMethodResponseSchema = paymentMethodSchema;

// ─────────────────────────────────────────────────────────────────────────
// CashConcept
// ─────────────────────────────────────────────────────────────────────────

export const CASH_MOVEMENT_TYPES = ['INCOME', 'EXPENSE'] as const;
export const cashMovementTypeSchema = z.enum(CASH_MOVEMENT_TYPES);
export type CashMovementType = z.infer<typeof cashMovementTypeSchema>;

export const cashConceptSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  code: z.string(),
  name: z.string(),
  type: cashMovementTypeSchema,
  /** Conceptos de sistema (cobro de cuota, pago de deuda) no se borran. */
  isSystem: z.boolean(),
  isActive: z.boolean(),
});
export type CashConcept = z.infer<typeof cashConceptSchema>;

export const listCashConceptsResponseSchema = z.object({ data: z.array(cashConceptSchema) });
export type ListCashConceptsResponse = z.infer<typeof listCashConceptsResponseSchema>;

export const createCashConceptRequestSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: cashMovementTypeSchema,
});
export type CreateCashConceptRequest = z.infer<typeof createCashConceptRequestSchema>;

export const createCashConceptResponseSchema = cashConceptSchema;

export const updateCashConceptRequestSchema = z
  .object({ name: z.string().min(1), isActive: z.boolean() })
  .partial();
export type UpdateCashConceptRequest = z.infer<typeof updateCashConceptRequestSchema>;

export const updateCashConceptResponseSchema = cashConceptSchema;

// ─────────────────────────────────────────────────────────────────────────
// CashRegister / CashSession
// ─────────────────────────────────────────────────────────────────────────

export const cashRegisterSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  branchId: uuidSchema,
  name: z.string(),
  isActive: z.boolean(),
});
export type CashRegister = z.infer<typeof cashRegisterSchema>;

export const CASH_SESSION_STATUSES = ['OPEN', 'CLOSED'] as const;
export const cashSessionStatusSchema = z.enum(CASH_SESSION_STATUSES);
export type CashSessionStatus = z.infer<typeof cashSessionStatusSchema>;

export const cashSessionSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  branchId: uuidSchema,
  cashRegisterId: uuidSchema,
  status: cashSessionStatusSchema,
  openedByUserId: uuidSchema,
  openedAt: isoInstantSchema,
  openingAmount: moneySchema,
  openingNotes: z.string().nullable(),
  closedByUserId: uuidSchema.nullable(),
  closedAt: isoInstantSchema.nullable(),
  closingNotes: z.string().nullable(),
  /** Calculados por el backend al cerrar. El cliente no los manda. */
  expectedCash: moneySchema.nullable(),
  declaredCash: moneySchema.nullable(),
  cashDifference: moneySchema.nullable(),
  /** Día de negocio en la zona de la sede (ADR-021). */
  businessDate: businessDateSchema,
});
export type CashSession = z.infer<typeof cashSessionSchema>;

/** `GET /cash/sessions`, `GET /cash/sessions/current` — `cash:read`. */
export const listCashSessionsQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  status: cashSessionStatusSchema.optional(),
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
});
export type ListCashSessionsQuery = z.infer<typeof listCashSessionsQuerySchema>;

export const listCashSessionsResponseSchema = z.object({ data: z.array(cashSessionSchema) });
export type ListCashSessionsResponse = z.infer<typeof listCashSessionsResponseSchema>;

export const getCurrentCashSessionResponseSchema = cashSessionSchema.nullable();

/** `POST /cash/sessions` — `cash:open_close`, Idem. */
export const openCashSessionRequestSchema = z.object({
  cashRegisterId: uuidSchema,
  openingAmount: moneySchema,
  notes: z.string().optional(),
});
export type OpenCashSessionRequest = z.infer<typeof openCashSessionRequestSchema>;

export const openCashSessionResponseSchema = z.object({ session: cashSessionSchema });
export type OpenCashSessionResponse = z.infer<typeof openCashSessionResponseSchema>;

const closingDetailInputSchema = z.object({
  paymentMethodId: uuidSchema,
  amount: moneySchema,
});

/** `POST /cash/sessions/:id/close` — `cash:open_close`, Idem. */
export const closeCashSessionRequestSchema = z.object({
  declared: z.array(closingDetailInputSchema).min(1),
  notes: z.string().optional(),
});
export type CloseCashSessionRequest = z.infer<typeof closeCashSessionRequestSchema>;

export const cashSessionClosingDetailSchema = z.object({
  paymentMethodId: uuidSchema,
  expectedAmount: moneySchema,
  declaredAmount: moneySchema,
  difference: moneySchema,
});
export type CashSessionClosingDetail = z.infer<typeof cashSessionClosingDetailSchema>;

export const closeCashSessionResponseSchema = z.object({
  session: cashSessionSchema,
  details: z.array(cashSessionClosingDetailSchema),
  differenceTotal: moneySchema,
});
export type CloseCashSessionResponse = z.infer<typeof closeCashSessionResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// CashMovement
// ─────────────────────────────────────────────────────────────────────────

export const cashMovementSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  cashSessionId: uuidSchema,
  type: cashMovementTypeSchema,
  amount: moneySchema,
  paymentMethodId: uuidSchema,
  cashConceptId: uuidSchema,
  description: z.string().nullable(),
  memberId: uuidSchema.nullable(),
  member: z
    .object({
      id: uuidSchema,
      firstName: z.string(),
      lastName: z.string(),
    })
    .nullable()
    .optional(),
  membershipId: uuidSchema.nullable(),
  reversalOfId: uuidSchema.nullable(),
  isReversed: z.boolean(),
  reversalReason: z.string().nullable(),
  createdByUserId: uuidSchema,
  createdAt: isoInstantSchema,
});
export type CashMovement = z.infer<typeof cashMovementSchema>;

/** `GET /cash/movements` — `cash:read`. */
export const listCashMovementsQuerySchema = z.object({
  cashSessionId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
  memberId: uuidSchema.optional(),
  type: cashMovementTypeSchema.optional(),
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
});
export type ListCashMovementsQuery = z.infer<typeof listCashMovementsQuerySchema>;

export const listCashMovementsResponseSchema = z.object({ data: z.array(cashMovementSchema) });
export type ListCashMovementsResponse = z.infer<typeof listCashMovementsResponseSchema>;

/** `POST /cash/movements` — `cash:operate`, Idem. `422 AMOUNT_MUST_BE_POSITIVE` si `amount <= 0`. */
export const createCashMovementRequestSchema = z.object({
  type: cashMovementTypeSchema,
  cashConceptId: uuidSchema,
  paymentMethodId: uuidSchema,
  amount: moneySchema,
  detail: z.string().optional(),
  memberId: uuidSchema.optional(),
});
export type CreateCashMovementRequest = z.infer<typeof createCashMovementRequestSchema>;

/**
 * 201 si el movimiento se crea directo; 202 si el egreso supera el umbral
 * de aprobación y queda como `CashOperationRequest` pendiente
 * (`409 REQUIRES_APPROVAL` en el detalle del error, `202` en el 2xx).
 */
export const createCashMovementResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('CREATED'), movement: cashMovementSchema }),
  z.object({ status: z.literal('REQUIRES_APPROVAL'), operationRequestId: uuidSchema }),
]);
export type CreateCashMovementResponse = z.infer<typeof createCashMovementResponseSchema>;

/** `POST /cash/movements/:id/reverse` — `cash:reverse`, Idem. */
export const reverseCashMovementRequestSchema = z.object({
  reason: z.string().min(10),
});
export type ReverseCashMovementRequest = z.infer<typeof reverseCashMovementRequestSchema>;

export const reverseCashMovementResponseSchema = z.object({
  reversal: cashMovementSchema,
  original: cashMovementSchema,
});
export type ReverseCashMovementResponse = z.infer<typeof reverseCashMovementResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// CashOperationRequest
// ─────────────────────────────────────────────────────────────────────────

export const CASH_OPERATION_KINDS = ['LARGE_EXPENSE', 'REVERSAL', 'CLOSED_SESSION_CHANGE'] as const;
export const cashOperationKindSchema = z.enum(CASH_OPERATION_KINDS);
export type CashOperationKind = z.infer<typeof cashOperationKindSchema>;

export const CASH_OPERATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const cashOperationStatusSchema = z.enum(CASH_OPERATION_STATUSES);
export type CashOperationStatus = z.infer<typeof cashOperationStatusSchema>;

export const cashOperationRequestSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  cashSessionId: uuidSchema.nullable(),
  kind: cashOperationKindSchema,
  status: cashOperationStatusSchema,
  payload: z.record(z.unknown()),
  requestedByUserId: uuidSchema,
  requestedAt: isoInstantSchema,
  reason: z.string(),
  resolvedByUserId: uuidSchema.nullable(),
  resolvedAt: isoInstantSchema.nullable(),
  resolutionNote: z.string().nullable(),
});
export type CashOperationRequestDto = z.infer<typeof cashOperationRequestSchema>;

/** `GET /cash/operations?status=pending` — `cash:read`. */
export const listCashOperationsQuerySchema = z.object({
  status: cashOperationStatusSchema.optional(),
  branchId: uuidSchema.optional(),
  cashSessionId: uuidSchema.optional(),
});
export type ListCashOperationsQuery = z.infer<typeof listCashOperationsQuerySchema>;

export const listCashOperationsResponseSchema = z.object({
  data: z.array(cashOperationRequestSchema),
});
export type ListCashOperationsResponse = z.infer<typeof listCashOperationsResponseSchema>;

/** `POST /cash/operations/:id/approve` — `cash:approve`, Idem. */
export const approveCashOperationRequestSchema = z.object({
  note: z.string().optional(),
});
export type ApproveCashOperationRequest = z.infer<typeof approveCashOperationRequestSchema>;

export const approveCashOperationResponseSchema = cashOperationRequestSchema;

/** `POST /cash/operations/:id/reject` — `cash:approve`, Idem. Exige `reason`. */
export const rejectCashOperationRequestSchema = z.object({
  reason: z.string().min(5),
});
export type RejectCashOperationRequest = z.infer<typeof rejectCashOperationRequestSchema>;

export const rejectCashOperationResponseSchema = cashOperationRequestSchema;

// ─────────────────────────────────────────────────────────────────────────
// GET /cash/daybook — cash:read
// ─────────────────────────────────────────────────────────────────────────

export const daybookQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  from: businessDateSchema,
  to: businessDateSchema,
});
export type DaybookQuery = z.infer<typeof daybookQuerySchema>;

const daybookMethodTotalSchema = z.object({
  paymentMethodId: uuidSchema,
  income: moneySchema,
  expense: moneySchema,
});

const daybookDaySchema = z.object({
  businessDate: businessDateSchema,
  sessions: z.array(cashSessionSchema),
  movements: z.array(cashMovementSchema),
  totalsByMethod: z.array(daybookMethodTotalSchema),
});

export const daybookResponseSchema = z.object({
  data: z.array(daybookDaySchema),
  timezoneUsed: z.string(),
});
export type DaybookResponse = z.infer<typeof daybookResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /members/:id/pay-debt, POST /members/:id/refund
// ─────────────────────────────────────────────────────────────────────────

export const memberPaymentQuoteQuerySchema = z.object({ paymentMethodId: uuidSchema.optional() });
export const memberPaymentQuoteSchema = z.object({
  balance: moneySchema,
  ledgerVersion: uuidSchema.nullable(),
  debt: moneySchema,
  surcharge: moneySchema,
  total: moneySchema,
  lines: z.array(z.object({
    membershipId: uuidSchema.nullable(),
    label: z.string(),
    startDate: businessDateSchema.nullable(),
    endDate: businessDateSchema.nullable(),
    amount: moneySchema,
    surcharge: moneySchema,
  })),
});
export type MemberPaymentQuote = z.infer<typeof memberPaymentQuoteSchema>;

/** Full settlement only. The server recalculates and rejects a stale quote. */
export const payDebtRequestSchema = z.object({
  paymentMethodId: uuidSchema,
  expectedTotal: moneySchema,
  ledgerVersion: uuidSchema.nullable(),
}).strict();
export type PayDebtRequest = z.infer<typeof payDebtRequestSchema>;

export const payDebtResponseSchema = z.object({
  cashMovements: z.array(cashMovementSchema),
  balance: moneySchema,
});
export type PayDebtResponse = z.infer<typeof payDebtResponseSchema>;

/** `payment:refund`, Idem. Exige caja abierta y motivo. */
export const refundRequestSchema = z.object({
  amount: moneySchema,
  paymentMethodId: uuidSchema,
  reason: z.string().min(10),
});
export type RefundRequest = z.infer<typeof refundRequestSchema>;

export const refundResponseSchema = z.object({
  cashMovement: cashMovementSchema,
  balance: moneySchema,
});
export type RefundResponse = z.infer<typeof refundResponseSchema>;
