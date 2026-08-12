'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Activity,
  CreateActivityRequest,
  UpdateActivityRequest,
} from '@pulso/contracts/catalog';
import {
  Button,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  StatusBadge,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { createActivity, listActivities, updateActivity } from '@/lib/api/catalog';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * T-M4-1 — Catálogo › Actividades.
 *
 * CRUD simple: nombre, descripción, color y toggle activo. `plan:read` /
 * `plan:write` (el catálogo comparte permisos con Planes: la actividad
 * sólo tiene sentido como componente de un plan).
 */
export default function ActivitiesPage() {
  return (
    <PermissionGate
      permission="plan:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <ActivitiesScreen />
    </PermissionGate>
  );
}

interface ActivityFormState {
  name: string;
  description: string;
  color: string;
}

const EMPTY_FORM: ActivityFormState = { name: '', description: '', color: '' };
const DEFAULT_SWATCH = '#94a3b8';

function ActivitiesScreen() {
  const gymId = useSessionStore((s) => s.gym?.id);
  const canWrite = usePermission('plan:write');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const idempotency = useIdempotencyKey();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Activity | null>(null);
  const [form, setForm] = React.useState<ActivityFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | undefined>();

  const query = useQuery({
    queryKey: qk.activities(gymId ?? ''),
    queryFn: listActivities,
    enabled: Boolean(gymId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.activities(gymId ?? '') });

  const createMutation = useMutation({
    mutationFn: (payload: CreateActivityRequest) => createActivity(payload, idempotency.getKey()),
    onSuccess: () => {
      toast({ title: 'Actividad creada', tone: 'success' });
      idempotency.renew();
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateActivityRequest }) =>
      updateActivity(id, payload),
    onSuccess: () => {
      toast({ title: 'Actividad actualizada', tone: 'success' });
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateActivity(id, { isActive }),
    onSuccess: (activity) => {
      toast({
        title: activity.isActive ? 'Actividad reactivada' : 'Actividad desactivada',
        tone: 'success',
      });
      invalidate();
    },
    onError: (error: unknown) => {
      toast({
        title: 'No se pudo cambiar el estado',
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

  const openEdit = (activity: Activity) => {
    setEditing(activity);
    setForm({
      name: activity.name,
      description: activity.description ?? '',
      color: activity.color ?? '',
    });
    setFormError(undefined);
    setFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    const name = form.name.trim();
    if (!name) {
      setFormError('Ingresá un nombre.');
      return;
    }
    const description = form.description.trim();
    const color = form.color.trim();
    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        payload: {
          name,
          description: description || null,
          color: color || null,
        },
      });
    } else {
      createMutation.mutate({
        name,
        ...(description ? { description } : {}),
        ...(color ? { color } : {}),
      });
    }
  };

  const columns: DataTableColumn<Activity>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (a) => (
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 rounded-full border border-(--color-border)"
            style={{ backgroundColor: a.color ?? DEFAULT_SWATCH }}
          />
          <span className="font-medium">{a.name}</span>
        </div>
      ),
    },
    {
      id: 'description',
      header: 'Descripción',
      cell: (a) => (
        <span className="text-(--color-muted)">{a.description ?? '—'}</span>
      ),
    },
    {
      id: 'color',
      header: 'Color',
      cell: (a) =>
        a.color ? (
          <code className="rounded-(--radius-sm) bg-(--color-muted-subtle) px-1.5 py-0.5 text-(--text-xs) tabular-nums">
            {a.color}
          </code>
        ) : (
          <span className="text-(--color-muted)">—</span>
        ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (a) =>
        a.isActive ? (
          <StatusBadge tone="success" label="Activa" />
        ) : (
          <StatusBadge tone="neutral" label="Inactiva" />
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: (a) =>
        canWrite ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
              Editar
            </Button>
            <Button
              variant={a.isActive ? 'danger' : 'outline'}
              size="sm"
              onClick={() => toggleMutation.mutate({ id: a.id, isActive: !a.isActive })}
              loading={
                toggleMutation.isPending && (toggleMutation.variables as { id: string } | undefined)?.id === a.id
              }
            >
              {a.isActive ? 'Desactivar' : 'Reactivar'}
            </Button>
          </div>
        ) : null,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Actividades</h1>
          <p className="text-(--text-sm) text-(--color-muted)">
            Disciplinas que ofrece el gimnasio. Se combinan en los planes.
          </p>
        </div>
        <PermissionGate permission="plan:write">
          <Button onClick={openCreate}>Nueva actividad</Button>
        </PermissionGate>
      </div>

      <DataTable
        caption="Actividades del gimnasio"
        columns={columns}
        data={query.data?.data ?? []}
        rowKey={(a) => a.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
        emptyTitle="Todavía no hay actividades"
        emptyDescription="Creá la primera actividad para armar planes."
        emptyAction={
          <PermissionGate permission="plan:write">
            <Button onClick={openCreate}>Nueva actividad</Button>
          </PermissionGate>
        }
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Editar actividad' : 'Nueva actividad'}
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="activity-form"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="activity-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
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
          <FormField label="Descripción">
            {(field) => (
              <Textarea
                {...field}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            )}
          </FormField>
          <FormField label="Color" hint="Se usa para identificar la actividad en listados y calendarios.">
            {(field) => (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Selector de color"
                  className="h-9 w-12 cursor-pointer rounded-(--radius-sm) border border-(--color-border-strong) bg-(--color-surface)"
                  value={form.color || DEFAULT_SWATCH}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                />
                <Input
                  {...field}
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="#RRGGBB"
                  className="flex-1"
                />
              </div>
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
