'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown, Settings } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Gym, UpdateGymRequest } from '@pulso/contracts/tenancy';
import {
  Button,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { getGym, listBranches, updateGym } from '@/lib/api/tenancy';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Configuración general (API_CONTRACTS §4 `GET/PATCH /gym`, `GET /branches`).
 *
 * Sólo dos tabs: "Gimnasio" (datos reales editables vía `PATCH /gym`, campos
 * limitados a los que acepta `updateGymRequestSchema`) y "Sedes" (listado
 * real con link a `/settings/branches`, que ya tiene el CRUD completo — no
 * se duplica acá). Se eliminaron los tabs de control de acceso, facturación
 * ARCA y app móvil: no persisten en ningún backend real (LEODARROSAFIT
 * ALIGNMENT PLAN §3, fila `#/config`).
 */
export default function ConfigPage() {
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
      <ConfigScreen />
    </PermissionGate>
  );
}

function ConfigScreen() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Settings}
        title="Configuración"
        description="Datos del gimnasio y sus sedes."
      />

      <Tabs defaultValue="gimnasio">
        <TabsList>
          <TabsTrigger value="gimnasio">Gimnasio</TabsTrigger>
          <TabsTrigger value="sedes">Sedes</TabsTrigger>
        </TabsList>

        <TabsContent value="gimnasio">
          <GymTab />
        </TabsContent>

        <TabsContent value="sedes">
          <BranchesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface GymFormState {
  name: string;
  legalName: string;
  taxId: string;
  country: string;
  currency: string;
  locale: string;
  logoKey: string;
  primaryColor: string;
}

function toFormState(gym: Gym): GymFormState {
  return {
    name: gym.name,
    legalName: gym.legalName ?? '',
    taxId: gym.taxId ?? '',
    country: gym.country,
    currency: gym.currency,
    locale: gym.locale,
    logoKey: gym.logoKey ?? '',
    primaryColor: gym.primaryColor ?? '',
  };
}

function toUpdateRequest(form: GymFormState): UpdateGymRequest {
  return {
    name: form.name.trim(),
    legalName: form.legalName.trim() || null,
    taxId: form.taxId.trim() || null,
    country: form.country.trim().toUpperCase(),
    currency: form.currency.trim().toUpperCase(),
    locale: form.locale.trim(),
    logoKey: form.logoKey.trim() || null,
    primaryColor: form.primaryColor.trim() || null,
  };
}

