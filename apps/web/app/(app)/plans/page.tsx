'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BILLING_CYCLES,
  type BillingCycle,
  type CreatePlanRequest,
  type Plan,
  type UpdatePlanRequest,
} from '@pulso/contracts/catalog';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  MoneyDisplay,
  MoneyInput,
  Select,
  StatusBadge,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { listBranches } from '@/lib/api/tenancy';
import { createPlan, deletePlan, listActivities, listPlans, updatePlan } from '@/lib/api/catalog';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * T-M4-2 — Catálogo › Planes.
 *
 * CRUD de `Plan` (packages/contracts/src/catalog.ts): nombre, descripción,
 * ciclo, precio, límites, actividades habilitadas y sedes donde se puede
 * usar. `DELETE` es soft (`isActive: false`); el backend responde
 * `409 PLAN_IN_USE` si tiene membresías activas — se muestra el `detail`
 * tal cual llega.
 */
export default function PlansPage() {
  return (
    <PermissionGate
      permission="plan:read"
      fallback={
        <EmptyState
          title="Sin acceso"
          description="Tu usuario no tiene permiso para ver esta pantalla."
        />
      }
    >
      <PlansScreen />
    </PermissionGate>
  );
}

const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  BIANNUAL: 'Semestral',
  ANNUAL: 'Anual',
  CLASS_PACK: 'Pack de clases',
};

const BILLING_CYCLE_OPTIONS = BILLING_CYCLES.map((cycle) => ({
  value: cycle,
  label: BILLING_CYCLE_LABELS[cycle],
}));

interface PlanFormState {
  name: string;
  description: string;
  price: string;
  billingCycle: BillingCycle;
  durationDays: string;
  classesIncluded: string;
  weeklyAccessLimit: string;
  isActive: boolean;
  activityIds: string[];
  branchIds: string[];
}

const EMPTY_FORM: PlanFormState = {
  name: '',
  description: '',
  price: '',
  billingCycle: 'MONTHLY',
  durationDays: '',
  classesIncluded: '',
  weeklyAccessLimit: '',
  isActive: true,
  activityIds: [],
  branchIds: [],
};

