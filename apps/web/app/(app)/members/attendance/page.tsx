'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import type { AccessMethod, Attendance } from '@pulso/contracts/access';
import {
  Badge,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  Input,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { listAttendances } from '@/lib/api/access';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

const PAGE_SIZE = 100;

const ACCESS_METHOD_LABEL: Record<AccessMethod, string> = {
  DOCUMENT: 'Documento',
  CARD: 'Tarjeta',
  MEMBER_NUMBER: 'N° socio',
  FINGERPRINT: 'Huella',
  MANUAL: 'Manual',
};

const ACCESS_METHOD_TONE: Record<AccessMethod, 'neutral' | 'primary' | 'info'> = {
  DOCUMENT: 'neutral',
  CARD: 'primary',
  MEMBER_NUMBER: 'neutral',
  FINGERPRINT: 'info',
  MANUAL: 'neutral',
};

export default function AttendancePage() {
  return (
    <PermissionGate
      permission="attendance:read"
      fallback={
        <EmptyState
          title="Sin acceso"
          description="Tu usuario no tiene permiso para ver esta pantalla."
        />
      }
    >
      <AttendanceScreen />
    </PermissionGate>
  );
}

function AttendanceScreen() {
  const today = React.useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);

  const [date, setDate] = React.useState(today);
  const [search, setSearch] = React.useState('');

  const queryFilters = React.useMemo(
    () => ({
      branchId: branchId ?? undefined,
      from: date,
      to: date,
      page: 1,
      limit: PAGE_SIZE,
    }),
    [branchId, date],
  );

  const query = useQuery({
    queryKey: qk.attendances(gymId, branchId, queryFilters),
    queryFn: () => listAttendances(queryFilters),
    enabled: Boolean(gymId),
  });

  const rows = React.useMemo(() => query.data?.data ?? [], [query.data]);
  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((record) => {
      const memberName = `${record.member.firstName} ${record.member.lastName}`.toLowerCase();
      return (
        memberName.includes(term) ||
        record.member.documentMasked.toLowerCase().includes(term) ||
        record.branch.name.toLowerCase().includes(term) ||
        (record.membership?.planName.toLowerCase().includes(term) ?? false)
      );
    });
  }, [rows, search]);

  const peakHour = React.useMemo(() => computePeakHour(rows), [rows]);
  const methodSummary = React.useMemo(() => computeTopMethod(rows), [rows]);
  const isFiltered = date !== today || search.trim().length > 0;

  const columns: DataTableColumn<Attendance>[] = [
    {
      id: 'time',
      header: 'Hora',
      cell: (record) => (
        <span className="tabular-nums">
          {new Date(record.occurredAt).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      id: 'member',
      header: 'Socio',
      cell: (record) => (
        <div className="flex flex-col">
          <Link
            href={`/members/${record.memberId}`}
            className="font-medium text-(--color-text) hover:underline"
          >
            {record.member.lastName}, {record.member.firstName}
          </Link>
          <span className="text-(--text-xs) text-(--color-muted)">
            {record.member.documentMasked}
          </span>
        </div>
      ),
    },
    {
      id: 'membership',
      header: 'Membresía',
      cell: (record) => record.membership?.planName ?? 'Sin membresía asociada',
    },
    { id: 'branch', header: 'Sede', cell: (record) => record.branch.name },
    {
      id: 'accessMethod',
      header: 'Método de acceso',
      cell: (record) => (
        <Badge tone={ACCESS_METHOD_TONE[record.method]}>{ACCESS_METHOD_LABEL[record.method]}</Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CalendarCheck}
        title="Asistencias"
        description="Registro real de ingresos de socios por día y sede."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Registros del día" value={String(query.data?.pageInfo.total ?? 0)} />
        <Kpi label="Pico horario" value={peakHour} />
        <Kpi label="Método más usado" value={methodSummary} />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="attendance-date"
            className="text-(--text-sm) font-medium text-(--color-text)"
          >
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
          <label
            htmlFor="attendance-search"
            className="text-(--text-sm) font-medium text-(--color-text)"
          >
            Buscar por nombre, DNI, plan o sede
          </label>
          <Input
            id="attendance-search"
            placeholder="Nombre, DNI, plan o sede"
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
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-(--text-sm) text-(--color-muted)">{label}</span>
        <span className="text-(--text-2xl) font-semibold text-(--color-text)">{value}</span>
      </CardContent>
    </Card>
  );
}

function computePeakHour(rows: readonly Attendance[]): string {
  if (rows.length === 0) return '—';
  const hourCounts = new Map<number, number>();
  for (const row of rows) {
    const hour = new Date(row.occurredAt).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  let bestHour = 0;
  let bestCount = -1;
  for (const [hour, count] of hourCounts) {
    if (count > bestCount) {
      bestHour = hour;
      bestCount = count;
    }
  }
  const nextHour = (bestHour + 1) % 24;
  return `${String(bestHour).padStart(2, '0')}:00-${String(nextHour).padStart(2, '0')}:00`;
}

function computeTopMethod(rows: readonly Attendance[]): string {
  if (rows.length === 0) return '—';
  const counts = new Map<AccessMethod, number>();
  for (const row of rows) counts.set(row.method, (counts.get(row.method) ?? 0) + 1);
  let bestMethod: AccessMethod = rows[0]!.method;
  let bestCount = -1;
  for (const [method, count] of counts) {
    if (count > bestCount) {
      bestMethod = method;
      bestCount = count;
    }
  }
  return `${ACCESS_METHOD_LABEL[bestMethod]} (${bestCount})`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
