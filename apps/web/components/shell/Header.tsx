'use client';

import { useSessionStore } from '@/lib/stores/session';
import { BranchSelector } from './BranchSelector';
import { CashStatusBadge } from './CashStatusBadge';
import { ConnectionIndicator } from './ConnectionIndicator';
import { UserMenu } from './UserMenu';

export function Header() {
  const gymName = useSessionStore((s) => s.gym?.name);

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-(--color-border) bg-(--color-surface) px-4">
      <span className="truncate text-(--text-base) font-semibold text-(--color-text)">{gymName}</span>
      <div className="flex items-center gap-3">
        <BranchSelector />
        <CashStatusBadge />
        <ConnectionIndicator />
        <UserMenu />
      </div>
    </header>
  );
}
