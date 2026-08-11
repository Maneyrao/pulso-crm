/**
 * Tenancy (API_CONTRACTS.md §4) — gimnasio y sedes.
 *
 * `Gym` en schema.prisma NO tiene `email`/`phone`/`address` (a diferencia de
 * DATA_MODEL.md §1): tiene `locale`, `logoKey`, `primaryColor` y un
 * `status: GymStatus` (`ACTIVE`|`SUSPENDED`|`CANCELLED`) en vez del
 * `saasStatus` con `TRIAL`/`PAST_DUE` que describe el documento. Se sigue el
 * schema.
 */
import { z } from 'zod';
import { isoInstantSchema, uuidSchema } from './common.js';

// ─────────────────────────────────────────────────────────────────────────
// Gym
// ─────────────────────────────────────────────────────────────────────────

export const GYM_STATUSES = ['ACTIVE', 'SUSPENDED', 'CANCELLED'] as const;
export const gymStatusSchema = z.enum(GYM_STATUSES);
export type GymStatus = z.infer<typeof gymStatusSchema>;

export const gymSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  country: z.string(),
  currency: z.string(),
  locale: z.string(),
  status: gymStatusSchema,
  suspendedAt: isoInstantSchema.nullable(),
  suspendedReason: z.string().nullable(),
  saasPlanId: uuidSchema,
  logoKey: z.string().nullable(),
  primaryColor: z.string().nullable(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Gym = z.infer<typeof gymSchema>;

/** `GET /gym` — `config:read`. */
export const getGymResponseSchema = gymSchema;

/** `PATCH /gym` — `config:write`. Campos legales/fiscales quedan afuera adrede. */
export const updateGymRequestSchema = z
  .object({
    name: z.string().min(1),
    legalName: z.string().nullable(),
    taxId: z.string().nullable(),
    country: z.string().length(2),
    currency: z.string().length(3),
    locale: z.string(),
    logoKey: z.string().nullable(),
    primaryColor: z.string().nullable(),
  })
  .partial();
export type UpdateGymRequest = z.infer<typeof updateGymRequestSchema>;

export const updateGymResponseSchema = gymSchema;

// ─────────────────────────────────────────────────────────────────────────
// Branch
// ─────────────────────────────────────────────────────────────────────────

export const branchSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  name: z.string(),
  timezone: z.string(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Branch = z.infer<typeof branchSchema>;

/** `GET /branches` — `config:read`. */
export const listBranchesResponseSchema = z.object({
  data: z.array(branchSchema),
});
export type ListBranchesResponse = z.infer<typeof listBranchesResponseSchema>;

/** `POST /branches` — `config:write`. `403 PLAN_LIMIT_REACHED` si excede `maxBranches`. */
export const createBranchRequestSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
});
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;

export const createBranchResponseSchema = branchSchema;

/** `PATCH /branches/:id` — `config:write`. */
export const updateBranchRequestSchema = z
  .object({
    name: z.string().min(1),
    timezone: z.string().min(1),
    address: z.string().nullable(),
    phone: z.string().nullable(),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateBranchRequest = z.infer<typeof updateBranchRequestSchema>;

export const updateBranchResponseSchema = branchSchema;

/**
 * `DELETE /branches/:id` — sólo desactiva (`isActive = false`).
 * `409 BRANCH_HAS_ACTIVE_DATA` si tiene socios o caja abierta.
 */
export const deactivateBranchResponseSchema = branchSchema;
