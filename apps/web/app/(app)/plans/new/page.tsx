'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BILLING_CYCLES,
  type BillingCycle,
  type CreatePlanRequest,
  type Plan,
} from '@pulso/contracts/catalog';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  MoneyDisplay,
  MoneyInput,
  Select,
  Stepper,
  Textarea,
  type StepperStep,
} from '@pulso/ui';
import { createPlan, listActivities } from '@/lib/api/catalog';
import { listBranches } from '@/lib/api/tenancy';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Alta de plan (`#/activities/new` de la referencia LeoDarrosaFIT): wizard de
 * 3 pasos — Datos del plan → Ciclo y clases → Precio — sobre `POST /plans`.
 * De la referencia se omiten los campos sin backend real (instructor, cupo
 * por clase, recargo por vencimiento, puntos): regla del plan de alineación,
 * ningún control que parezca real sin endpoint detrás. El form modal de
 * `/plans` sigue existiendo para edición; esta página es sólo alta.
 */

type StepId = 'datos' | 'ciclo' | 'precio';

const STEPS: readonly StepperStep[] = [
  { id: 'datos', label: 'Datos del plan', description: 'Nombre, actividades y sedes.' },
  { id: 'ciclo', label: 'Ciclo y clases', description: 'Facturación, duración y cupos.' },
  { id: 'precio', label: 'Precio', description: 'Se puede ajustar por socio al asignar.' },
];

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

interface NewPlanFormState {
  name: string;
  description: string;
  activityIds: string[];
  branchIds: string[];
  billingCycle: BillingCycle;
  durationDays: string;
  classesIncluded: string;
  weeklyAccessLimit: string;
  price: string;
}

const EMPTY_FORM: NewPlanFormState = {
  name: '',
  description: '',
  activityIds: [],
  branchIds: [],
  billingCycle: 'MONTHLY',
  durationDays: '',
  classesIncluded: '',
  weeklyAccessLimit: '',
  price: '',
};

