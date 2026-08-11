import type { ComponentType } from 'react';
import {
  AlertCircle,
  BookOpen,
  Building2,
  ClipboardList,
  DoorOpen,
  Dumbbell,
  LayoutDashboard,
  Users,
  UserCog,
  Wallet,
} from 'lucide-react';
import type { FeatureKey } from '@pulso/contracts/features';
import type { Permission } from '@pulso/contracts/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Si falta el permiso, el ítem no se renderiza (no se muestra deshabilitado). */
  permission?: Permission;
  feature?: FeatureKey;
}

/** Ítems del sidebar (FRONTEND_PLAN §3-4). Cada uno se filtra por permiso y feature. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/access', label: 'Acceso', icon: DoorOpen, permission: 'access:operate' },
  { href: '/members', label: 'Socios', icon: Users, permission: 'member:read' },
  { href: '/members/debt', label: 'Deudores', icon: AlertCircle, permission: 'member:read' },
  { href: '/plans', label: 'Planes', icon: ClipboardList, permission: 'plan:read' },
  { href: '/activities', label: 'Actividades', icon: Dumbbell, permission: 'plan:read' },
  { href: '/cash', label: 'Caja', icon: Wallet, permission: 'cash:read' },
  { href: '/cash/daybook', label: 'Libro diario', icon: BookOpen, permission: 'cash:read' },
  { href: '/settings/branches', label: 'Sedes', icon: Building2, permission: 'config:read' },
  { href: '/settings/users', label: 'Usuarios', icon: UserCog, permission: 'user:read' },
] as const;
