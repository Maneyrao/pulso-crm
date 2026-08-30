import type { AccessReasonCode } from '@pulso/contracts/access';
import type { StatusTone } from '@pulso/ui';

export interface AccessReasonConfig {
  tone: StatusTone;
  title: string;
  /** Texto por defecto si la API no manda `detail`. */
  description: string;
  /** Acción sugerida (botón), si corresponde — ver FRONTEND_PLAN §6.3. */
  action?: 'COLLECT_FEE' | 'SELL_PACK' | 'CREATE_MEMBER' | 'COLLECT_DEBT';
}

/**
 * Un estado nunca se comunica sólo por color (FRONTEND_PLAN §8): cada
 * `reasonCode` tiene texto + tono + acción explícitos acá, y `StatusBadge`
 * siempre le suma un ícono coherente con el tono.
 */
export const ACCESS_REASON_CONFIG: Record<AccessReasonCode, AccessReasonConfig> = {
  OK: { tone: 'success', title: 'Acceso permitido', description: 'El socio puede ingresar.' },
  DUPLICATE_WINDOW: {
    tone: 'info',
    title: 'Ya registró asistencia hoy',
    description:
      'Este socio ya tiene un ingreso registrado en el día. No se duplica la asistencia.',
  },
  MEMBER_NOT_FOUND: {
    tone: 'neutral',
    title: 'Socio no encontrado',
    description: 'No encontramos a nadie con ese dato. Puede ser un socio nuevo.',
    action: 'CREATE_MEMBER',
  },
  MEMBER_INACTIVE: {
    tone: 'danger',
    title: 'Socio inactivo',
    description: 'Este socio figura como dado de baja.',
  },
  NO_MEMBERSHIP: {
    tone: 'warning',
    title: 'Sin membresía activa',
    description: 'El socio no tiene ninguna membresía activa.',
    action: 'SELL_PACK',
  },
  MEMBERSHIP_EXPIRED: {
    tone: 'warning',
    title: 'Membresía vencida',
    description: 'La membresía del socio venció.',
    action: 'COLLECT_FEE',
  },
  MEMBERSHIP_CANCELLED: {
    tone: 'warning',
    title: 'Membresía cancelada',
    description: 'La membresía activa fue cancelada.',
    action: 'SELL_PACK',
  },
  BRANCH_NOT_ALLOWED: {
    tone: 'danger',
    title: 'No habilitado en esta sede',
    description: 'El plan del socio no incluye esta sede.',
  },
  NO_CLASSES_REMAINING: {
    tone: 'warning',
    title: 'Sin clases disponibles',
    description: 'El socio agotó las clases de su pack.',
    action: 'SELL_PACK',
  },
  WEEKLY_LIMIT_REACHED: {
    tone: 'warning',
    title: 'Límite semanal alcanzado',
    description: 'El socio ya usó todos sus accesos de la semana.',
  },
  DEBT_BLOCKED: {
    tone: 'danger',
    title: 'Acceso bloqueado por deuda',
    description: 'El socio tiene una deuda que bloquea el ingreso.',
    action: 'COLLECT_DEBT',
  },
  MEDICAL_CLEARANCE_EXPIRED: {
    tone: 'warning',
    title: 'Apto médico vencido',
    description: 'El apto médico del socio venció.',
  },
  BIOMETRIC_NO_MATCH: {
    tone: 'danger',
    title: 'Huella no reconocida',
    description: 'No pudimos confirmar la identidad por huella.',
  },
  BIOMETRIC_CAPTURE_FAILED: {
    tone: 'warning',
    title: 'Lectura no válida',
    description:
      'La muestra no sirvió. Limpiá el lector y volvé a apoyar el dedo, quieto y centrado.',
  },
};
