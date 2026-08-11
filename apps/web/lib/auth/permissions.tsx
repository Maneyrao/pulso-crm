'use client';

import type { ReactNode } from 'react';
import type { FeatureKey } from '@pulso/contracts/features';
import type { Permission } from '@pulso/contracts/permissions';
import { useSessionStore } from '../stores/session.js';

/**
 * `true` si el usuario de la sesión activa tiene el permiso dado. Es
 * conveniencia de UI: el backend vuelve a validar todo (regla dura #4).
 */
export function usePermission(permission: Permission): boolean {
  return useSessionStore((state) => state.permissions.includes(permission));
}

/** `true` si el plan del gimnasio (más overrides) incluye la feature. */
export function useFeature(feature: FeatureKey): boolean {
  return useSessionStore((state) => state.gym?.features.includes(feature) ?? false);
}

export interface PermissionGateProps {
  permission: Permission;
  children: ReactNode;
  /**
   * Qué mostrar si falta el permiso. Por defecto nada: un ítem sin permiso no
   * se renderiza deshabilitado, para no revelar que existe (FRONTEND_PLAN §4).
   */
  fallback?: ReactNode;
}

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const allowed = usePermission(permission);
  return allowed ? <>{children}</> : <>{fallback}</>;
}

export interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const enabled = useFeature(feature);
  return enabled ? <>{children}</> : <>{fallback}</>;
}
