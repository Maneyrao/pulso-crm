'use client';

import * as React from 'react';
import { Building2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Branch, CreateBranchRequest, UpdateBranchRequest } from '@pulso/contracts/tenancy';
import {
  Button,
  ConfirmDialog,
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
import { createBranch, deactivateBranch, listBranches, updateBranch } from '@/lib/api/tenancy';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * T-2.6 — Settings › Sedes.
 *
 * CRUD completo de `Branch`: listado, alta, edición, y desactivar/reactivar
 * (el backend nunca borra la fila — `DELETE /branches/:id` sólo pone
 * `isActive: false`, ver BranchService.deactivate).
 */
export default function BranchesSettingsPage() {
  return (
    <PermissionGate
      permission="config:read"
      fallback={
        <EmptyState
          title="Sin acceso"
          description="Tu usuario no tiene permiso para ver esta pantalla."
        />
      }
    >
      <BranchesScreen />
    </PermissionGate>
  );
}

interface BranchFormState {
  name: string;
  timezone: string;
  address: string;
  phone: string;
}

const EMPTY_FORM: BranchFormState = {
  name: '',
  timezone: 'America/Argentina/Buenos_Aires',
  address: '',
  phone: '',
};

function BranchesScreen() {
  const gymId = useSessionStore((s) => s.gym?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Branch | null>(null);
  const [form, setForm] = React.useState<BranchFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | undefined>();
  const [toDeactivate, setToDeactivate] = React.useState<Branch | null>(null);

  const query = useQuery({
    queryKey: qk.branches(gymId ?? ''),
    queryFn: listBranches,
    enabled: Boolean(gymId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.branches(gymId ?? '') });

  const createMutation = useMutation({
    mutationFn: (payload: CreateBranchRequest) => createBranch(payload),
    onSuccess: () => {
      toast({ title: 'Sede creada', tone: 'success' });
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError(errorMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBranchRequest }) =>
      updateBranch(id, payload),
    onSuccess: () => {
      toast({ title: 'Sede actualizada', tone: 'success' });
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError(errorMessage(error));
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateBranch(id),
    onSuccess: (branch) => {
      toast({
        title: branch.isActive ? 'Sede reactivada' : 'Sede desactivada',
        tone: 'success',
      });
      setToDeactivate(null);
      invalidate();
    },
    onError: (error: unknown) => {
      toast({
        title: 'No se pudo desactivar la sede',
        description: errorMessage(error),
        tone: 'danger',
      });
      setToDeactivate(null);
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => updateBranch(id, { isActive: true }),
    onSuccess: () => {
      toast({ title: 'Sede reactivada', tone: 'success' });
      invalidate();
    },
    onError: (error: unknown) => {
      toast({
        title: 'No se pudo reactivar la sede',
        description: errorMessage(error),
        tone: 'danger',
      });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setFormOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditing(branch);
    setForm({
      name: branch.name,
      timezone: branch.timezone,
      address: branch.address ?? '',
      phone: branch.phone ?? '',
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
          timezone: form.timezone.trim(),
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
        },
      });
    } else {
      createMutation.mutate({
        name: form.name.trim(),
        timezone: form.timezone.trim(),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
    }
  };

  const columns: DataTableColumn<Branch>[] = [
    { id: 'name', header: 'Nombre', cell: (b) => <span className="font-medium">{b.name}</span> },
    { id: 'timezone', header: 'Zona horaria', cell: (b) => b.timezone },
    { id: 'address', header: 'Dirección', cell: (b) => b.address ?? '—' },
    {
      id: 'status',
      header: 'Estado',
      cell: (b) =>
        b.isActive ? (
          <StatusBadge tone="success" label="Activa" />
        ) : (
          <StatusBadge tone="neutral" label="Inactiva" />
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: (b) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(b)}>
            Editar
          </Button>
          {b.isActive ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setToDeactivate(b)}
              loading={deactivateMutation.isPending && deactivateMutation.variables === b.id}
            >
              Desactivar
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reactivateMutation.mutate(b.id)}
              loading={reactivateMutation.isPending && reactivateMutation.variables === b.id}
            >
              Reactivar
            </Button>
          )}
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Building2}
        title="Sedes"
        description="Sedes del gimnasio y su configuración básica."
        actions={
          <PermissionGate permission="config:write">
            <Button onClick={openCreate}>Nueva sede</Button>
          </PermissionGate>
        }
      />

      <DataTable
        caption="Sedes del gimnasio"
        columns={columns}
        data={query.data?.data ?? []}
        rowKey={(b) => b.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
        emptyTitle="Todavía no hay sedes"
        emptyDescription="Creá la primera sede para empezar a operar."
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Editar sede' : 'Nueva sede'}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="branch-form"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="branch-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            label="Zona horaria"
            required
            hint="Identificador IANA, ej. America/Argentina/Buenos_Aires"
          >
            {(field) => (
              <Input
                {...field}
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                required
              />
            )}
          </FormField>
          <FormField label="Dirección">
            {(field) => (
              <Input
                {...field}
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label="Teléfono">
            {(field) => (
              <Input
                {...field}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            )}
          </FormField>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDeactivate !== null}
        onOpenChange={(open) => !open && setToDeactivate(null)}
        title="Desactivar sede"
        description={`"${toDeactivate?.name}" dejará de estar disponible para operar. Se puede reactivar después. Si tiene socios o una caja abierta, no se va a poder desactivar.`}
        tone="danger"
        confirmLabel="Desactivar"
        loading={deactivateMutation.isPending}
        onConfirm={() => {
          if (toDeactivate) deactivateMutation.mutate(toDeactivate.id);
        }}
      />
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
