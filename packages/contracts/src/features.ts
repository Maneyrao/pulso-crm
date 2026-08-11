/**
 * Catálogo de feature flags por plan SaaS.
 *
 * `SaasPlan.features` en Prisma es `String[]` (sin enum de base, ADR-022) y
 * `Gym.status` decide si el gimnasio puede operar en absoluto; las features
 * deciden QUÉ puede usar mientras opera. `GymFeatureOverride` puede
 * habilitar/deshabilitar una feature puntual sin cambiar de plan [POST].
 *
 * Este archivo es la única fuente de verdad de qué strings son features
 * válidas — el backend rechaza cualquier `feature` fuera de `FEATURE_KEYS`
 * al crear/editar un `SaasPlan`.
 */
import { z } from 'zod';

export const FEATURE_KEYS = [
  /** Lectores biométricos + agente local (Etapas 7-8). */
  'biometrics',
  /** Envío de mensajes por WhatsApp (recibos, recordatorios, broadcast). */
  'messaging_whatsapp',
  /** Envío de mensajes por email. */
  'messaging_email',
  /** Exportación asincrónica de reportes (`POST /reports/export`). */
  'reports_export',
  /** Reservas de clases con cupo [POST]. */
  'reservations',
  /** Punto de venta de productos y stock [POST]. */
  'pos',
  /** Rutinas de entrenamiento asignadas por instructor [POST]. */
  'training_routines',
  /** Programa de puntos/fidelización [POST]. */
  'loyalty',
  /** Facturación electrónica ARCA [POST]. */
  'billing_arca',
  /** Asistente conversacional (IA) [POST]. */
  'ai_assistant',
  /** Más de una sede activa. Complementa (no reemplaza) `SaasPlan.maxBranches`. */
  'multi_branch',
  /** Gestión de agentes/dispositivos de acceso (`/agents`, `/devices`). */
  'device_management',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const featureKeySchema = z.enum(FEATURE_KEYS);

/** Lista de features habilitadas de un gimnasio, tal como viaja en `auth.me`. */
export const gymFeaturesSchema = z.array(featureKeySchema);

export function hasFeature(features: readonly string[], key: FeatureKey): boolean {
  return features.includes(key);
}

// ─────────────────────────────────────────────────────────────────────────
// Catálogo de referencia de planes SaaS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Códigos de referencia usados por el seed y por tests. `SaasPlan.code` en
 * la base es un `String` libre (no un enum): un gimnasio real puede tener un
 * plan con otro código. Esto es sólo el catálogo por defecto de la etapa MVP.
 */
export const SAAS_PLAN_CODES = ['STARTER', 'GROWTH', 'SCALE'] as const;
export type SaasPlanCode = (typeof SAAS_PLAN_CODES)[number];
export const saasPlanCodeSchema = z.enum(SAAS_PLAN_CODES);

export const DEFAULT_PLAN_FEATURES: Record<SaasPlanCode, readonly FeatureKey[]> = {
  STARTER: ['messaging_whatsapp'],
  GROWTH: ['messaging_whatsapp', 'messaging_email', 'reports_export', 'multi_branch'],
  SCALE: [
    'messaging_whatsapp',
    'messaging_email',
    'reports_export',
    'multi_branch',
    'biometrics',
    'device_management',
    'reservations',
    'pos',
    'training_routines',
    'loyalty',
    'billing_arca',
    'ai_assistant',
  ],
};
