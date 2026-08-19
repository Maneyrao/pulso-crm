'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@pulso/ui';
import { logout } from '@/lib/api/auth';
import { useSessionStore } from '@/lib/stores/session';
import { NAV_SECTIONS, type NavItem, type NavSection } from './nav-items';

/** Referencia estable: un `?? []` inline crea un array nuevo en cada render
 * y rompe `useSyncExternalStore` (getSnapshot debe devolver siempre la misma
 * referencia si el dato no cambió), lo que dispara un loop de renders. */
const NO_FEATURES: readonly string[] = [];

const COLLAPSED_KEY = 'pulso-sidebar-collapsed';

interface VisibleSection extends Omit<NavSection, 'children'> {
  children?: readonly NavItem[];
}

function useVisibleSections(): VisibleSection[] {
  const permissions = useSessionStore((s) => s.permissions);
  const features = useSessionStore((s) => s.gym?.features ?? NO_FEATURES);

  return React.useMemo(() => {
    const allowed = (p?: string, f?: string) =>
      (!p || permissions.includes(p as (typeof permissions)[number])) && (!f || features.includes(f));
    const result: VisibleSection[] = [];
    for (const section of NAV_SECTIONS) {
      if (!allowed(section.permission, section.feature)) continue;
      if (!section.children) {
        result.push(section);
        continue;
      }
      const children = section.children.filter((c) => allowed(c.permission, c.feature));
      if (children.length > 0) result.push({ ...section, children });
    }
    return result;
  }, [permissions, features]);
}

/** El href navegable más largo que matchea gana: `/members/debt` activa
 * "Deudores" y no "Listado de socios". */
function useActiveHref(sections: VisibleSection[]): string | null {
  const pathname = usePathname();
  return React.useMemo(() => {
    let best: string | null = null;
    for (const s of sections) {
      const hrefs = s.href ? [s.href] : (s.children ?? []).map((c) => c.href);
      for (const href of hrefs) {
        if (pathname === href || pathname.startsWith(`${href}/`)) {
          if (!best || href.length > best.length) best = href;
        }
      }
    }
    return best;
  }, [sections, pathname]);
}

function NavLeaf({
  item,
  active,
  nested,
  onNavigate,
}: {
  item: { href: string; label: string; mock?: boolean };
  active: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-(--radius-md) py-1.5 text-(--text-sm) transition-colors',
        nested ? 'pl-9 pr-3' : 'px-3 font-medium',
        active
          ? 'bg-(--color-primary-subtle) font-medium text-(--color-primary-subtle-foreground)'
          : 'text-(--color-muted) hover:bg-(--color-muted-subtle) hover:text-(--color-text)',
      )}
    >
      <span className="truncate">{item.label}</span>
      {item.mock ? (
        <span
          aria-hidden={true}
          title="Datos de demostración"
          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-warning)"
        />
      ) : null}
    </Link>
  );
}

export interface SidebarNavProps {
  /** Cierra el drawer mobile al navegar. */
  onNavigate?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
}