function PlansScreen() {
  const gymId = useSessionStore((s) => s.gym?.id);
  const canWrite = usePermission('plan:write');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const idempotency = useIdempotencyKey();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Plan | null>(null);
  const [form, setForm] = React.useState<PlanFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | undefined>();
  const [toDelete, setToDelete] = React.useState<Plan | null>(null);

  const plansQuery = useQuery({
    queryKey: qk.plans(gymId ?? ''),
    queryFn: listPlans,
    enabled: Boolean(gymId),
  });
  const activitiesQuery = useQuery({
    queryKey: qk.activities(gymId ?? ''),
    queryFn: listActivities,
    enabled: Boolean(gymId),
  });
  const branchesQuery = useQuery({
    queryKey: qk.branches(gymId ?? ''),
    queryFn: listBranches,
    enabled: Boolean(gymId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.plans(gymId ?? '') });

  const createMutation = useMutation({
    mutationFn: (payload: CreatePlanRequest) => createPlan(payload, idempotency.getKey()),
    onSuccess: () => {
      toast({ title: 'Plan creado', tone: 'success' });
      idempotency.renew();
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePlanRequest }) =>
      updatePlan(id, payload),
    onSuccess: () => {
      toast({ title: 'Plan actualizado', tone: 'success' });
      setFormOpen(false);
      invalidate();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlan(id),
    onSuccess: () => {
      toast({ title: 'Plan desactivado', tone: 'success' });
      setToDelete(null);
      invalidate();
    },
    onError: (error: unknown) => {
      // 409 PLAN_IN_USE llega acá; se muestra el detail del backend tal cual.
      toast({
        title: 'No se pudo desactivar el plan',
        description: errorMessage(error),
        tone: 'danger',
      });
      setToDelete(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setFormOpen(true);
  };

  const openEdit = (plan: Plan) => {
    setEditing(plan);
    setForm({
      name: plan.name,
      description: plan.description ?? '',
      price: plan.price,
      billingCycle: plan.billingCycle,
      durationDays: plan.durationDays !== null ? String(plan.durationDays) : '',
      classesIncluded: plan.classesIncluded !== null ? String(plan.classesIncluded) : '',
      weeklyAccessLimit: plan.weeklyAccessLimit !== null ? String(plan.weeklyAccessLimit) : '',
      isActive: plan.isActive,
      activityIds: [...plan.activityIds],
      branchIds: [...plan.branchIds],
    });
    setFormError(undefined);
    setFormOpen(true);
  };

  const toggleActivity = (activityId: string) => {
    setForm((f) => ({
      ...f,
      activityIds: f.activityIds.includes(activityId)
        ? f.activityIds.filter((id) => id !== activityId)
        : [...f.activityIds, activityId],
    }));
  };
  const toggleBranch = (branchId: string) => {
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(branchId)
        ? f.branchIds.filter((id) => id !== branchId)
        : [...f.branchIds, branchId],
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);

    const name = form.name.trim();
    if (!name) {
      setFormError('Ingresá un nombre.');
      return;
    }
    if (!form.price) {
      setFormError('Ingresá un precio.');
      return;
    }
    const durationDays = parsePositiveInt(form.durationDays);
    const classesIncluded = parsePositiveInt(form.classesIncluded);
    const weeklyAccessLimit = parsePositiveInt(form.weeklyAccessLimit);

    if (form.billingCycle === 'CLASS_PACK' && durationDays === undefined) {
      setFormError('Los packs de clases necesitan duración en días.');
      return;
    }

    if (editing) {
      const payload: UpdatePlanRequest = {
        name,
        description: form.description.trim() || null,
        price: form.price,
        durationDays: durationDays ?? null,
        classesIncluded: classesIncluded ?? null,
        weeklyAccessLimit: weeklyAccessLimit ?? null,
        isActive: form.isActive,
        activityIds: form.activityIds,
        branchIds: form.branchIds,
      };
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      const description = form.description.trim();
      const payload: CreatePlanRequest = {
        name,
        price: form.price,
        billingCycle: form.billingCycle,
        activityIds: form.activityIds,
        branchIds: form.branchIds,
        ...(description ? { description } : {}),
        ...(durationDays !== undefined ? { durationDays } : {}),
        ...(classesIncluded !== undefined ? { classesIncluded } : {}),
        ...(weeklyAccessLimit !== undefined ? { weeklyAccessLimit } : {}),
      };
      createMutation.mutate(payload);
    }
  };

  const columns: DataTableColumn<Plan>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: (p) => (
        <div className="flex flex-col">
          <span className="font-medium text-(--color-text)">{p.name}</span>
          {p.description ? (
            <span className="text-(--text-xs) text-(--color-muted)">{p.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'cycle',
      header: 'Ciclo',
      cell: (p) => BILLING_CYCLE_LABELS[p.billingCycle],
    },
    {
      id: 'price',
      header: 'Precio',
      cell: (p) => <MoneyDisplay value={p.price} />,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'classes',
      header: 'Clases',
      cell: (p) =>
        p.classesIncluded !== null ? (
          <span className="tabular-nums">{p.classesIncluded}</span>
        ) : (
          <span className="text-(--color-muted)">Libre</span>
        ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (p) =>
        p.isActive ? (
          <StatusBadge tone="success" label="Activo" />
        ) : (
          <StatusBadge tone="neutral" label="Inactivo" />
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: (p) =>
        canWrite ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
              Editar
            </Button>
            {p.isActive ? (
              <Button variant="danger" size="sm" onClick={() => setToDelete(p)}>
                Desactivar
              </Button>
            ) : null}
          </div>
        ) : null,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  const activities = activitiesQuery.data?.data ?? [];
  const branches = branchesQuery.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Planes</h1>
          <p className="text-(--text-sm) text-(--color-muted)">
            Combinaciones de actividades, ciclo de facturación y precio que se venden a los socios.
          </p>
        </div>
        <PermissionGate permission="plan:write">
          <Button onClick={openCreate}>Nuevo plan</Button>
        </PermissionGate>
      </div>

      <DataTable
        caption="Planes del gimnasio"
        columns={columns}
        data={plansQuery.data?.data ?? []}
        rowKey={(p) => p.id}
        loading={plansQuery.isLoading}
        error={plansQuery.isError ? errorMessage(plansQuery.error) : undefined}
        onRetry={() => plansQuery.refetch()}
        emptyTitle="Todavía no hay planes"
        emptyDescription="Creá el primer plan para poder asignar membresías."
        emptyAction={
          <PermissionGate permission="plan:write">
            <Button onClick={openCreate}>Nuevo plan</Button>
          </PermissionGate>
        }
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Editar plan' : 'Nuevo plan'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="plan-form"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="plan-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError ? (
            <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              label="Ciclo de facturación"
              required
              hint={editing ? 'El ciclo no se puede editar después de crear el plan.' : undefined}
            >
              {(field) => (
                <Select
                  {...field}
                  options={BILLING_CYCLE_OPTIONS}
                  value={form.billingCycle}
                  disabled={Boolean(editing)}
                  onValueChange={(v) => setForm((f) => ({ ...f, billingCycle: v as BillingCycle }))}
                />
              )}
            </FormField>
          </div>

          <FormField label="Descripción">
            {(field) => (
              <Textarea
                {...field}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            )}
          </FormField>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormField label="Precio" required>
              {(field) => (
                <MoneyInput
                  {...field}
                  value={form.price}
                  onChange={(v) => setForm((f) => ({ ...f, price: v }))}
                />
              )}
            </FormField>
            <FormField
              label="Duración (días)"
              hint={
                form.billingCycle === 'CLASS_PACK'
                  ? 'Obligatorio para packs de clases.'
                  : 'Opcional. Si se omite, se usa el default del ciclo.'
              }
            >
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min={1}
                  value={form.durationDays}
                  onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))}
                />
              )}
            </FormField>
            <FormField label="Clases incluidas" hint="Dejalo vacío para acceso libre.">
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min={1}
                  value={form.classesIncluded}
                  onChange={(e) => setForm((f) => ({ ...f, classesIncluded: e.target.value }))}
                />
              )}
            </FormField>
          </div>

          <FormField label="Límite semanal de accesos" hint="Dejalo vacío para no limitar.">
            {(field) => (
              <Input
                {...field}
                type="number"
                min={1}
                value={form.weeklyAccessLimit}
                onChange={(e) => setForm((f) => ({ ...f, weeklyAccessLimit: e.target.value }))}
              />
            )}
          </FormField>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-(--text-sm) font-medium text-(--color-text)">
              Actividades incluidas
            </legend>
            {activities.length === 0 ? (
              <p className="text-(--text-xs) text-(--color-muted)">
                Todavía no hay actividades. Creá alguna desde el menú de actividades para poder
                asociarla al plan.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {activities.map((activity) => (
                  <label
                    key={activity.id}
                    className="flex items-center gap-2 text-(--text-sm) text-(--color-text)"
                  >
                    <Checkbox
                      checked={form.activityIds.includes(activity.id)}
                      onChange={() => toggleActivity(activity.id)}
                    />
                    {activity.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-(--text-sm) font-medium text-(--color-text)">
              Sedes donde se puede usar
            </legend>
            <p className="text-(--text-xs) text-(--color-muted)">
              Sin selección = todas las sedes del gimnasio.
            </p>
            <div className="flex flex-col gap-2">
              {branches.map((branch) => (
                <label
                  key={branch.id}
                  className="flex items-center gap-2 text-(--text-sm) text-(--color-text)"
                >
                  <Checkbox
                    checked={form.branchIds.includes(branch.id)}
                    onChange={() => toggleBranch(branch.id)}
                  />
                  {branch.name}
                </label>
              ))}
            </div>
          </fieldset>

          {editing ? (
            <label className="flex items-center gap-2 text-(--text-sm) text-(--color-text)">
              <Checkbox
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Plan activo (se puede asignar a nuevos socios)
            </label>
          ) : null}
        </form>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Desactivar plan"
        description={`"${toDelete?.name}" queda inactivo pero no se borra; se puede reactivar más adelante. Si tiene membresías activas no se va a poder desactivar.`}
        tone="danger"
        confirmLabel="Desactivar"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (toDelete) deleteMutation.mutate(toDelete.id);
        }}
      />
    </div>
  );
}

/**
 * Convierte el string del input a un entero positivo, o `undefined` si el
 * valor está vacío o no es válido. Los inputs numéricos guardan siempre
 * strings, y el backend espera enteros o campo ausente.
 */
function parsePositiveInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
