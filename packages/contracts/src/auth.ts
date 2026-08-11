/**
 * Auth (API_CONTRACTS.md §3).
 *
 * Login, refresh y logout mueven cookies httpOnly (`pulso_at`, `pulso_rt`,
 * `pulso_csrf`); esos flujos no tienen body de request/response más allá de
 * lo que se modela acá. El agente local no pasa por acá: usa
 * `Authorization: Bearer <deviceToken>` (ver biometría, etapas 7-8).
 */
import { z } from 'zod';
import { uuidSchema } from './common.js';
import { permissionSchema } from './permissions.js';
import { featureKeySchema } from './features.js';

// ─────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  /** Requerido sólo cuando el email existe en más de un gimnasio (409 MULTIPLE_GYMS). */
  gymSlug: z.string().optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: uuidSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authGymSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  name: z.string(),
  currency: z.string(),
  features: z.array(featureKeySchema),
});
export type AuthGym = z.infer<typeof authGymSchema>;

export const authBranchSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  timezone: z.string(),
});
export type AuthBranch = z.infer<typeof authBranchSchema>;

/**
 * Shape compartido por `POST /auth/login` y `GET /auth/me`: `me` es la
 * fuente de verdad de permisos y features para el frontend, sin cookies.
 */
export const authSessionSchema = z.object({
  user: authUserSchema,
  gym: authGymSchema,
  branches: z.array(authBranchSchema),
  permissions: z.array(permissionSchema),
  defaultBranchId: uuidSchema,
});
export type AuthSession = z.infer<typeof authSessionSchema>;

export const loginResponseSchema = authSessionSchema;
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const meResponseSchema = authSessionSchema;
export type MeResponse = z.infer<typeof meResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /auth/refresh, POST /auth/logout — sólo cookies, 204 sin body.
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// POST /auth/select-branch
// ─────────────────────────────────────────────────────────────────────────

export const selectBranchRequestSchema = z.object({
  branchId: uuidSchema,
});
export type SelectBranchRequest = z.infer<typeof selectBranchRequestSchema>;

export const selectBranchResponseSchema = z.object({
  activeBranchId: uuidSchema,
});
export type SelectBranchResponse = z.infer<typeof selectBranchResponseSchema>;
