'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@pulso/ui';
import { useSessionStore } from '@/lib/stores/session';
import { NAV_ITEMS } from './nav-items';

/** Referencia estable: un `?? []` inline crea un array nuevo en cada render
 * y rompe `useSyncExternalStore` (getSnapshot debe devolver siempre la misma
 * referencia si el dato no cambió), lo que dispara un loop de renders. */
const NO_FEATURES: readonly string[] = [];

/**
 * Navegación filtrada por permiso y feature (guard nivel 2, FRONTEND_PLAN §4).
 * Un ítem sin permiso simplemente no se renderiza — no revela qué existe.
 */
export function Sidebar() {
  const pathname = usePathname();
  const permissions = useSessionStore((s) => s.permissions);
  const features = useSessionStore((s) => s.gym?.features ?? NO_FEATURES);

  const items = NAV_ITEMS.filter((item) => {
    if (item.permission && !permissions.includes(item.permission)) return false;
    if (item.feature && !features.includes(item.feature)) return false;
    return true;
  });

  return (
    <nav aria-label="Navegación principal" className="flex h-full w-56 flex-col gap-1 border-r border-(--color-border) bg-(--color-surface) p-3">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-(--radius-md) px-3 py-2 text-(--text-sm) font-medium transition-colors',
              isActive
                ? 'bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)'
                : 'text-(--color-muted) hover:bg-(--color-muted-subtle) hover:text-(--color-text)',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden={true} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
