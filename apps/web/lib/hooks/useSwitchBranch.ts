'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { selectBranch } from '../api/auth.js';
import { useSessionStore } from '../stores/session.js';

/**
 * Cambia la sede activa. Regla dura #5: SIEMPRE limpia toda la caché de
 * TanStack Query después — si no, la tabla de socios (y todo lo demás) sigue
 * mostrando datos de la sede anterior hasta el próximo refetch manual.
 */
export function useSwitchBranch() {
  const queryClient = useQueryClient();
  const setActiveBranchId = useSessionStore((s) => s.setActiveBranchId);

  return useMutation({
    mutationFn: (branchId: string) => selectBranch(branchId),
    onSuccess: (result) => {
      setActiveBranchId(result.activeBranchId);
      queryClient.clear();
    },
  });
}
