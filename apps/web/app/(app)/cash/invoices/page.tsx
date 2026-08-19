'use client';

import { Receipt } from 'lucide-react';
import { Alert, DataTable, EmptyState, MoneyDisplay, StatusBadge, type DataTableColumn } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { DEMO_INVOICES, type DemoInvoice, type InvoiceStatus } from '@/lib/mock/data/commerce-demo';

const STATUS_TONE: Record<InvoiceStatus, 'success' | 'warning' | 'danger'> = {
  Emitida: 'success',
  Pendiente: 'warning',
  Rechazada: 'danger',
};

/**
 * Caja › Factura electrónica — sin backend todavía (`billing:read`), pantalla
 * de demo con `useMockData` (docs/CONTROLFIT_PARITY_AUDIT.md §2). La
 * integración con ARCA es una etapa posterior.
 */
export default function CashInvoicesPage() {
  return (
    <PermissionGate
      permission="billing:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <CashInvoicesScreen />
    </PermissionGate>
  );
}

function CashInvoicesScreen() {
  const { data, isLoading } = useMockData(() => DEMO_INVOICES);

  const columns: DataTableColumn<DemoInvoice>[] = [
    {
      id: 'number',
      header: 'Número',
      cell: (i) => <span className="font-medium tabular-nums text-(--color-text)">{i.number}</span>,
    },
    {
      id: 'date',
      header: 'Fecha',
      cell: (i) => <span className="tabular-nums text-(--color-muted)">{i.date}</span>,
    },
    { id: 'member', header: 'Socio', cell: (i) => i.memberName },
    { id: 'concept', header: 'Concepto', cell: (i) => i.concept },
    {
      id: 'amount',
      header: 'Monto',
      cell: (i) => <MoneyDisplay value={i.amount} />,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (i) => <StatusBadge tone={STATUS_TONE[i.status]} label={i.status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Receipt}
        title="Factura electrónica"
        description="Comprobantes emitidos ante ARCA."
        mock
      />

      <Alert tone="info">La integración con ARCA se configura en una etapa posterior.</Alert>

      <DataTable
        caption="Comprobantes emitidos"
        columns={columns}
        data={data ?? []}
        rowKey={(i) => i.id}
        loading={isLoading}
        emptyTitle="Todavía no hay comprobantes"
        emptyDescription="Los comprobantes emitidos van a aparecer acá cuando exista el backend de facturación."
      />
    </div>
  );
}
