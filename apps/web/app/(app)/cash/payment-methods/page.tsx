'use client';

import { CreditCard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { PaymentMethod } from '@pulso/contracts/cash';
import { DataTable, EmptyState, StatusBadge, type DataTableColumn } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { listPaymentMethods } from '@/lib/api/cash';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Caja › Métodos de pago (`GET /cash/payment-methods` — `cash:read`).
 *
 * `lib/api/cash.ts` sólo expone `listPaymentMethods`: no hay `create`/`update`
 * de métodos de pago del lado del cliente HTTP (aunque el contrato de
 * `@pulso/contracts/cash` sí declara los schemas de esas operaciones), así
 * que la pantalla es de sólo lectura hasta que se cablee ese cliente.
 */
export default function PaymentMethodsPage() {
  return (
    <PermissionGate
      permission="cash:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <PaymentMethodsScreen />
    </PermissionGate>
  );
}

function PaymentMethodsScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');

  const query = useQuery({
    queryKey: qk.paymentMethods(gymId),
    queryFn: listPaymentMethods,
    enabled: Boolean(gymId),
  });

  const columns: DataTableColumn<PaymentMethod>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (m) => (
        <div className="flex flex-col">
          <span className="font-medium text-(--color-text)">{m.name}</span>
          <span className="text-(--text-xs) text-(--color-muted)">{m.code}</span>
        </div>
      ),
    },
    {
      id: 'countsAsCash',
      header: 'Cuenta como efectivo',
      cell: (m) =>
        m.countsAsCash ? (
          <StatusBadge tone="success" label="Sí" />
        ) : (
          <StatusBadge tone="neutral" label="No" />
        ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (m) =>
        m.isActive ? (
          <StatusBadge tone="success" label="Activo" />
        ) : (
          <StatusBadge tone="neutral" label="Inactivo" />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CreditCard}
        title="Métodos de pago"
        description="Medios de cobro disponibles en caja."
      />

      <DataTable
        caption="Métodos de pago"
        columns={columns}
        data={query.data?.data ?? []}
        rowKey={(m) => m.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
        emptyTitle="Todavía no hay métodos de pago"
        emptyDescription="Los métodos de pago se configuran del lado del backend."
      />
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
