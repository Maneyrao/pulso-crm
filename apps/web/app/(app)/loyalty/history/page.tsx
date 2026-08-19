'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import { DataTable, EmptyState, type DataTableColumn } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { DEMO_LOYALTY_MOVEMENTS, type DemoLoyaltyMovement } from '@/lib/mock/data/commerce-demo';

/**
 * Fidelización › Historial de puntos — sin backend todavía (`loyalty:read`),
 * pantalla de demo con `useMockData` (docs/CONTROLFIT_PARITY_AUDIT.md §2).
 */
export default function LoyaltyHistoryPage() {
  return (
    <PermissionGate
      permission="loyalty:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <LoyaltyHistoryScreen />
    </PermissionGate>
  );
}

function LoyaltyHistoryScreen() {
  const { data, isLoading } = useMockData(() =>
    [...DEMO_LOYALTY_MOVEMENTS].sort((a, b) => b.date.localeCompare(a.date)),
  );

  const columns: DataTableColumn<DemoLoyaltyMovement>[] = [
    {
      id: 'date',
      header: 'Fecha',
      cell: (m) => <span className="tabular-nums text-(--color-muted)">{m.date}</span>,
    },
    { id: 'member', header: 'Socio', cell: (m) => m.memberName },
    { id: 'reason', header: 'Motivo', cell: (m) => m.reason },
    {
      id: 'delta',
      header: 'Puntos',
      cell: (m) => (
        <span
          className={
            m.delta >= 0
              ? 'font-semibold tabular-nums text-(--color-success)'
              : 'font-semibold tabular-nums text-(--color-danger)'
          }
        >
          {m.delta >= 0 ? `+${m.delta}` : m.delta}
        </span>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={History}
        title="Historial de puntos"
        description="Movimientos de puntos de todos los socios, del más reciente al más antiguo."
        mock
      />

      <DataTable
        caption="Historial de puntos"
        columns={columns}
        data={data ?? []}
        rowKey={(m) => m.id}
        loading={isLoading}
        emptyTitle="Todavía no hay movimientos"
        emptyDescription="Los movimientos de puntos van a aparecer acá cuando exista el backend de fidelización."
      />
    </div>
  );
}
