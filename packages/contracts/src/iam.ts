/**
 * IAM (API_CONTRACTS.md §5) — usuarios y roles.
 *
 * Reglas de negocio que el schema Zod por sí solo no puede expresar (se
 * validan en el backend, se documentan acá para que no se pierdan):
 *  - No se puede desactivar al último `OWNER` (`409 LAST_OWNER`).
 *  - Un usuario no puede auto-quitarse `user:write`.
 *  - Los roles de sistema (`isSystem: true`) no se editan, se clonan.
 *  - La creación de usuario NO acepta password del cliente: el backend
 *    genera una temporal y marca `mustChangePassword`.
 */
import { z } from 'zod';
import {
  cursorPaginationQuerySchema,
  cursorPaginatedResponseSchema,
  isoInstantSchema,
  searchQuerySchema,
  uuidSchema,
} from './common.js';
import { permissionSchema } from './permissions.js';

// ─────────────────────────────────────────────────────────────────────────
// User
// ─────────────────────────────────────────────────────────────────────────

export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'LOCKED'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  status: userStatusSchema,
  mustChangePassword: z.boolean(),
  lastLoginAt: isoInstantSchema.nullable(),
  roleIds: z.array(uuidSchema),
  branchIds: z.array(uuidSchema),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type User = z.infer<typeof userSchema>;

/** `GET /users` — `user:read`. */
export const listUsersQuerySchema = cursorPaginationQuerySchema.extend({
  q: searchQuerySchema.optional(),
  status: userStatusSchema.optional(),
  roleId: uuidSchema.optional(),
  branchId: uuidSchema.optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

export const listUsersResponseSchema = cursorPaginatedResponseSchema(userSchema);
export type ListUsersResponse = z.infer<typeof listUsersResponseSchema>;

/** `POST /users` — `user:write`. Sin `password`: el backend genera una temporal. */
export const createUserRequestSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  roleIds: z.array(uuidSchema).min(1),
  /** Vacío = todas las sedes del gimnasio. */
  branchIds: z.array(uuidSchema).default([]),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const createUserResponseSchema = z.object({
  user: userSchema,
  /** Se muestra una única vez; el usuario la cambia en el primer login. */
  temporaryPassword: z.string(),
});
export type CreateUserResponse = z.infer<typeof createUserResponseSchema>;

/** `GET /users/:id` — `user:read`. */
export const getUserResponseSchema = userSchema;

/** `PATCH /users/:id` — `user:write`. Auditado con before/after. */
export const updateUserRequestSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().nullable(),
    roleIds: z.array(uuidSchema).min(1),
    branchIds: z.array(uuidSchema),
  })
  .partial();
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const updateUserResponseSchema = userSchema;

/** `POST /users/:id/deactivate` — `user:write`. `409 LAST_OWNER` si aplica. */
export const deactivateUserResponseSchema = userSchema;

/** `POST /users/:id/reset-password` — `user:write`. */
export const resetPasswordResponseSchema = z.object({
  temporaryPassword: z.string(),
});
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Role
// ─────────────────────────────────────────────────────────────────────────

export const roleSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(permissionSchema),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type Role = z.infer<typeof roleSchema>;

/** `GET /roles` — `user:read`. */
export const listRolesResponseSchema = z.object({
  data: z.array(roleSchema),
});
export type ListRolesResponse = z.infer<typeof listRolesResponseSchema>;

/**
 * `POST /roles` — `user:write`. Roles creados por el gimnasio siempre nacen
 * `isSystem: false`; para partir de un rol de sistema, el cliente clona sus
 * permisos y los manda acá (el backend no expone un endpoint "clone" aparte).
 */
export const createRoleRequestSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(permissionSchema).min(1),
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

export const createRoleResponseSchema = roleSchema;

/** `PATCH /roles/:id` — `user:write`. `409 CONFLICT` si `role.isSystem`. */
export const updateRoleRequestSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable(),
    permissions: z.array(permissionSchema).min(1),
  })
  .partial();
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

export const updateRoleResponseSchema = roleSchema;
