'use client';

import { Menu } from 'lucide-react';
import { useSessionStore } from '@/lib/stores/session';
import { BranchSelector } from './BranchSelector';
import { CashStatusBadge } from './CashStatusBadge';
import { ConnectionIndicator } from './ConnectionIndicator';
import { LiveClock } from './LiveClock';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const gymName = useSessionStore((s) => s.gym?.name);
  const branches = useSessionStore((s) => s.branches);
  const activeBranchId = useSessionStore((s) => s.activeBranchId);
  const activeBranch = branches.find((b) => b.id === activeBranchId);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-(--color-border) bg-(--color-surface) px-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
          className="rounded-(--radius-md) p-2 text-(--color-muted) transition-colors hover:bg-(--color-muted-subtle) hover:text-(--color-text) lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden={true} />
        </button>
        <div className="min-w-0">
          <span className="block truncate text-(--text-base) font-semibold text-(--color-text)">{gymName}</span>
          {activeBranch && branches.length <= 1 ? (
            <span className="block truncate text-(--text-xs) text-(--color-muted)">{activeBranch.name}</span>
          ) : null}
        </div>
        <div className="hidden md:block">
          <BranchSelector />
        </div>
      </div>
      <LiveClock />
      <div className="flex items-center gap-2">
        <div className="md:hidden">
          <BranchSelector />
        </div>
        <div className="hidden sm:block">
          <CashStatusBadge />
        </div>
        <div className="hidden sm:block">
          <ConnectionIndicator />
        </div>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
