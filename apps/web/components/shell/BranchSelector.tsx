'use client';

import { Select } from '@pulso/ui';
import { useSwitchBranch } from '@/lib/hooks/useSwitchBranch';
import { useSessionStore } from '@/lib/stores/session';

/** Oculto si el usuario tiene una sola sede (FRONTEND_PLAN §4). */
export function BranchSelector() {
  const branches = useSessionStore((s) => s.branches);
  const activeBranchId = useSessionStore((s) => s.activeBranchId);
  const switchBranch = useSwitchBranch();

  if (branches.length <= 1) return null;

  return (
    <div className="w-48">
      <label htmlFor="branch-selector" className="sr-only">
        Sede activa
      </label>
      <Select
        id="branch-selector"
        value={activeBranchId ?? undefined}
        onValueChange={(value) => switchBranch.mutate(value)}
        options={branches.map((b) => ({ value: b.id, label: b.name }))}
        disabled={switchBranch.isPending}
      />
    </div>
  );
}
