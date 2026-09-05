import type { FeatureKey } from '@pulso/contracts/features';
import type { Permission } from '@pulso/contracts/permissions';

export interface NavItem {
  href: string;
  label: string;
  /** Si falta el permiso, el ítem no se renderiza (no se muestra deshabilitado). */
  permission?: Permission;
  feature?: FeatureKey;
}

export interface NavGroup {
  id: string;
  label: string;
  items: readonly NavItem[];
}

/**
 * Navegación del sidebar (LEODARROSAFIT_ALIGNMENT_PLAN.md §4): grupos
 * planos, sin acordeón — todos los ítems visibles bajo su label, como la
 * referencia. El filtrado por permiso/feature elimina primero los ítems y
 * después los grupos que quedan vacíos.
 *
 * Sólo rutas con backend real (o alias de una ruta real). Los módulos
 * puramente demo (rutinas, ejercicios, instructores, reservas, facturación
 * ARCA, productos, puntos, WhatsApp real, AI, entrenamientos) se eliminaron
 * del build en la Fase 3 del plan (LEODARROSAFIT_ALIGNMENT_PLAN.md §3): si
 * un módulo de esos vuelve, entra con backend real desde el día uno.
 *
 * Dispositivos (`/settings/devices`) queda en el nav aunque su backend real
 * (gestión de agentes) llega en la Fase 4: no es un módulo demo genérico,
 * es una integración con fecha de llegada concreta.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'principal',
    label: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/access', label: 'Acceso', permission: 'access:operate' },
    ],
  },
  {
    id: 'socios',
    label: 'Socios',
    items: [
      { href: '/members', label: 'Socios', permission: 'member:read' },
      { href: '/members/new', label: 'Nuevo socio', permission: 'member:write' },
      { href: '/members/attendance', label: 'Asistencias', permission: 'attendance:read' },
      { href: '/members/debt', label: 'Deudores', permission: 'member:read' },
      { href: '/members/inactive', label: 'Baja e inactivos', permission: 'member:read' },
    ],
  },
  {
    id: 'actividades',
    label: 'Actividades',
    items: [
      { href: '/plans', label: 'Planes', permission: 'plan:read' },
      { href: '/plans/new', label: 'Nuevo plan', permission: 'plan:write' },
      { href: '/activities', label: 'Actividades', permission: 'plan:read' },
    ],
  },
  {
    id: 'staff',
    label: 'Staff',
    items: [{ href: '/settings/users', label: 'Usuarios', permission: 'user:read' }],
  },
  {
    id: 'caja',
    label: 'Caja',
    items: [
      { href: '/cash', label: 'Caja', permission: 'cash:read' },
      { href: '/inventory', label: 'Inventario', permission: 'product:read' },
      { href: '/cash/daybook', label: 'Libro diario', permission: 'cash:read' },
      { href: '/cash/concepts', label: 'Conceptos', permission: 'cash:read' },
      { href: '/cash/payment-methods', label: 'Métodos de pago', permission: 'cash:read' },
    ],
  },
  {
    id: 'analisis',
    label: 'Análisis',
    items: [{ href: '/stats', label: 'Estadísticas', permission: 'stats:read' }],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      { href: '/config', label: 'Configuración', permission: 'config:read' },
      { href: '/settings/branches', label: 'Sedes', permission: 'config:read' },
      { href: '/settings/devices', label: 'Dispositivos', permission: 'device:manage' },
      { href: '/account', label: 'Mi cuenta' },
    ],
  },
] as const;

/** Aplana todas las entradas navegables (para calcular el estado activo). */
export function flattenNavHrefs(groups: readonly NavGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((item) => item.href));
}

/**
 * Abreviatura de 1-2 letras para el sidebar colapsado y las iniciales del
 * logo (LEODARROSAFIT_ALIGNMENT_PLAN.md §1: logo "LD" para "LeoDarrosaFIT").
 * Mismo algoritmo que la referencia: toma las mayúsculas del texto; si no
 * hay ninguna (todo en minúscula), cae a las dos primeras letras en mayúscula.
 */
export function computeAbbr(text: string): string {
  const upper = text.replace(/[^A-ZÁÉÍÓÚÑ]/g, '');
  return (upper || text.slice(0, 2).toUpperCase()).slice(0, 2);
}

/**
 * Separa el nombre del gym en una parte base y una parte "acento" para el
 * wordmark del sidebar (ver Sidebar.tsx `BrandMark`): si el nombre termina
 * en una racha de 2+ mayúsculas (p. ej. "LeoDarrosaFIT" → "FIT") esa racha va
 * en acento; si no, la última palabra separada por espacio.
 */
export function splitBrandWordmark(name: string): { base: string; accent: string } {
  const trimmed = name.trim();
  const upperTail = /^(.*?)([A-ZÁÉÍÓÚÑ]{2,})$/.exec(trimmed);
  const base = upperTail?.[1];
  const accent = upperTail?.[2];
  if (base && base.length > 0 && accent) {
    return { base, accent };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    const accent = parts.pop() as string;
    return { base: `${parts.join(' ')} `, accent };
  }
  return { base: '', accent: trimmed };
}

/**
 * Título de página para el header (LEODARROSAFIT_ALIGNMENT_PLAN.md §2): el
 * label del ítem de nav cuyo href matchea más largo contra el pathname
 * actual, misma regla de "match más largo gana" que el estado activo del
 * sidebar.
 */
export function findPageTitle(
  pathname: string,
  groups: readonly NavGroup[] = NAV_GROUPS,
): string | undefined {
  let best: NavItem | undefined;
  for (const group of groups) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
        if (!best || item.href.length > best.href.length) best = item;
      }
    }
  }
  return best?.label;
}
