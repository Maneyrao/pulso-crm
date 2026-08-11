/**
 * Membresías (API_CONTRACTS.md §7 — `POST /members/:id/memberships` en adelante).
 *
 * Discrepancias resueltas a favor de schema.prisma:
 *  - `MembershipStatus` real es `ACTIVE|EXPIRED|CANCELLED|SUSPENDED` (no
 *    incluye `FROZEN` como sugiere DATA_MODEL.md §4).
 *  - El modelo `Membership` NO tiene columna `instructorId`: el `input?`
 *    documentado en API_CONTRACTS §7 no tiene dónde persistirse. Se omite
 *    acá; asignar instructor a una membresía queda para cuando exista esa
 *    relación (Etapa 11, entrenamiento).
 *  - `endDate` es nullable (los packs de clases vencen por consumo, no por
 *    fecha) y conviven `classesIncluded` + `classesRemaining` en el mismo
 *    registro, no sólo `classesRemaining` como dice el documento.
 */
import { z } from 'zod';
import { businessDateSchema, isoInstantSchema, moneySchema, uuidSchema } from './common.js';
import { ledgerEntrySchema } from './members.js';
import { cashMovementSchema } from './cash.js';

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED'] as const;
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const membershipSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  memberId: uuidSchema,
  planId: uuidSchema,
  branchId: uuidSchema.nullable(),
  status: membershipStatusSchema,
  startDate: businessDateSchema,
  endDate: businessDateSchema.nullable(),
  /** Precio congelado al momento de asignar. Cambiar el plan no reescribe la historia. */
  pricePaid: moneySchema,
  classesIncluded: z.number().int().nullable(),
  classesRemaining: z.number().int().nullable(),
  cancelledAt: isoInstantSchema.nullable(),
  cancelledReason: z.string().nullable(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /members/:id/memberships
// ─────────────────────────────────────────────────────────────────────────

export const membershipChargeModeSchema = z.enum(['NOW', 'DEBT']);
export type MembershipChargeMode = z.infer<typeof membershipChargeModeSchema>;

/**
 * `mode: NOW` exige sesión de caja abierta del usuario en la sede y cobra
 * en el momento (`paymentMethodId`/`amount` obligatorios). `mode: DEBT`
 * crea el `DEBIT` sin tocar caja.
 */
export const membershipChargeSchema = z
  .object({
    mode: membershipChargeModeSchema,
    paymentMethodId: uuidSchema.optional(),
    amount: moneySchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'NOW') {
      if (!val.paymentMethodId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['paymentMethodId'],
          message: 'Obligatorio cuando mode = NOW',
        });
      }
      if (!val.amount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amount'],
          message: 'Obligatorio cuando mode = NOW',
        });
      }
    }
  });
export type MembershipCharge = z.infer<typeof membershipChargeSchema>;

export const createMembershipRequestSchema = z.object({
  planId: uuidSchema,
  branchId: uuidSchema,
  startDate: businessDateSchema,
  /** Reemplaza `Plan.price` para esta membresía puntual (descuentos, becas). */
  priceOverride: moneySchema.optional(),
  charge: membershipChargeSchema,
});
export type CreateMembershipRequest = z.infer<typeof createMembershipRequestSchema>;

export const createMembershipResponseSchema = z.object({
  membership: membershipSchema,
  ledgerEntry: ledgerEntrySchema,
  /** Sólo presente si `charge.mode === 'NOW'`. */
  cashMovement: cashMovementSchema.optional(),
});
export type CreateMembershipResponse = z.infer<typeof createMembershipResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /members/:id/memberships
// ─────────────────────────────────────────────────────────────────────────

export const listMemberMembershipsResponseSchema = z.object({
  data: z.array(membershipSchema),
});
export type ListMemberMembershipsResponse = z.infer<typeof listMemberMembershipsResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /memberships/:id/cancel — membership:delete
// ─────────────────────────────────────────────────────────────────────────

export const cancelMembershipRequestSchema = z.object({
  reason: z.string().min(5),
});
export type CancelMembershipRequest = z.infer<typeof cancelMembershipRequestSchema>;

export const cancelMembershipResponseSchema = membershipSchema;
