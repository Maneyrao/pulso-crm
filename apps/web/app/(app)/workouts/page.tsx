'use client';

import * as React from 'react';
import { Dumbbell, ExternalLink } from 'lucide-react';
import { Button, DataTable, EmptyState, Input, StatusBadge, type DataTableColumn } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { getWorkoutMembersSorted, type WorkoutMember } from '@/lib/mock/data/members-demo';

/** Entrenamientos de socios (demo, sin backend todavía). Ordenado por puntaje descendente. */
export default function WorkoutsPage() {
  return (
    <PermissionGate
      permission="routine:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <WorkoutsScreen />
    </PermissionGate>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

function WorkoutsScreen() {
  const [search, setSearch] = React.useState('');
  const { data, isLoading } = useMockData(() => getWorkoutMembersSorted());

  const isFiltered = search.trim().length > 0;
  const filtered = React.useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data;
    return data.filter((member) => member.name.toLowerCase().includes(term) || member.dni.includes(term));
  }, [data, search]);

  const columns: DataTableColumn<WorkoutMember>[] = [
    {
      id: 'member',
      header: 'Socio',
      cell: (member) => (
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--color-primary-subtle) text-(--text-sm) font-semibold text-(--color-primary-subtle-foreground)"
          >
            {getInitials(member.name)}
          </span>
          <div className="flex flex-col">
            <span className="font-medium text-(--color-text)">{member.name}</span>
            <span className="text-(--text-xs) text-(--color-muted)">{member.dni}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'score',
      header: 'Puntaje promedio',
      cell: (member) => (
        <div className="flex flex-col">
          <span className="text-(--text-lg) font-semibold text-(--color-warning)">{member.avgScore}</span>
          <span className="text-(--text-xs) text-(--color-muted)">Puntaje promedio</span>
        </div>
      ),
    },
    {
      id: 'routineStatus',
      header: 'Estado rutina',
      cell: (member) =>
        member.hasRoutine ? (
          <StatusBadge tone="success" label="Con rutina" />
        ) : (
          <StatusBadge tone="neutral" label="Sin rutina" />
        ),
    },
    {
      id: 'instructor',
      header: 'Instructor',
      cell: (member) => <span className="text-(--color-text)">{member.instructor ?? '—'}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: (member) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            title="Ver progreso"
            aria-label={`Ver progreso de ${member.name}`}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
        icon={Dumbbell}
        title="Entrenamientos"
        description="Registrá y seguí el progreso de entrenamiento de tus socios."
        mock
      />

      <div className="max-w-sm">
        <label htmlFor="workouts-search" className="sr-only">
          Buscar por nombre o DNI
        </label>
        <Input
          id="workouts-search"
          placeholder="Buscar por nombre o DNI"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <DataTable
        caption="Entrenamientos de socios"
        columns={columns}
        data={filtered}
        rowKey={(member) => member.id}
        loading={isLoading}
        isFiltered={isFiltered}
        onClearFilters={() => setSearch('')}
        emptyTitle="Todavía no hay socios con seguimiento de entrenamiento"
        emptyDescription="Cuando cargues rutinas y puntajes van a aparecer acá."
      />
    </div>
  );
}
