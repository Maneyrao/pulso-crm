/**
 * Catálogo (API_CONTRACTS.md §7) — actividades y planes.
 *
 * `BillingCycle` real es `MONTHLY|QUARTERLY|BIANNUAL|ANNUAL|CLASS_PACK`
 * (DATA_MODEL.md §4 dice `SEMIANNUAL`; el schema usa `BIANNUAL`). El campo
 * de límite semanal es `weeklyAccessLimit`, no `weeklyClassLimit`.
 */
import { z } from 'zod';
import { isoInstantSchema, moneySchema, uuidSchema } from './common.js';

// ─────────────────────────────────────────────────────────────────────────
// Activity
// ─────────────────────────────────────────────────────────────────────────

export const activitySchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Activity = z.infer<typeof activitySchema>;

export const listActivitiesResponseSchema = z.object({ data: z.array(activitySchema) });
export type ListActivitiesResponse = z.infer<typeof listActivitiesResponseSchema>;

export const createActivityRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
});
export type CreateActivityRequest = z.infer<typeof createActivityRequestSchema>;

export const createActivityResponseSchema = activitySchema;

export const updateActivityRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable(),
    color: z.string().nullable(),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateActivityRequest = z.infer<typeof updateActivityRequestSchema>;

export const updateActivityResponseSchema = activitySchema;

// ─────────────────────────────────────────────────────────────────────────
// Plan
// ─────────────────────────────────────────────────────────────────────────

export const BILLING_CYCLES = ['MONTHLY', 'QUARTERLY', 'BIANNUAL', 'ANNUAL', 'CLASS_PACK'] as const;
export const billingCycleSchema = z.enum(BILLING_CYCLES);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

export const planSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  price: moneySchema,
  billingCycle: billingCycleSchema,
  /** Override de la duración por defecto del ciclo. Obligatorio para `CLASS_PACK`. */
  durationDays: z.number().int().positive().nullable(),
  /** Null = acceso libre. Un número = pack de clases. */
  classesIncluded: z.number().int().positive().nullable(),
  /** Accesos por semana permitidos. Null = sin límite. */
  weeklyAccessLimit: z.number().int().positive().nullable(),
  isActive: z.boolean(),
  activityIds: z.array(uuidSchema),
  /** Sedes donde se puede usar. Vacío = todas las sedes del gimnasio. */
  branchIds: z.array(uuidSchema),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Plan = z.infer<typeof planSchema>;

export const listPlansResponseSchema = z.object({ data: z.array(planSchema) });
export type ListPlansResponse = z.infer<typeof listPlansResponseSchema>;

export const createPlanRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    price: moneySchema,
    billingCycle: billingCycleSchema,
    durationDays: z.number().int().positive().optional(),
    classesIncluded: z.number().int().positive().optional(),
    weeklyAccessLimit: z.number().int().positive().optional(),
    activityIds: z.array(uuidSchema).default([]),
    branchIds: z.array(uuidSchema).default([]),
  })
  .superRefine((val, ctx) => {
    if (val.billingCycle === 'CLASS_PACK' && val.durationDays === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['durationDays'],
        message: 'CLASS_PACK no tiene duración implícita: durationDays es obligatorio',
      });
    }
  });
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export const createPlanResponseSchema = planSchema;

export const updatePlanRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable(),
    price: moneySchema,
    durationDays: z.number().int().positive().nullable(),
    classesIncluded: z.number().int().positive().nullable(),
    weeklyAccessLimit: z.number().int().positive().nullable(),
    isActive: z.boolean(),
    activityIds: z.array(uuidSchema),
    branchIds: z.array(uuidSchema),
  })
  .partial();
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;

export const updatePlanResponseSchema = planSchema;

/** `DELETE /plans/:id` — soft delete. `409 PLAN_IN_USE` si tiene membresías activas. */
export const deletePlanResponseSchema = planSchema;
