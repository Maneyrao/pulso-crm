'use client';

import * as React from 'react';
import { Tags } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CashConcept, CreateCashConceptRequest, UpdateCashConceptRequest } from '@pulso/contracts/cash';
import {
  Button,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  StatusBadge,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { createCashConcept, listCashConcepts, updateCashConcept } from '@/lib/api/cash';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Caja › Conceptos (`GET /cash/concepts` — `cash:read`, alta/edición con
 * `config:write` vía `POST/PATCH /cash/concepts`, ver `CashConfigController`).
 *
 * Los conceptos de sistema (`isSystem`) se muestran igual pero no se pueden
 * editar desde acá: el backend los reserva para cobros de cuota/deuda.
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

const TYPE_OPTIONS = [
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'EXPENSE', label: 'Egreso' },
] as const;

interface ConceptFormState {
  code: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  isActive: boolean;
}

const EMPTY_FORM: ConceptFormState = { code: '', name: '', type: 'INCOME', isActive: true };

function CashConceptsScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const canWrite = usePermission('config:write');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CashConcept | null>(null);
  const [form, setForm] = React.useState<ConceptFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | undefined>();

  const query = useQuery({
    queryKey: qk.cashConcepts(gymId),
    queryFn: listCashConcepts,
    enabled: Boolean(gymId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.cashConcepts(gymId) });

  const createMutation = useMutation({
    mutationFn: (payload: CreateCashConceptRequest) => createCashConcept(payload),
    onSuccess: () => {
      toast({ title: 'Concepto creado', tone: 'success' });
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateCashConceptRequest }) =>
      updateCashConcept(id, payload),
    onSuccess: () => {
      toast({ title: 'Concepto actualizado', tone: 'success' });
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateCashConcept(id, { isActive }),
    onSuccess: (concept) => {
      toast({ title: concept.isActive ? 'Concepto activado' : 'Concepto desactivado', tone: 'success' });
      invalidate();
    },
    onError: (error: unknown) =>
      toast({ title: 'No se pudo cambiar el estado', description: errorMessage(error), tone: 'danger' }),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setFormOpen(true);
  };

  const openEdit = (concept: CashConcept) => {
    setEditing(concept);
    setForm({ code: concept.code, name: concept.name, type: concept.type, isActive: concept.isActive });
    setFormError(undefined);
    setFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload: { name: form.name.trim(), isActive: form.isActive } });
      return;
    }
    if (!form.code.trim() || !form.name.trim()) {
      setFormError('Completá el código y el nombre.');
      return;
    }
    createMutation.mutate({ code: form.code.trim(), name: form.name.trim(), type: form.type });
  };

  const columns: DataTableColumn<CashConcept>[] = [
    {
      id: 'name',
      header: 'Concepto',
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
    {
      id: 'actions',
      header: '',
      cell: (c) =>
        canWrite ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openEdit(c)} disabled={c.isSystem}>
              Editar
            </Button>
            <Button
              variant={c.isActive ? 'danger' : 'outline'}
              size="sm"
              disabled={c.isSystem}
              loading={toggleActiveMutation.isPending && toggleActiveMutation.variables?.id === c.id}
              onClick={() => toggleActiveMutation.mutate({ id: c.id, isActive: !c.isActive })}
            >
              {c.isActive ? 'Desactivar' : 'Activar'}
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
        icon={Tags}
        title="Conceptos"
        description="Categorías de ingresos y egresos de caja."
        actions={
          canWrite ? <Button onClick={openCreate}>Nuevo concepto</Button> : undefined
        }
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
        emptyDescription="Creá el primer concepto de ingreso o egreso."
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Editar concepto' : 'Nuevo concepto'}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="concept-form"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="concept-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <FormField label="Código" required hint={editing ? 'El código no se puede editar.' : undefined}>
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

          <FormField label="Tipo" required hint={editing ? 'El tipo no se puede editar.' : undefined}>
            {(field) => (
              <Select
                {...field}
                options={[...TYPE_OPTIONS]}
                value={form.type}
                disabled={Boolean(editing)}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as 'INCOME' | 'EXPENSE' }))}
              />
            )}
          </FormField>
        </form>
      </Modal>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
