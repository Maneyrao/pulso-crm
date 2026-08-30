'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, MoneyDisplay } from '@pulso/ui';
import { listAttendances } from '@/lib/api/access';
import { getDashboard } from '@/lib/api/reporting';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { HourlyAttendanceChart } from '@/components/shared/HourlyAttendanceChart';
import { PageHeader } from '@/components/shared/PageHeader';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

const TODAY_ATTENDANCE_LIMIT = 100;

/**
 * Estadísticas — sólo datos reales (LEODARROSAFIT_ALIGNMENT_PLAN.md Fase 2A).
 *
 * Antes usaba `lib/mock/data/insights-demo.ts` (dataset determinista de 12
 * meses). Ese dataset no viene de ningún endpoint, así que se eliminó por
 * completo de esta pantalla: hoy sólo hay `GET /reports/dashboard` (los
 * mismos 4 indicadores del inicio) y afluencia por hora de HOY calculada de
 * `GET /attendances` (mismo componente que /dashboard).
 *
 * El rango "Semana" del brief se dejó afuera a propósito: con el límite de
 * paginación real (100 registros, `MAX_PAGE_LIMIT`) un gimnasio con tráfico
 * moderado ya pierde asistencias antes de completar la semana, y un gráfico
 * armado con datos truncados deja de ser un dato real. No hay endpoint de
 * agregación semanal todavía, así que se sigue el permiso explícito de la
 * misión ("si el volumen lo hace tosco, dejá sólo Hoy").
 */
export default function StatsPage() {
  return (
    <PermissionGate
      permission="stats:read"
      fallback={
        <EmptyState
          title="Sin acceso"
          description="Tu usuario no tiene permiso para ver esta pantalla."
        />
      }
    >
      <StatsScreen />
    </PermissionGate>
  );
}

function StatsScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const canReadAttendance = usePermission('attendance:read');

  const today = React.useMemo(() => toIsoDate(new Date()), []);

  const dashboard = useQuery({
    queryKey: qk.dashboard(gymId, branchId),
    queryFn: getDashboard,
  });

  const todayAttendances = useQuery({
    queryKey: qk.attendances(gymId, branchId, {
      from: today,
      to: today,
      page: 1,
      limit: TODAY_ATTENDANCE_LIMIT,
    }),
    queryFn: () =>
      listAttendances({
        branchId: branchId ?? undefined,
        from: today,
        to: today,
        page: 1,
        limit: TODAY_ATTENDANCE_LIMIT,
      }),
    enabled: canReadAttendance,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estadísticas"
        description="Indicadores reales de hoy: ingresos, asistencias, deuda y vencimientos."
        icon={BarChart3}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {dashboard.isLoading ? (
          <>
            <KpiCard title="Ingresos hoy" loading />
            <KpiCard title="Asistencias hoy" loading />
            <KpiCard title="Deuda total" loading />
            <KpiCard title="Membresías por vencer (7 días)" loading />
          </>
        ) : dashboard.isError ? (
          <>
            <KpiCard title="Ingresos hoy" error="No pudimos cargar este dato." />
            <KpiCard title="Asistencias hoy" error="No pudimos cargar este dato." />
            <KpiCard title="Deuda total" error="No pudimos cargar este dato." />
            <KpiCard title="Membresías por vencer (7 días)" error="No pudimos cargar este dato." />
          </>
        ) : dashboard.data ? (
          <>
            <KpiCard
              title="Ingresos hoy"
              value={<MoneyDisplay value={dashboard.data.todayIncome} />}
            />
            <KpiCard title="Asistencias hoy" value={dashboard.data.todayAttendances} />
            <KpiCard
              title="Deuda total"
              value={<MoneyDisplay value={dashboard.data.totalDebt} emphasizeNegative />}
            />
            <KpiCard
              title="Membresías por vencer (7 días)"
              value={dashboard.data.expiringMembershipsNext7Days}
            />
          </>
        ) : null}
      </div>

      {canReadAttendance ? (
        <Card>
          <CardHeader>
            <CardTitle>Afluencia por hora · hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <HourlyAttendanceChart
              attendances={todayAttendances.data?.data ?? []}
              loading={todayAttendances.isLoading}
            />
            {todayAttendances.isError ? (
              <p role="alert" className="mt-2 text-(--text-sm) text-(--color-danger)">
                No pudimos cargar las asistencias de hoy.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
