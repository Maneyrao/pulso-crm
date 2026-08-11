/**
 * Catálogo de permisos (DATA_MODEL.md §2 "Permission") y roles de sistema.
 *
 * No es una tabla: `Role.permissions` en Prisma es `String[]` sin enum de
 * base. Este archivo es la única fuente de verdad de qué strings son válidos;
 * el backend valida cada `Role.permissions` contra `PERMISSIONS` al guardar.
 *
 * Formato: `recurso:accion`.
 */
import { z } from 'zod';

export const PERMISSIONS = [
  // Socios
  'member:read',
  'member:write',
  'member:delete',
  'member:read_document',
  // Membresías
  'membership:write',
  'membership:delete',
  // Catálogo
  'plan:read',
  'plan:write',
  // Caja
  'cash:read',
  'cash:operate',
  'cash:open_close',
  'cash:reverse',
  'cash:approve',
  // Pagos sobre la cuenta corriente del socio
  'payment:collect',
  'payment:refund',
  // Acceso y asistencia
  'access:operate',
  'access:read_history',
  'attendance:read',
  // Biometría [E7-8]
  'biometrics:enroll',
  'biometrics:revoke',
  'biometrics:read',
  'device:manage',
  // Reservas [POST]
  'reservation:read',
  'reservation:write',
  // POS [POST]
  'product:read',
  'product:write',
  'product:sell',
  // Mensajería
  'message:send',
  'message:broadcast',
  'message:config',
  // Entrenamiento [POST]
  'routine:read',
  'routine:write',
  'instructor:read',
  'instructor:write',
  'instructor:attendance',
  // Fidelización [POST]
  'loyalty:read',
  'loyalty:config',
  'loyalty:redeem',
  // Reportes
  'stats:read',
  'stats:export',
  // Facturación [POST]
  'billing:read',
  'billing:emit',
  'billing:config',
  // IAM
  'user:read',
  'user:write',
  // Tenancy
  'config:read',
  'config:write',
  // Auditoría
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export const permissionSchema = z.enum(PERMISSIONS);

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

// ─────────────────────────────────────────────────────────────────────────
// Roles de sistema (DATA_MODEL.md §2 "Role")
// ─────────────────────────────────────────────────────────────────────────

/**
 * `PLATFORM_ADMIN` es [POST] (administración de la plataforma, no del
 * gimnasio) y todavía no tiene superficie de API: se agrega cuando se
 * implemente esa etapa.
 */
export const SYSTEM_ROLE_CODES = ['OWNER', 'MANAGER', 'RECEPTIONIST', 'INSTRUCTOR'] as const;
export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];
export const systemRoleCodeSchema = z.enum(SYSTEM_ROLE_CODES);

/**
 * Set de permisos por defecto de cada rol de sistema. Se usa para sembrar
 * `Role` al crear un gimnasio; el gimnasio puede clonar y ajustar a partir
 * de acá, pero no editar el rol de sistema en sí (API_CONTRACTS §5).
 */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleCode, readonly Permission[]> = {
  // Dueño: acceso total, incluida la configuración de facturación/fiscal.
  OWNER: ALL_PERMISSIONS,

  // Gerencia: todo lo operativo. Se reserva `billing:config` al OWNER porque
  // toca datos fiscales/legales del gimnasio (decisión de diseño, no del brief).
  MANAGER: ALL_PERMISSIONS.filter((p) => p !== 'billing:config'),

  // Recepción: mostrador — socios, cobros del día a día, acceso, mensajería
  // de envío (no configuración). Sin reversas ni aprobaciones ni biometría.
  RECEPTIONIST: [
    'member:read',
    'member:write',
    'member:read_document',
    'membership:write',
    'plan:read',
    'cash:read',
    'cash:operate',
    'cash:open_close',
    'payment:collect',
    'access:operate',
    'access:read_history',
    'attendance:read',
    'reservation:read',
    'reservation:write',
    'product:read',
    'product:sell',
    'message:send',
    'loyalty:read',
    'loyalty:redeem',
    'stats:read',
    'user:read',
  ],

  // Instructor: sus clases, sus rutinas, ver socios y asistencia. Sin caja
  // ni administración.
  INSTRUCTOR: [
    'member:read',
    'attendance:read',
    'plan:read',
    'routine:read',
    'routine:write',
    'instructor:read',
    'instructor:attendance',
    'reservation:read',
  ],
};
