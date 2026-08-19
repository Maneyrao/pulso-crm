'use client';

import * as React from 'react';
import { Dumbbell } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormField,
  Input,
  Modal,
  Skeleton,
  StatusBadge,
  useToast,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { DEMO_ROUTINES, type DemoRoutine } from '@/lib/mock/data/training-demo';

const DEMO_TOAST_MESSAGE = 'Demo: disponible con backend';

/**
 * Rutinas › Plantillas de entrenamiento asignables a socios. Módulo DEMO
 * (`routine:read`): todavía no existe backend de Entrenamiento, así que los
 * datos vienen de `lib/mock/data/training-demo.ts` con latencia simulada.
 */
export default function RoutinesPage() {
  return (
    <PermissionGate
      permission="routine:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <RoutinesScreen />
    </PermissionGate>
  );
}

interface RoutineFormState {
  name: string;
  goal: string;
  daysPerWeek: string;
}

const EMPTY_FORM: RoutineFormState = { name: '', goal: '', daysPerWeek: '' };

function RoutinesScreen() {
  const { data: routines, isLoading } = useMockData(() => DEMO_ROUTINES);
  const { toast } = useToast();

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<RoutineFormState>(EMPTY_FORM);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormOpen(false);
    toast({ description: DEMO_TOAST_MESSAGE, tone: 'info' });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rutinas"
        description="Plantillas de entrenamiento asignables a socios."
        icon={Dumbbell}
        mock
        actions={<Button onClick={openCreate}>Nueva rutina</Button>}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : routines && routines.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {routines.map((routine) => (
            <RoutineCard key={routine.id} routine={routine} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="Todavía no hay rutinas"
          description="Creá la primera plantilla de entrenamiento para asignar a tus socios."
          action={<Button onClick={openCreate}>Nueva rutina</Button>}
        />
      )}

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Nueva rutina"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="routine-form">
              Guardar
            </Button>
          </>
        }
      >
        <form id="routine-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Nombre" required>
            {(field) => (
              <Input
                {...field}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Fuerza total"
                required
              />
            )}
          </FormField>
          <FormField label="Objetivo" required>
            {(field) => (
              <Input
                {...field}
                value={form.goal}
                onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                placeholder="Ej: Hipertrofia"
                required
              />
            )}
          </FormField>
          <FormField label="Días por semana" required>
            {(field) => (
              <Input
                {...field}
                type="number"
                min={1}
                max={7}
                value={form.daysPerWeek}
                onChange={(e) => setForm((f) => ({ ...f, daysPerWeek: e.target.value }))}
                required
              />
            )}
          </FormField>
        </form>
      </Modal>
    </div>
  );
}

function RoutineCard({ routine }: { routine: DemoRoutine }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{routine.name}</CardTitle>
        <p className="text-(--text-sm) text-(--color-muted)">{routine.goal}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="info">{routine.daysPerWeek} días/semana</Badge>
          <Badge tone="neutral">{routine.exerciseCount} ejercicios</Badge>
        </div>
        <dl className="flex flex-col gap-1 text-(--text-sm)">
          <div className="flex justify-between gap-2">
            <dt className="text-(--color-muted)">Instructor</dt>
            <dd className="text-(--color-text)">{routine.instructorName ?? 'Sin asignar'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-(--color-muted)">Socios asignados</dt>
            <dd className="text-(--color-text)">{routine.assignedMembers}</dd>
          </div>
        </dl>
        <div>
          <StatusBadge tone={routine.statusTone} label={routine.statusLabel} />
        </div>
      </CardContent>
    </Card>
  );
}
