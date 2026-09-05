'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@pulso/ui';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { useSessionStore } from '@/lib/stores/session';
import { computeAbbr, NAV_GROUPS, type NavGroup, type NavItem } from './nav-items';

/** Referencia estable: un `?? []` inline crea un array nuevo en cada render
 * y rompe `useSyncExternalStore` (getSnapshot debe devolver siempre la misma
 * referencia si el dato no cambió), lo que dispara un loop de renders. */
const NO_FEATURES: readonly string[] = [];

const COLLAPSED_KEY = 'pulso-sidebar-collapsed';

interface VisibleGroup extends Omit<NavGroup, 'items'> {
  items: readonly NavItem[];
}

/**
 * Segmentos desplegables:
 * cada ítem sin permiso simplemente no se renderiza; un grupo cuyos ítems
 * quedaron todos filtrados tampoco se renderiza.
 */
function useVisibleGroups(): VisibleGroup[] {
  const permissions = useSessionStore((s) => s.permissions);
  const features = useSessionStore((s) => s.gym?.features ?? NO_FEATURES);

  return React.useMemo(() => {
    const allowed = (p?: string, f?: string) =>
      (!p || permissions.includes(p as (typeof permissions)[number])) &&
      (!f || features.includes(f));
    const result: VisibleGroup[] = [];
    for (const group of NAV_GROUPS) {
      const items = group.items.filter((item) => allowed(item.permission, item.feature));
      if (items.length > 0) result.push({ ...group, items });
    }
    return result;
  }, [permissions, features]);
}

/** El href navegable más largo que matchea gana: `/members/debt` activa
 * "Deudores" y no "Listado de socios". */
function useActiveHref(groups: VisibleGroup[]): string | null {
  const pathname = usePathname();
  return React.useMemo(() => {
    let best: string | null = null;
    for (const group of groups) {
      for (const item of group.items) {
        if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
          if (!best || item.href.length > best.length) best = item.href;
        }
      }
    }
    return best;
  }, [groups, pathname]);
}

function SidebarLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={cn(
        'flex items-center gap-2.5 border-l-[3px] py-2 text-[12.5px] transition-colors',
        collapsed ? 'justify-center border-l-0 px-0' : 'px-3.5',
        active
          ? 'border-(--color-primary) bg-(--color-primary-subtle) font-bold text-(--color-primary)'
          : 'border-transparent font-medium text-[#d2c6b4] hover:bg-(--color-primary-subtle) hover:text-(--color-primary)',
      )}
    >
      <span
        aria-hidden={true}
        className={cn(
          'w-[18px] shrink-0 text-center text-[9px] font-extrabold tracking-[0.03em]',
          active ? 'text-(--color-primary)' : 'text-[#776a58]',
        )}
      >
        {computeAbbr(item.label)}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export interface SidebarNavProps {
  /** Cierra el drawer mobile al navegar. */
  onNavigate?: () => void;
  collapsed?: boolean;
}

/** Navegación agrupada, compartida entre el sidebar desktop y el drawer mobile. */
export function SidebarNav({ onNavigate, collapsed = false }: SidebarNavProps) {
  const groups = useVisibleGroups();
  const activeHref = useActiveHref(groups);
  const activeGroup = groups.find((g) => g.items.some((item) => item.href === activeHref))?.id;
  const [openGroup, setOpenGroup] = React.useState<string | undefined>(activeGroup);
  const navId = React.useId();

  React.useEffect(() => { setOpenGroup(activeGroup); }, [activeGroup, activeHref]);

  return (
    <nav aria-label="Navegación principal" className="flex flex-1 flex-col overflow-y-auto py-2">
      {groups.map((group) => (
        <React.Fragment key={group.id}>
          <button
            type="button"
            title={group.label}
            aria-label={group.label}
            aria-expanded={openGroup === group.id}
            aria-controls={`${navId}-${group.id}`}
            onClick={() => setOpenGroup(openGroup === group.id ? undefined : group.id)}
            className="flex min-h-11 shrink-0 items-center justify-between gap-2 px-3 text-left text-xs font-bold text-[#f2ece1] hover:bg-[#302a22] focus-visible:outline-2 focus-visible:outline-white"
          >
            <span>{collapsed ? computeAbbr(group.label) : group.label}</span>
            {!collapsed && <ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform duration-150 motion-reduce:transition-none', openGroup === group.id && 'rotate-180')} />}
          </button>
          <div id={`${navId}-${group.id}`} hidden={openGroup !== group.id}>
            {group.items.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                active={activeHref === item.href}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </React.Fragment>
      ))}
    </nav>
  );
}

/** Marca fija de esta instalación. El gimnasio de la sesión sigue disponible
 * en la cuenta; el shell comunica la identidad comercial de El Templo. */
export function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div
      className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}
      aria-label="El Templo"
    >
      <BrandLogo size={collapsed ? 36 : 40} decorative className="border border-[#4b4032]" />
      {!collapsed && (
        <span className="truncate text-[14px] font-extrabold uppercase text-[#f2ece1]">
          El <span className="text-(--color-primary)">Templo</span>
        </span>
      )}
    </div>
  );
}

/** localStorage puede no estar disponible (modo privado, jsdom): fallar en silencio. */
function readCollapsedPreference(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsedPreference(next: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
  } catch {
    // Preferencia no persistida; el sidebar sigue funcionando.
  }
}

/**
 * Sidebar fijo de desktop: colapsable a abreviaturas de 1-2 letras, oculto en
 * mobile (drawer aparte en AppShell). Fondo de marca siempre oscuro
 * (LEODARROSAFIT_ALIGNMENT_PLAN.md §2): la referencia es un shell dark-first
 * donde el sidebar no sigue el toggle claro/oscuro del resto de la app.
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  const toggle = (next: boolean) => {
    setCollapsed(next);
    writeCollapsedPreference(next);
  };

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen flex-col border-r-2 border-[#302a22] bg-[#0b0a08] transition-[width] duration-200 motion-reduce:transition-none lg:flex',
        collapsed ? 'w-[60px]' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex min-h-[34px] items-center border-b-2 border-[#302a22] py-3',
          collapsed ? 'px-2' : 'px-3.5',
        )}
      >
        <BrandMark collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} />
      <button
        type="button"
        onClick={() => toggle(!collapsed)}
        aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        className={cn(
          'flex items-center gap-2 border-0 border-t-2 border-[#302a22] bg-transparent py-3 text-[12px] font-semibold text-[#a79c8c] transition-colors hover:bg-(--color-primary-subtle) hover:text-[#f2ece1]',
          collapsed ? 'justify-center px-0' : 'px-3.5',
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" aria-hidden={true} />
        ) : (
          <>
            <PanelLeftClose className="h-4 w-4" aria-hidden={true} />
            Colapsar menú
          </>
        )}
      </button>
    </aside>
  );
}