function GymTab() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const canWrite = usePermission('config:write');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({ queryKey: qk.gym(gymId), queryFn: getGym, enabled: Boolean(gymId) });

  const [form, setForm] = React.useState<GymFormState | null>(null);
  const [formError, setFormError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (query.data) setForm(toFormState(query.data));
  }, [query.data]);

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateGymRequest) => updateGym(payload),
    onSuccess: (gym) => {
      toast({ title: 'Datos del gimnasio actualizados', tone: 'success' });
      setForm(toFormState(gym));
      queryClient.invalidateQueries({ queryKey: qk.gym(gymId) });
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    if (!form) return;
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio.');
      return;
    }
    if (form.country.trim().length !== 2) {
      setFormError('El país es un código ISO de 2 letras (ej. AR).');
      return;
    }
    if (form.currency.trim().length !== 3) {
      setFormError('La moneda es un código ISO de 3 letras (ej. ARS).');
      return;
    }
    updateMutation.mutate(toUpdateRequest(form));
  };

  if (query.isLoading || (!form && !query.isError)) {
    return (
      <EmptyState title="Cargando datos del gimnasio" description="Buscando la información..." />
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="No pudimos cargar los datos del gimnasio"
        description={errorMessage(query.error)}
        onRetry={() => query.refetch()}
      />
    );
  }

  if (!form) return null;

  return (
    <div className="flex flex-col gap-3">
      <AccordionSection title="Datos del gimnasio" defaultOpen>
        <form id="gym-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError ? (
            <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nombre" required>
              {(field) => (
                <Input
                  {...field}
                  value={form.name}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })}
                  required
                />
              )}
            </FormField>
            <FormField label="Razón social">
              {(field) => (
                <Input
                  {...field}
                  value={form.legalName}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, legalName: e.target.value })}
                />
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="CUIT / identificación fiscal">
              {(field) => (
                <Input
                  {...field}
                  value={form.taxId}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, taxId: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="País" required hint="Código ISO de 2 letras, ej. AR">
              {(field) => (
                <Input
                  {...field}
                  value={form.country}
                  maxLength={2}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, country: e.target.value })}
                  required
                />
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Moneda" required hint="Código ISO de 3 letras, ej. ARS">
              {(field) => (
                <Input
                  {...field}
                  value={form.currency}
                  maxLength={3}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, currency: e.target.value })}
                  required
                />
              )}
            </FormField>
            <FormField label="Idioma / locale" hint="ej. es-AR">
              {(field) => (
                <Input
                  {...field}
                  value={form.locale}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, locale: e.target.value })}
                />
              )}
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Logo"
              hint="Key del archivo en storage (no hay carga de imagen todavía)"
            >
              {(field) => (
                <Input
                  {...field}
                  value={form.logoKey}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, logoKey: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="Color primario" hint="Hex, ej. #c9a56c">
              {(field) => (
                <Input
                  {...field}
                  value={form.primaryColor}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, primaryColor: e.target.value })}
                />
              )}
            </FormField>
          </div>

          {canWrite ? (
            <div className="flex justify-end">
              <Button type="submit" loading={updateMutation.isPending}>
                Guardar cambios
              </Button>
            </div>
          ) : null}
        </form>
      </AccordionSection>

      <AccordionSection title="Estado de la cuenta">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">
              Identificador
            </dt>
            <dd className="mt-0.5 text-(--text-sm) text-(--color-text)">{query.data.slug}</dd>
          </div>
          <div>
            <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">
              Estado
            </dt>
            <dd className="mt-0.5">
              <StatusBadge
                tone={query.data.status === 'ACTIVE' ? 'success' : 'danger'}
                label={GYM_STATUS_LABEL[query.data.status]}
              />
            </dd>
          </div>
        </dl>
      </AccordionSection>
    </div>
  );
}

const GYM_STATUS_LABEL: Record<Gym['status'], string> = {
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  CANCELLED: 'Cancelado',
};

function BranchesTab() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const query = useQuery({
    queryKey: qk.branches(gymId),
    queryFn: listBranches,
    enabled: Boolean(gymId),
  });
  const branches = query.data?.data ?? [];
  const activeCount = branches.filter((b) => b.isActive).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-(--text-sm) text-(--color-muted)">
          {branches.length === 0
            ? 'Todavía no hay sedes cargadas.'
            : `${activeCount} de ${branches.length} ${branches.length === 1 ? 'sede activa' : 'sedes activas'}.`}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/branches">Gestionar sedes</Link>
        </Button>
      </div>

      {query.isLoading ? (
        <EmptyState title="Cargando sedes" description="Buscando las sedes del gimnasio..." />
      ) : query.isError ? (
        <ErrorState
          title="No pudimos cargar las sedes"
          description={errorMessage(query.error)}
          onRetry={() => query.refetch()}
        />
      ) : branches.length === 0 ? (
        <EmptyState title="Sin sedes" description="Creá la primera sede desde “Gestionar sedes”." />
      ) : (
        <ul className="flex flex-col gap-2">
          {branches.map((branch) => (
            <li
              key={branch.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-lg) border-2 border-(--color-border) bg-(--color-surface) px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-(--color-text)">{branch.name}</p>
                <p className="text-(--text-xs) text-(--color-muted)">
                  {branch.timezone}
                  {branch.address ? ` · ${branch.address}` : ''}
                </p>
              </div>
              {branch.isActive ? (
                <StatusBadge tone="success" label="Activa" />
              ) : (
                <StatusBadge tone="neutral" label="Inactiva" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AccordionSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-(--text-base) font-medium text-(--color-text) [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-(--color-muted) transition-transform duration-200 group-open:rotate-180"
          aria-hidden={true}
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-(--color-border) px-4 py-4">
        {children}
      </div>
    </details>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
