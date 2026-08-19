'use client';

import * as React from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent, DataTable, EmptyState, Input, Select, type DataTableColumn } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { DEMO_INSTRUCTOR_ATTENDANCE, DEMO_INSTRUCTORS, type DemoInstructorAttendance } from '@/lib/mock/data/training-demo';

const INSTRUCTOR_OPTIONS = [
  { value: 'all', label: 'Todos los instructores' },
  ...DEMO_INSTRUCTORS.map((instructor) => ({
    value: instructor.id,
    label: `${instructor.firstName} ${instructor.lastName}`,
  })),
];

/**
 * Instructores › Asistencias. Módulo DEMO (`instructor:attendance`): fichadas
 * de entrada/salida sin backend todavía, dataset determinista de
 * `lib/mock/data/training-demo.ts`.
 */
export default function InstructorAttendancePage() {
  return (
    <PermissionGate
      permission="instructor:attendance"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <InstructorAttendanceScreen />
    </PermissionGate>
  );
}

function InstructorAttendanceScreen() {
  const { data, isLoading } = useMockData(() => DEMO_INSTRUCTOR_ATTENDANCE);

  const [instructorId, setInstructorId] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const isFiltered = instructorId !== 'all' || dateFrom !== '' || dateTo !== '';

  const filtered = React.useMemo(() => {
    const items = data ?? [];
    return items.filter((record) => {
      const matchesInstructor = instructorId === 'all' || record.instructorId === instructorId;
      const matchesFrom = dateFrom === '' || record.date >= dateFrom;
      const matchesTo = dateTo === '' || record.date <= dateTo;
      return matchesInstructor && matchesFrom && matchesTo;
    });
  }, [data, instructorId, dateFrom, dateTo]);

  const totalHours = React.useMemo(
    () => filtered.reduce((sum, record) => sum + record.hours, 0),
    [filtered],
  );

  const clearFilters = () => {
    setInstructorId('all');
    setDateFrom('');
    setDateTo('');
  };

  const columns: DataTableColumn<DemoInstructorAttendance>[] = [
    { id: 'date', header: 'Fecha', cell: (r) => <span className="tabular-nums">{r.date}</span> },
    { id: 'instructor', header: 'Instructor', cell: (r) => r.instructorName },
    { id: 'checkIn', header: 'Entrada', cell: (r) => <span className="tabular-nums">{r.checkIn}</span> },
    { id: 'checkOut', header: 'Salida', cell: (r) => <span className="tabular-nums">{r.checkOut}</span> },
    {
      id: 'hours',
      header: 'Horas',
      cell: (r) => <span className="tabular-nums">{r.hours.toFixed(2)}</span>,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Asistencias de instructores"
        description="Registro de entrada y salida del equipo de instructores."
        icon={CalendarClock}
        mock
      />

      <Card>
        <CardContent className="flex flex-col gap-1">
          <span className="text-(--text-sm) text-(--color-muted)">Total de horas del período filtrado</span>
          <span className="text-(--text-2xl) font-semibold text-(--color-text)">
            {totalHours.toFixed(2)} hs
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-64 flex-col gap-1.5">
          <label htmlFor="attendance-instructor" className="text-(--text-sm) font-medium text-(--color-text)">
            Instructor
          </label>
          <Select
            id="attendance-instructor"
            options={INSTRUCTOR_OPTIONS}
            value={instructorId}
            onValueChange={setInstructorId}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-from" className="text-(--text-sm) font-medium text-(--color-text)">
            Desde
          </label>
          <Input
            id="attendance-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-to" className="text-(--text-sm) font-medium text-(--color-text)">
            Hasta
          </label>
          <Input id="attendance-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      <DataTable
        caption="Asistencias de instructores"
        columns={columns}
        data={filtered}
        rowKey={(r) => r.id}
        loading={isLoading}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyTitle="Todavía no hay asistencias"
        emptyDescription="Las fichadas de entrada y salida van a aparecer acá."
      />
    </div>
  );
}
