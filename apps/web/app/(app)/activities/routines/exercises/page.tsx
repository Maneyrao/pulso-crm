'use client';

import * as React from 'react';
import { Dumbbell, PlayCircle } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import {
  DEMO_EXERCISES,
  EXERCISE_CATEGORIES,
  EXERCISE_ORIGINS,
  type DemoExercise,
} from '@/lib/mock/data/training-demo';

const DEMO_TOAST_MESSAGE = 'Demo: disponible con backend';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Todas las categorías' },
  ...EXERCISE_CATEGORIES.map((category) => ({ value: category, label: category })),
];

const ORIGIN_OPTIONS = [
  { value: 'all', label: 'Todos los orígenes' },
  ...EXERCISE_ORIGINS.map((origin) => ({ value: origin, label: origin })),
];

/**
 * Ejercicios › Catálogo de ejercicios para armar rutinas. Módulo DEMO
 * (`routine:read`), mismo dataset mock que Rutinas. Búsqueda y filtros de
 * categoría/origen corren en cliente sobre el dataset ya cargado.
 */
export default function ExercisesPage() {
  return (
    <PermissionGate
      permission="routine:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <ExercisesScreen />
    </PermissionGate>
  );
}

interface ExerciseFormState {
  name: string;
  category: string;
  muscle: string;
}

const EMPTY_FORM: ExerciseFormState = { name: '', category: '', muscle: '' };

function ExercisesScreen() {
  const { data: exercises, isLoading } = useMockData(() => DEMO_EXERCISES);
  const { toast } = useToast();

  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [origin, setOrigin] = React.useState('all');

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<ExerciseFormState>(EMPTY_FORM);

  const isFiltered = search.trim() !== '' || category !== 'all' || origin !== 'all';

  const filtered = React.useMemo(() => {
    if (!exercises) return [];
    const term = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      const matchesSearch = term === '' || exercise.name.toLowerCase().includes(term);
      const matchesCategory = category === 'all' || exercise.category === category;
      const matchesOrigin = origin === 'all' || exercise.origin === origin;
      return matchesSearch && matchesCategory && matchesOrigin;
    });
  }, [exercises, search, category, origin]);

  const clearFilters = () => {
    setSearch('');
    setCategory('all');
    setOrigin('all');
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormOpen(false);
    toast({ description: DEMO_TOAST_MESSAGE, tone: 'info' });
  };

  const columns: DataTableColumn<DemoExercise>[] = [
    { id: 'name', header: 'Nombre', cell: (e) => <span className="font-medium">{e.name}</span> },
    { id: 'category', header: 'Categoría', cell: (e) => e.category },
    { id: 'muscle', header: 'Músculo', cell: (e) => <span className="text-(--color-muted)">{e.muscle}</span> },
    { id: 'equipment', header: 'Equipo', cell: (e) => e.equipment },
    {
      id: 'origin',
      header: 'Origen',
      cell: (e) => <Badge tone={e.origin === 'Catálogo' ? 'info' : 'neutral'}>{e.origin}</Badge>,
    },
    {
      id: 'video',
      header: 'Video',
      cell: (e) =>
        e.hasVideo ? (
          <PlayCircle className="h-4 w-4 text-(--color-primary)" aria-label="Con video" />
        ) : (
          <span className="text-(--color-muted)">—</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ejercicios"
        description="Catálogo de ejercicios para armar rutinas."
        icon={Dumbbell}
        mock
        actions={<Button onClick={openCreate}>Nuevo ejercicio</Button>}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <label htmlFor="exercise-search" className="text-(--text-sm) font-medium text-(--color-text)">
            Buscar
          </label>
          <Input
            id="exercise-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre del ejercicio"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="exercise-category" className="text-(--text-sm) font-medium text-(--color-text)">
            Categoría
          </label>
          <Select id="exercise-category" options={CATEGORY_OPTIONS} value={category} onValueChange={setCategory} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="exercise-origin" className="text-(--text-sm) font-medium text-(--color-text)">
            Origen
          </label>
          <Select id="exercise-origin" options={ORIGIN_OPTIONS} value={origin} onValueChange={setOrigin} />
        </div>
      </div>

      <DataTable
        caption="Catálogo de ejercicios"
        columns={columns}
        data={filtered}
        rowKey={(e) => e.id}
        loading={isLoading}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyTitle="Todavía no hay ejercicios"
        emptyDescription="Creá el primer ejercicio para armar rutinas."
        emptyAction={<Button onClick={openCreate}>Nuevo ejercicio</Button>}
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Nuevo ejercicio"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="exercise-form">
              Guardar
            </Button>
          </>
        }
      >
        <form id="exercise-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Nombre" required>
            {(field) => (
              <Input
                {...field}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Sentadilla con barra"
                required
              />
            )}
          </FormField>
          <FormField label="Categoría" required>
            {(field) => (
              <Input
                {...field}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Ej: Tren inferior"
                required
              />
            )}
          </FormField>
          <FormField label="Músculo" required>
            {(field) => (
              <Input
                {...field}
                value={form.muscle}
                onChange={(e) => setForm((f) => ({ ...f, muscle: e.target.value }))}
                placeholder="Ej: Cuádriceps"
                required
              />
            )}
          </FormField>
        </form>
      </Modal>
    </div>
  );
}
