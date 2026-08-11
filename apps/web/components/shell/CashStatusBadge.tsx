'use client';

import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '@pulso/ui';
import { getCurrentCashSession } from '@/lib/api/cash';
import { usePermission } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/** Barra de estado inferior: estado de la caja del usuario (FRONTEND_PLAN §4). */
export function CashStatusBadge() {
  const canReadCash = usePermission('cash:read');
  const gymId = useSessionStore((s) => s.gym?.id);
  const activeBranchId = useSessionStore((s) => s.activeBranchId ?? null);

  const query = useQuery({
    queryKey: qk.cashSession(gymId ?? '', activeBranchId),
    queryFn: () => getCurrentCashSession(activeBranchId),
    enabled: canReadCash && Boolean(gymId),
    staleTime: 15_000,
  });

  if (!canReadCash) return null;
  if (query.isLoading) return null;
  if (query.isError) {
    return <StatusBadge tone="neutral" label="Estado de caja no disponible" />;
  }

  return query.data ? (
    <StatusBadge tone="success" label="Caja abierta" />
  ) : (
    <StatusBadge tone="neutral" label="Caja cerrada" />
  );
}