export default function NewPlanPage() {
  return (
    <PermissionGate
      permission="plan:write"
      fallback={<EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para crear planes." />}
    >
      <NewPlanScreen />
    </PermissionGate>
  );
}

function NewPlanScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const idempotency = useIdempotencyKey();

  const [stepId, setStepId] = React.useState<StepId>('datos');
  const [completed, setCompleted] = React.useState<StepId[]>([]);
  const [form, setForm] = React.useState<NewPlanFormState>(EMPTY_FORM);
  const [stepError, setStepError] = React.useState<string | undefined>();
  const [created, setCreated] = React.useState<Plan | null>(null);

  const activitiesQuery = useQuery({
    queryKey: qk.activities(gymId),
    queryFn: listActivities,
    enabled: Boolean(gymId),
  });
  const branchesQuery = useQuery({
    queryKey: qk.branches(gymId),
    queryFn: listBranches,
    enabled: Boolean(gymId),
  });

  const activities = React.useMemo(
    () => (activitiesQuery.data?.data ?? []).filter((a) => a.isActive),
    [activitiesQuery.data],
  );
  const branches = branchesQuery.data?.data ?? [];

  // Ref y no `createMutation.isPending`: el closure del onClick ve el valor del render en que
  // se creó, así que dos clicks en el mismo tick (sin re-render entre medio) pasarían ambos
  // el guard de estado. El ref se actualiza sincrónicamente.
  const submittingRef = React.useRef(false);
  const createMutation = useMutation({
    mutationFn: (payload: CreatePlanRequest) => createPlan(payload, idempotency.getKey()),
    onSuccess: (plan) => setCreated(plan),
    onError: (error: unknown) => setStepError(errorMessage(error)),
    onSettled: () => {
      submittingRef.current = false;
    },
  });

  const patch = (partial: Partial<NewPlanFormState>): void => {
    setForm((f) => ({ ...f, ...partial }));
    setStepError(undefined);
  };

  const toggleId = (key: 'activityIds' | 'branchIds', id: string): void => {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
    }));
  };

  const goTo = (next: StepId, current: StepId): void => {
    setCompleted((c) => Array.from(new Set([...c, current])));
    setStepId(next);
    setStepError(undefined);
  };

  const handleDatosNext = (): void => {
    if (!form.name.trim()) {
      setStepError('Ingresá un nombre para el plan.');
      return;
    }
    goTo('ciclo', 'datos');
  };

  const handleCicloNext = (): void => {
    const durationDays = parsePositiveInt(form.durationDays);
    if (form.billingCycle === 'CLASS_PACK' && durationDays === undefined) {
      setStepError('Los packs de clases necesitan duración en días.');
      return;
    }
    goTo('precio', 'ciclo');
  };

  const handleCreate = (): void => {
    if (submittingRef.current) return;
    if (!form.price) {
      setStepError('Ingresá un precio.');
      return;
    }
    submittingRef.current = true;

    const description = form.description.trim();
    const durationDays = parsePositiveInt(form.durationDays);
    const classesIncluded = parsePositiveInt(form.classesIncluded);
    const weeklyAccessLimit = parsePositiveInt(form.weeklyAccessLimit);

    const payload: CreatePlanRequest = {
      name: form.name.trim(),
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
  };

  if (created) {
    return <DoneScreen plan={created} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nuevo plan"
        description="Alta de plan o actividad recurrente. El precio se puede ajustar por socio al asignar la membresía."
      />

      <Stepper steps={STEPS} currentStepId={stepId} completedStepIds={completed} />

      <Card className="p-6">
        {stepId === 'datos' ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Nombre" required>
                {(field) => (
                  <Input {...field} value={form.name} onChange={(e) => patch({ name: e.target.value })} required />
                )}
              </FormField>
            </div>
            <FormField label="Descripción">
              {(field) => (
                <Textarea {...field} value={form.description} onChange={(e) => patch({ description: e.target.value })} />
              )}
            </FormField>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-(--text-sm) font-medium text-(--color-text)">Actividades incluidas</legend>
              {activitiesQuery.isLoading ? (
                <p className="text-(--text-xs) text-(--color-muted)">Cargando actividades…</p>
              ) : activities.length === 0 ? (
                <p className="text-(--text-xs) text-(--color-muted)">
                  Todavía no hay actividades activas. Podés crear el plan igual y asociarlas después desde el listado.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {activities.map((activity) => (
                    <label key={activity.id} className="flex items-center gap-2 text-(--text-sm) text-(--color-text)">
                      <Checkbox
                        checked={form.activityIds.includes(activity.id)}
                        onChange={() => toggleId('activityIds', activity.id)}
                      />
                      {activity.name}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-(--text-sm) font-medium text-(--color-text)">Sedes donde se puede usar</legend>
              <p className="text-(--text-xs) text-(--color-muted)">Sin selección = todas las sedes del gimnasio.</p>
              <div className="flex flex-col gap-2">
                {branches.map((branch) => (
                  <label key={branch.id} className="flex items-center gap-2 text-(--text-sm) text-(--color-text)">
                    <Checkbox
                      checked={form.branchIds.includes(branch.id)}
                      onChange={() => toggleId('branchIds', branch.id)}
                    />
                    {branch.name}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {stepId === 'ciclo' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Ciclo de facturación" required hint="No se puede cambiar después de crear el plan.">
              {(field) => (
                <Select
                  {...field}
                  options={BILLING_CYCLE_OPTIONS}
                  value={form.billingCycle}
                  onValueChange={(v) => patch({ billingCycle: v as BillingCycle })}
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
                  onChange={(e) => patch({ durationDays: e.target.value })}
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
                  onChange={(e) => patch({ classesIncluded: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="Límite semanal de accesos" hint="Dejalo vacío para no limitar.">
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min={1}
                  value={form.weeklyAccessLimit}
                  onChange={(e) => patch({ weeklyAccessLimit: e.target.value })}
                />
              )}
            </FormField>
          </div>
        ) : null}

        {stepId === 'precio' ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Precio" required hint={`Por ciclo (${BILLING_CYCLE_LABELS[form.billingCycle]}).`}>
                {(field) => <MoneyInput {...field} value={form.price} onChange={(v) => patch({ price: v })} />}
              </FormField>
            </div>
            <SummaryCard form={form} activityCount={form.activityIds.length} branchCount={form.branchIds.length} />
          </div>
        ) : null}
      </Card>

      {stepError ? (
        <Alert tone="danger" title="Revisá el paso" live>
          {stepError}
        </Alert>
      ) : null}

      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link href="/plans">Cancelar</Link>
        </Button>
        <div className="flex gap-2">
          {stepId === 'ciclo' ? (
            <Button variant="outline" onClick={() => setStepId('datos')}>
              Anterior
            </Button>
          ) : null}
          {stepId === 'precio' ? (
            <Button variant="outline" onClick={() => setStepId('ciclo')}>
              Anterior
            </Button>
          ) : null}

          {stepId === 'datos' ? <Button onClick={handleDatosNext}>Siguiente</Button> : null}
          {stepId === 'ciclo' ? <Button onClick={handleCicloNext}>Siguiente</Button> : null}
          {stepId === 'precio' ? (
            <Button onClick={handleCreate} loading={createMutation.isPending} disabled={createMutation.isPending}>
              Crear plan
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  form,
  activityCount,
  branchCount,
}: {
  form: NewPlanFormState;
  activityCount: number;
  branchCount: number;
}) {
  return (
    <div className="flex flex-col gap-2 border-2 border-(--color-border) p-4">
      <p className="text-(--text-sm) font-semibold text-(--color-text)">Resumen</p>
      <SummaryRow label="Plan" value={form.name.trim() || '—'} />
      <SummaryRow label="Ciclo" value={BILLING_CYCLE_LABELS[form.billingCycle]} />
      <SummaryRow
        label="Clases"
        value={form.classesIncluded ? `${form.classesIncluded} por ciclo` : 'Acceso libre'}
      />
      <SummaryRow label="Actividades" value={activityCount > 0 ? String(activityCount) : 'Ninguna asociada'} />
      <SummaryRow label="Sedes" value={branchCount > 0 ? String(branchCount) : 'Todas'} />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-(--color-border) pb-2 last:border-0 last:pb-0">
      <span className="text-(--text-sm) text-(--color-muted)">{label}</span>
      <span className="text-(--text-sm) font-medium text-(--color-text)">{value}</span>
    </div>
  );
}

function DoneScreen({ plan }: { plan: Plan }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nuevo plan" description="Alta completada." />
      <Alert tone="success" title="El plan quedó disponible">
        {plan.name} ya se puede asignar a socios desde el alta o la ficha.
      </Alert>
      <Card className="flex flex-col gap-3 p-6">
        <SummaryRow label="Plan" value={plan.name} />
        <SummaryRow label="Ciclo" value={BILLING_CYCLE_LABELS[plan.billingCycle]} />
        <div className="flex items-center justify-between pb-0">
          <span className="text-(--text-sm) text-(--color-muted)">Precio</span>
          <span className="text-(--text-sm) font-medium text-(--color-text)">
            <MoneyDisplay value={plan.price} />
          </span>
        </div>
      </Card>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/plans">Ver planes</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/members/new">Dar de alta un socio</Link>
        </Button>
      </div>
    </div>
  );
}

function parsePositiveInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
