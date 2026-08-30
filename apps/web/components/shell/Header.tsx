'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { findPageTitle } from './nav-items';
import { BranchSelector } from './BranchSelector';
import { ConnectionIndicator } from './ConnectionIndicator';
import { LiveClock } from './LiveClock';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

/**
 * Topbar (LEODARROSAFIT_ALIGNMENT_PLAN.md §2): sticky 56px, borde inferior
 * 2px. Hamburguesa mobile · título de página · selector de sede · fecha/hora
 * en vivo · badge de conexión · toggle de tema · menú de usuario. Sin campana
 * de notificaciones (no hay sistema de notificaciones real todavía — nada
 * demo) ni toggle de sonido (no hay nada que suene todavía).
 */
export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const pageTitle = findPageTitle(pathname) ?? 'Dashboard';

  return (
    <header className="flex h-14 shrink-0 items-center gap-3.5 border-b-2 border-(--color-border) bg-(--color-surface) px-4.5">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        className="border border-(--color-border) p-2 text-(--color-text) transition-colors hover:bg-(--color-muted-subtle) lg:hidden"
      >
        <Menu className="h-4.5 w-4.5" aria-hidden={true} />
      </button>
      <span className="min-w-0 truncate text-[13px] font-bold text-(--color-text)">
        {pageTitle}
      </span>
      <div className="flex-1" />
      <div className="hidden items-center gap-3.5 md:flex">
        <BranchSelector />
        <LiveClock />
      </div>
      <div className="md:hidden">
        <BranchSelector />
      </div>
      <ConnectionIndicator />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