/** Navegación agrupada, compartida entre el sidebar desktop y el drawer mobile. */
export function SidebarNav({ onNavigate, collapsed = false, onExpand }: SidebarNavProps) {
  const sections = useVisibleSections();
  const activeHref = useActiveHref(sections);
  const pathname = usePathname();

  const activeSectionId = React.useMemo(() => {
    for (const s of sections) {
      const hrefs = s.href ? [s.href] : (s.children ?? []).map((c) => c.href);
      if (hrefs.some((h) => pathname === h || pathname.startsWith(`${h}/`))) return s.id;
    }
    return null;
  }, [sections, pathname]);

  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
  // El grupo de la ruta activa arranca abierto y se re-abre al navegar hacia él.
  React.useEffect(() => {
    if (activeSectionId) setOpenGroups((prev) => ({ ...prev, [activeSectionId]: true }));
  }, [activeSectionId]);

  return (
    <nav aria-label="Navegación principal" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2">
      {sections.map((section) => {
        const Icon = section.icon;
        if (!section.children) {
          const active = activeHref === section.href;
          return (
            <Link
              key={section.id}
              href={section.href!}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? section.label : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-(--radius-md) px-3 py-2 text-(--text-sm) font-medium transition-colors',
                active
                  ? 'bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)'
                  : 'text-(--color-muted) hover:bg-(--color-muted-subtle) hover:text-(--color-text)',
                collapsed && 'justify-center px-0',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />
              {!collapsed && <span className="truncate">{section.label}</span>}
              {!collapsed && section.mock ? (
                <span
                  aria-hidden={true}
                  title="Datos de demostración"
                  className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-warning)"
                />
              ) : null}
            </Link>
          );
        }

        const isOpen = Boolean(openGroups[section.id]);
        const groupActive = activeSectionId === section.id;

        if (collapsed) {
          // Colapsado: el grupo es un botón que expande el sidebar y abre el grupo.
          return (
            <button
              key={section.id}
              type="button"
              title={section.label}
              onClick={() => {
                onExpand?.();
                setOpenGroups((prev) => ({ ...prev, [section.id]: true }));
              }}
              className={cn(
                'flex items-center justify-center rounded-(--radius-md) py-2 transition-colors',
                groupActive
                  ? 'bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)'
                  : 'text-(--color-muted) hover:bg-(--color-muted-subtle) hover:text-(--color-text)',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden={true} />
            </button>
          );
        }

        return (
          <div key={section.id}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenGroups((prev) => ({ ...prev, [section.id]: !isOpen }))}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-(--radius-md) px-3 py-2 text-(--text-sm) font-medium transition-colors',
                groupActive && !isOpen
                  ? 'bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)'
                  : 'text-(--color-muted) hover:bg-(--color-muted-subtle) hover:text-(--color-text)',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden={true} />
              <span className="flex-1 truncate text-left">{section.label}</span>
              <ChevronDown
                className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}
                aria-hidden={true}
              />
            </button>
            <div
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none',
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-0.5 pb-1" hidden={!isOpen}>
                  {section.children.map((child) => (
                    <NavLeaf
                      key={child.href}
                      item={child}
                      nested
                      active={activeHref === child.href}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** Wordmark propio. No se replica marca de terceros (regla del brief). */
export function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 px-3', collapsed && 'justify-center px-0')}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-(--color-primary-foreground)">
        <Activity className="h-4.5 w-4.5" aria-hidden={true} />
      </span>
      {!collapsed && <span className="text-(--text-lg) font-bold tracking-tight text-(--color-text)">Pulso</span>}
    </div>
  );
}

/** Bloque de cuenta del pie del sidebar: avatar, nombre, Mi cuenta y salir. */
export function SidebarAccount({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const clearSession = useSessionStore((s) => s.clearSession);

  if (!user) return null;

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || '?';

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      queryClient.clear();
      router.push('/login');
    }
  };

  return (
    <div className="border-t border-(--color-border) p-3">
      <div className={cn('flex items-center gap-2.5', collapsed && 'flex-col')}>
        <Link
          href="/account"
          onClick={onNavigate}
          title="Mi cuenta"
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2.5 rounded-(--radius-md) p-1.5 transition-colors hover:bg-(--color-muted-subtle)',
            collapsed && 'flex-none justify-center',
          )}
        >
          <span
            aria-hidden={true}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-primary-subtle) text-(--text-xs) font-semibold text-(--color-primary-subtle-foreground)"
          >
            {initials}
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-(--text-sm) font-medium text-(--color-text)">
                {user.firstName} {user.lastName}
              </span>
              <span className="block truncate text-(--text-xs) text-(--color-muted)">Mi cuenta</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => void handleLogout()}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="rounded-(--radius-md) p-2 text-(--color-muted) transition-colors hover:bg-(--color-danger-subtle) hover:text-(--color-danger)"
        >
          <LogOut className="h-4 w-4" aria-hidden={true} />
        </button>
      </div>
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

/** Sidebar fijo de desktop: colapsable a iconos, oculto en mobile (drawer aparte). */
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
        'sticky top-0 hidden h-screen flex-col border-r border-(--color-border) bg-(--color-surface) transition-[width] duration-200 motion-reduce:transition-none lg:flex',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-(--color-border) pr-2">
        <BrandMark collapsed={collapsed} />
        {!collapsed && (
          <button
            type="button"
            onClick={() => toggle(true)}
            aria-label="Colapsar menú"
            className="rounded-(--radius-md) p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-muted-subtle) hover:text-(--color-text)"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden={true} />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          onClick={() => toggle(false)}
          aria-label="Expandir menú"
          className="mx-auto mt-2 rounded-(--radius-md) p-1.5 text-(--color-muted) transition-colors hover:bg-(--color-muted-subtle) hover:text-(--color-text)"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden={true} />
        </button>
      )}
      <SidebarNav collapsed={collapsed} onExpand={() => toggle(false)} />
      <SidebarAccount collapsed={collapsed} />
    </aside>
  );
}
