'use client';

import * as React from 'react';
import { ClipboardList, Eye } from 'lucide-react';
import {
  Button,
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
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { DEMO_INSTRUCTORS, type DemoInstructor } from '@/lib/mock/data/training-demo';

const DEMO_TOAST_MESSAGE = 'Demo: disponible con backend';

/**
 * Instructores › Equipo de instructores del gimnasio. Módulo DEMO
 * (`instructor:read`): sin backend todavía, datos de
 * `lib/mock/data/training-demo.ts` con latencia simulada.
 */
export default function InstructorsPage() {
  return (
    <PermissionGate
      permission="instructor:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <InstructorsScreen />
    </PermissionGate>
  );
}

interface InstructorFormState {
  firstName: string;
  lastName: string;
  email: string;
  specialty: string;
}

const EMPTY_FORM: InstructorFormState = { firstName: '', lastName: '', email: '', specialty: '' };

function InstructorsScreen() {
  const { data, isLoading } = useMockData(() => DEMO_INSTRUCTORS);
  const { toast } = useToast();

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<InstructorFormState>(EMPTY_FORM);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormOpen(false);
    toast({ description: DEMO_TOAST_MESSAGE, tone: 'info' });
  };

  const handleView = (): void => {
    toast({ description: DEMO_TOAST_MESSAGE, tone: 'info' });
  };

  const columns: DataTableColumn<DemoInstructor>[] = [
    {
      id: 'instructor',
      header: 'Instructor',
      cell: (i) => {
        const initials = `${i.firstName[0] ?? ''}${i.lastName[0] ?? ''}`.toUpperCase();
        return (
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden={true}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-primary-subtle) text-(--text-xs) font-semibold text-(--color-primary-subtle-foreground)"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-(--color-text)">
                {i.firstName} {i.lastName}
              </p>
              <p className="truncate text-(--text-xs) text-(--color-muted)">{i.email}</p>
            </div>
          </div>
        );
      },
    },
    { id: 'phone', header: 'Teléfono', cell: (i) => <span className="text-(--color-muted)">{i.phone}</span> },
    { id: 'specialty', header: 'Especialidad', cell: (i) => i.specialty },
    {
      id: 'assignedMembers',
      header: 'Socios asignados',
      cell: (i) => <span className="tabular-nums">{i.assignedMembers}</span>,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (i) =>
        i.active ? (
          <StatusBadge tone="success" label="Activo" />
        ) : (
          <StatusBadge tone="neutral" label="Inactivo" />
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Ver instructor"
            onClick={handleView}
          >
            <Eye className="h-4 w-4" aria-hidden={true} />
          </Button>
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Instructores"
        description="Equipo de instructores del gimnasio."
        icon={ClipboardList}
        mock
        actions={<Button onClick={openCreate}>Nuevo instructor</Button>}
      />

      <DataTable
        caption="Instructores del gimnasio"
        columns={columns}
        data={data ?? []}
        rowKey={(i) => i.id}
        loading={isLoading}
        emptyTitle="Todavía no hay instructores"
        emptyDescription="Sumá el primer instructor para asignarlo a rutinas y clases."
        emptyAction={<Button onClick={openCreate}>Nuevo instructor</Button>}
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Nuevo instructor"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="instructor-form">
              Guardar
            </Button>
          </>
        }
      >
        <form id="instructor-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Nombre" required>
            {(field) => (
              <Input
                {...field}
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                required
              />
            )}
          </FormField>
          <FormField label="Apellido" required>
            {(field) => (
              <Input
                {...field}
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                required
              />
            )}
          </FormField>
          <FormField label="Email" required>
            {(field) => (
              <Input
                {...field}
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            )}
          </FormField>
          <FormField label="Especialidad" required>
            {(field) => (
              <Input
                {...field}
                value={form.specialty}
                onChange={(e) => setForm((f) => ({ ...f, specialty: e.target.value }))}
                placeholder="Ej: Musculación"
                required
              />
            )}
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
