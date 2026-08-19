import type { ComponentType } from 'react';
import {
  BarChart3,
  Bot,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Dumbbell,
  Gift,
  LayoutDashboard,
  Package,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';
import type { FeatureKey } from '@pulso/contracts/features';
import type { Permission } from '@pulso/contracts/permissions';

type NavIcon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

export interface NavItem {
  href: string;
  label: string;
  /** Si falta el permiso, el ítem no se renderiza (no se muestra deshabilitado). */
  permission?: Permission;
  feature?: FeatureKey;
  /** Página con datos de demostración (sin backend todavía). */
  mock?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  icon: NavIcon;
  /** Enlace directo (sin submenú). Excluyente con `children`. */
  href?: string;
  permission?: Permission;
  feature?: FeatureKey;
  mock?: boolean;
  children?: readonly NavItem[];
}

/**
 * Navegación agrupada del sidebar. Cada sección es un enlace directo o un
 * grupo colapsable. El filtrado por permiso/feature elimina primero los hijos
 * y después las secciones que quedan vacías.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, href: '/dashboard' },
  { id: 'access', label: 'Acceso', icon: DoorOpen, href: '/access', permission: 'access:operate' },
  {
    id: 'members',
    label: 'Socios',
    icon: Users,
    children: [
      { href: '/members', label: 'Listado de socios', permission: 'member:read' },
      { href: '/members/new', label: 'Nuevo socio', permission: 'member:write' },
      { href: '/members/attendance', label: 'Asistencias', permission: 'member:read', mock: true },
      { href: '/members/debt', label: 'Deudores', permission: 'member:read' },
      { href: '/members/inactive', label: 'Baja de socios', permission: 'member:read', mock: true },
      { href: '/workouts', label: 'Entrenamientos', permission: 'routine:read', mock: true },
    ],
  },
  {
    id: 'activities',
    label: 'Actividades',
    icon: Dumbbell,
    children: [
      { href: '/plans', label: 'Planes', permission: 'plan:read' },
      { href: '/activities', label: 'Actividades', permission: 'plan:read' },
      { href: '/activities/routines', label: 'Rutinas', permission: 'routine:read', mock: true },
      { href: '/activities/routines/exercises', label: 'Ejercicios', permission: 'routine:read', mock: true },
    ],
  },
  {
    id: 'instructors',
    label: 'Instructores',
    icon: ClipboardList,
    children: [
      { href: '/instructors', label: 'Listado', permission: 'instructor:read', mock: true },
      { href: '/instructors/attendance', label: 'Asistencias', permission: 'instructor:attendance', mock: true },
    ],
  },
  {
    id: 'schedule',
    label: 'Reservas',
    icon: CalendarDays,
    children: [
      { href: '/schedule', label: 'Cronograma', permission: 'reservation:read', mock: true },
      { href: '/schedule/exceptions', label: 'Excepciones y feriados', permission: 'reservation:read', mock: true },
      { href: '/schedule/reservations', label: 'Calendario', permission: 'reservation:read', mock: true },
    ],
  },
  {
    id: 'cash',
    label: 'Caja',
    icon: Wallet,
    children: [
      { href: '/cash', label: 'Ver caja', permission: 'cash:read' },
      { href: '/cash/daybook', label: 'Libro diario', permission: 'cash:read' },
      { href: '/cash/concepts', label: 'Conceptos', permission: 'cash:read' },
      { href: '/cash/payment-methods', label: 'Métodos de pago', permission: 'cash:read' },
      { href: '/cash/invoices', label: 'Factura electrónica', permission: 'billing:read', mock: true },
    ],
  },
  { id: 'products', label: 'Productos', icon: Package, href: '/products', permission: 'product:read', mock: true },
  {
    id: 'loyalty',
    label: 'Puntos',
    icon: Gift,
    children: [
      { href: '/loyalty/members', label: 'Por socios', permission: 'loyalty:read', mock: true },
      { href: '/loyalty/history', label: 'Historial global', permission: 'loyalty:read', mock: true },
      { href: '/loyalty/config', label: 'Configuración', permission: 'loyalty:config', mock: true },
    ],
  },
  { id: 'stats', label: 'Estadísticas', icon: BarChart3, href: '/stats', permission: 'stats:read', mock: true },
  { id: 'ai', label: 'Asistente', icon: Bot, href: '/ai', mock: true },
  {
    id: 'settings',
    label: 'Configuración',
    icon: Settings,
    children: [
      { href: '/config', label: 'General', permission: 'config:read', mock: true },
      { href: '/settings/branches', label: 'Sedes', permission: 'config:read' },
      { href: '/settings/users', label: 'Usuarios', permission: 'user:read' },
      { href: '/settings/devices', label: 'Dispositivos', permission: 'device:manage', mock: true },
    ],
  },
] as const;

/** Aplana todas las entradas navegables (para calcular el estado activo). */
export function flattenNavHrefs(sections: readonly NavSection[]): string[] {
  return sections.flatMap((s) => (s.href ? [s.href] : (s.children ?? []).map((c) => c.href)));
}
