'use client';

import * as React from 'react';
import { CreditCard } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePaymentMethodRequest,
  PaymentMethod,
  UpdatePaymentMethodRequest,
} from '@pulso/contracts/cash';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  StatusBadge,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { createPaymentMethod, listPaymentMethods, updatePaymentMethod } from '@/lib/api/cash';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Caja › Métodos de pago (`GET /cash/payment-methods` — `cash:read`, alta/edición
 * con `config:write` vía `POST/PATCH /cash/payment-methods`).
 *
 * El schema real (`packages/contracts/src/cash.ts`) no tiene un campo de
 * recargo/comisión por método — sólo `code`, `name`, `countsAsCash`,
 * `isActive`, `sortOrder` — así que la columna "Recargo" de la referencia
 * visual no aplica acá: se muestran únicamente los campos reales.
 */
export default function PaymentMethodsPage() {
  return (
    <PermissionGate
      permission="cash:read"
      fallback={
        <EmptyState
          title="Sin acceso"
          description="Tu usuario no tiene permiso para ver esta pantalla."
        />
      }
    >
      <PaymentMethodsScreen />
    </PermissionGate>
  );
}

interface MethodFormState {
  code: string;
  name: string;
  countsAsCash: boolean;
  isActive: boolean;
}

const EMPTY_FORM: MethodFormState = { code: '', name: '', countsAsCash: false, isActive: true };

function PaymentMethodsScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const canWrite = usePermission('config:write');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PaymentMethod | null>(null);
  const [form, setForm] = React.useState<MethodFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | undefined>();

  const query = useQuery({
    queryKey: qk.paymentMethods(gymId),
    queryFn: listPaymentMethods,
    enabled: Boolean(gymId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.paymentMethods(gymId) });

  const createMutation = useMutation({
    mutationFn: (payload: CreatePaymentMethodRequest) => createPaymentMethod(payload),
    onSuccess: () => {
      toast({ title: 'Método de pago creado', tone: 'success' });
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePaymentMethodRequest }) =>
      updatePaymentMethod(id, payload),
    onSuccess: () => {
      toast({ title: 'Método de pago actualizado', tone: 'success' });
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updatePaymentMethod(id, { isActive }),
    onSuccess: (method) => {
      toast({ title: method.isActive ? 'Método activado' : 'Método desactivado', tone: 'success' });
      invalidate();
    },
    onError: (error: unknown) =>
      toast({
        title: 'No se pudo cambiar el estado',
        description: errorMessage(error),
        tone: 'danger',
      }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setFormOpen(true);
  };

  const openEdit = (method: PaymentMethod) => {
    setEditing(method);
    setForm({
      code: method.code,
      name: method.name,
      countsAsCash: method.countsAsCash,
      isActive: method.isActive,
    });
    setFormError(undefined);
    setFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        payload: {
          name: form.name.trim(),
          countsAsCash: form.countsAsCash,
          isActive: form.isActive,
        },
      });
      return;
    }
    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Completá el código y el nombre.');
      return;
    }
    createMutation.mutate({
      code: form.code.trim(),
      name: form.name.trim(),
      countsAsCash: form.countsAsCash,
      sortOrder: 0,
    });
  };

  const columns: DataTableColumn<PaymentMethod>[] = [
    {
      id: 'name',
      header: 'Método',
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
    {
      id: 'actions',
      header: '',
      cell: (m) =>
        canWrite ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
              Editar
            </Button>
            <Button
              variant={m.isActive ? 'danger' : 'outline'}
              size="sm"
              loading={
                toggleActiveMutation.isPending && toggleActiveMutation.variables?.id === m.id
              }
              onClick={() => toggleActiveMutation.mutate({ id: m.id, isActive: !m.isActive })}
            >
              {m.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ) : null,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CreditCard}
        title="Métodos de pago"
        description="Medios de cobro disponibles en caja."
        actions={canWrite ? <Button onClick={openCreate}>Nuevo método</Button> : undefined}
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
        emptyDescription="Creá el primer método de pago para poder registrar movimientos."
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Editar método de pago' : 'Nuevo método de pago'}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="payment-method-form"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="payment-method-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError ? (
            <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
              {formError}
            </p>
          ) : null}

          <FormField label="Nombre" required>
            {(field) => (
              <Input
                {...field}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            )}
          </FormField>

          <FormField
            label="Código"
            required
            hint={editing ? 'El código no se puede editar.' : undefined}
          >
            {(field) => (
              <Input
                {...field}
                value={form.code}
                disabled={Boolean(editing)}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                required
              />
            )}
          </FormField>

          <label className="flex items-center gap-2 text-(--text-sm) text-(--color-text)">
            <Checkbox
              checked={form.countsAsCash}
              onChange={(e) => setForm((f) => ({ ...f, countsAsCash: e.target.checked }))}
            />
            Cuenta como efectivo en el arqueo de cierre
          </label>
        </form>
      </Modal>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
