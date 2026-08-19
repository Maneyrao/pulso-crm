'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { CalendarCheck } from 'lucide-react';
import { Badge, Card, CardContent, DataTable, EmptyState, Input, type DataTableColumn } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import {
  ATTENDANCE_TODAY,
  getAttendanceKpis,
  type AccessMethod,
  type AttendanceRecord,
} from '@/lib/mock/data/members-demo';

/**
 * Asistencias de socios (demo, sin backend todavía). El dataset sólo modela
 * "hoy": si se elige otra fecha en el filtro, la tabla queda vacía por
 * filtro (no hay histórico simulado para otros días).
 */
export default function AttendancePage() {
  return (
    <PermissionGate
      permission="member:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <AttendanceScreen />
    </PermissionGate>
  );
}

const ACCESS_METHOD_TONE: Record<AccessMethod, 'neutral' | 'primary' | 'info'> = {
  Documento: 'neutral',
  Tarjeta: 'primary',
  Huella: 'info',
};

function AttendanceScreen() {
  const today = React.useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [date, setDate] = React.useState(today);
  const [search, setSearch] = React.useState('');

  const { data, isLoading } = useMockData(() => ({
    records: ATTENDANCE_TODAY,
    kpis: getAttendanceKpis(),
  }));

  const isFiltered = date !== today || search.trim().length > 0;

  const filtered = React.useMemo(() => {
    if (!data || date !== today) return [];
    const term = search.trim().toLowerCase();
    if (!term) return data.records;
    return data.records.filter(
      (record) => record.memberName.toLowerCase().includes(term) || record.memberDni.includes(term),
    );
  }, [data, date, today, search]);

  const columns: DataTableColumn<AttendanceRecord>[] = [
    {
      id: 'time',
      header: 'Hora',
      cell: (record) => <span className="tabular-nums">{record.time}</span>,
    },
    {
      id: 'member',
      header: 'Socio',
      cell: (record) => (
        <div className="flex flex-col">
          <span className="font-medium text-(--color-text)">{record.memberName}</span>
          <span className="text-(--text-xs) text-(--color-muted)">{record.memberDni}</span>
        </div>
      ),
    },
    { id: 'activity', header: 'Actividad', cell: (record) => record.activity },
    { id: 'branch', header: 'Sede', cell: (record) => record.branch },
    {
      id: 'accessMethod',
      header: 'Método de acceso',
      cell: (record) => <Badge tone={ACCESS_METHOD_TONE[record.accessMethod]}>{record.accessMethod}</Badge>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CalendarCheck}
        title="Asistencias"
        description="Registro de asistencias de socios por día."
        mock
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-(--text-sm) text-(--color-muted)">Asistencias hoy</span>
            <span className="text-(--text-2xl) font-semibold text-(--color-text)">
              {data ? data.kpis.attendanceToday : '—'}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-(--text-sm) text-(--color-muted)">Pico horario</span>
            <span className="text-(--text-2xl) font-semibold text-(--color-text)">
              {data ? data.kpis.peakHour : '—'}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-(--text-sm) text-(--color-muted)">Promedio diario (7 días)</span>
            <span className="text-(--text-2xl) font-semibold text-(--color-text)">
              {data ? data.kpis.avgDaily7d : '—'}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="attendance-date" className="text-(--text-sm) font-medium text-(--color-text)">
            Fecha
          </label>
          <Input
            id="attendance-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-44"
          />
        </div>
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="attendance-search" className="text-(--text-sm) font-medium text-(--color-text)">
            Buscar por nombre o DNI
          </label>
          <Input
            id="attendance-search"
            placeholder="Nombre o DNI del socio"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <DataTable
        caption="Asistencias del día"
        columns={columns}
        data={filtered}
        rowKey={(record) => record.id}
        loading={isLoading}
        isFiltered={isFiltered}
        onClearFilters={() => {
          setDate(today);
          setSearch('');
        }}
        emptyTitle="Todavía no hay asistencias registradas"
        emptyDescription="Cuando un socio marque ingreso va a aparecer en esta lista."
      />
    </div>
  );
}
