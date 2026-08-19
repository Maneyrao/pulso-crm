'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarOff } from 'lucide-react';
import {
  Button,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  StatusBadge,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { createScheduleExceptions, type ScheduleException } from '@/lib/mock/data/schedule-demo';

const EXCEPTION_TYPE_OPTIONS = [
  { value: 'FERIADO', label: 'Feriado' },
  { value: 'ESPECIAL', label: 'Especial' },
];

interface ExceptionFormState {
  date: string;
  type: string;
  reason: string;
}

const EMPTY_FORM: ExceptionFormState = { date: '', type: 'FERIADO', reason: '' };

/**
 * T-DEMO — Cronograma › Excepciones y feriados. Página de demostración: el
 * backend de reservas todavía no existe (nav-items.ts la marca `mock: true`).
 * `Tipo` condensa el dataset a dos badges: Feriado Nacional → warning
 * "Feriado"; Mantenimiento / Horario reducido → info "Especial".
 */
export default function ScheduleExceptionsPage() {
  return (
    <PermissionGate
      permission="reservation:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <ScheduleExceptionsScreen />
    </PermissionGate>
  );
}

function ScheduleExceptionsScreen() {
  const { data: exceptions, isLoading } = useMockData(() => createScheduleExceptions());
  const { toast } = useToast();

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<ExceptionFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | undefined>();

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    if (!form.date) {
      setFormError('Elegí una fecha.');
      return;
    }
    if (!form.reason.trim()) {
      setFormError('Ingresá un motivo.');
      return;
    }
    setFormOpen(false);
    toast({ description: 'Demo: disponible con backend', tone: 'info' });
  };

  const columns: DataTableColumn<ScheduleException>[] = [
    {
      id: 'date',
      header: 'Fecha',
      cell: (e) => (
        <span className="tabular-nums text-(--color-text)">{format(parseISO(e.date), 'dd/MM/yyyy')}</span>
      ),
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: (e) =>
        e.type === 'Feriado Nacional' ? (
          <StatusBadge tone="warning" label="Feriado" />
        ) : (
          <StatusBadge tone="info" label="Especial" />
        ),
    },
    {
      id: 'reason',
      header: 'Motivo',
      cell: (e) => <span className="text-(--color-text)">{e.reason}</span>,
    },
    {
      id: 'branch',
      header: 'Sede',
      cell: (e) => <span className="text-(--color-muted)">{e.branch}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CalendarOff}
        title="Excepciones y feriados"
        description="Días sin actividad o con horario especial."
        mock
        actions={<Button onClick={openCreate}>Nueva excepción</Button>}
      />

      <DataTable
        caption="Excepciones y feriados del cronograma"
        columns={columns}
        data={exceptions ?? []}
        rowKey={(e) => e.id}
        loading={isLoading}
        emptyTitle="Todavía no hay excepciones cargadas"
        emptyDescription="Los feriados y días con horario especial van a aparecer acá."
        emptyAction={<Button onClick={openCreate}>Nueva excepción</Button>}
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Nueva excepción"
        description="Datos de ejemplo: esta pantalla todavía no persiste cambios."
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="exception-form">
              Guardar
            </Button>
          </>
        }
      >
        <form id="exception-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError ? (
            <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
              {formError}
            </p>
          ) : null}
          <FormField label="Fecha" required>
            {(field) => (
              <Input
                {...field}
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            )}
          </FormField>
          <FormField label="Tipo" required>
            {(field) => (
              <Select
                {...field}
                options={EXCEPTION_TYPE_OPTIONS}
                value={form.type}
                onValueChange={(value) => setForm((f) => ({ ...f, type: value }))}
              />
            )}
          </FormField>
          <FormField label="Motivo" required>
            {(field) => (
              <Textarea
                {...field}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            )}
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
