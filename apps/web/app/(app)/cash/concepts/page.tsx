'use client';

import { Tags } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { CashConcept } from '@pulso/contracts/cash';
import { DataTable, EmptyState, StatusBadge, type DataTableColumn } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { listCashConcepts } from '@/lib/api/cash';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Caja › Conceptos (`GET /cash/concepts` — `cash:read`).
 *
 * `lib/api/cash.ts` sólo expone `listCashConcepts`: no hay `create`/`update`
 * de conceptos del lado del cliente HTTP (aunque el contrato de
 * `@pulso/contracts/cash` sí declara los schemas de esas operaciones), así
 * que la pantalla es de sólo lectura hasta que se cablee ese cliente.
 */
export default function CashConceptsPage() {
  return (
    <PermissionGate
      permission="cash:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <CashConceptsScreen />
    </PermissionGate>
  );
}

function CashConceptsScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');

  const query = useQuery({
    queryKey: qk.cashConcepts(gymId),
    queryFn: listCashConcepts,
    enabled: Boolean(gymId),
  });

  const columns: DataTableColumn<CashConcept>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (c) => (
        <div className="flex flex-col">
          <span className="font-medium text-(--color-text)">{c.name}</span>
          <span className="text-(--text-xs) text-(--color-muted)">{c.code}</span>
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: (c) =>
        c.type === 'INCOME' ? (
          <StatusBadge tone="success" label="Ingreso" />
        ) : (
          <StatusBadge tone="danger" label="Egreso" />
        ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (c) =>
        c.isActive ? (
          <StatusBadge tone="success" label="Activo" />
        ) : (
          <StatusBadge tone="neutral" label="Inactivo" />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Tags}
        title="Conceptos"
        description="Categorías de ingresos y egresos de caja."
      />

      <DataTable
        caption="Conceptos de caja"
        columns={columns}
        data={query.data?.data ?? []}
        rowKey={(c) => c.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
        emptyTitle="Todavía no hay conceptos"
        emptyDescription="Los conceptos de caja se configuran del lado del backend."
      />
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
