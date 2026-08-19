'use client';

import * as React from 'react';
import { BarChart3, Percent, TrendingUp, Users, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@pulso/ui';
import { formatMoney } from '@pulso/config/money';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import {
  getInsightsDemoDataset,
  type ActiveMembersPoint,
  type FinancePoint,
  type PlanDistributionItem,
  type WeekdayAttendancePoint,
} from '@/lib/mock/data/insights-demo';

/** Franjas de color fijas (tokens) para distinguir cada plan en la lista de distribución. */
const PLAN_COLOR_CLASSES = [
  'bg-(--color-primary)',
  'bg-(--color-info)',
  'bg-(--color-success)',
  'bg-(--color-warning)',
  'bg-(--color-danger)',
];

export default function StatsPage() {
  return (
    <PermissionGate
      permission="stats:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <StatsScreen />
    </PermissionGate>
  );
}

function StatsScreen() {
  const { data, isLoading } = useMockData(() => getInsightsDemoDataset());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estadísticas"
        description="Evolución del gimnasio en los últimos 12 meses."
        icon={BarChart3}
        mock
      />

      {isLoading || !data ? (
        <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
          <p className="text-(--text-sm) text-(--color-muted)">Cargando estadísticas…</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Users}
              label="Socios activos"
              value={data.kpis.activeMembers.toLocaleString('es-AR')}
            />
            <KpiCard
              icon={TrendingUp}
              label="Crecimiento 12m"
              value={`${data.kpis.growth12mPercent > 0 ? '+' : ''}${data.kpis.growth12mPercent}%`}
            />
            <KpiCard
              icon={Percent}
              label="Retención promedio"
              value={`${data.kpis.averageRetentionPercent}%`}
            />
            <KpiCard
              icon={Wallet}
              label="Ingreso mensual promedio"
              value={formatMoney(data.kpis.averageMonthlyIncome)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Socios activos por mes</CardTitle>
            </CardHeader>
            <CardContent>
              <ActiveMembersChart data={data.activeMembersByMonth} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ingresos vs. egresos por mes</CardTitle>
            </CardHeader>
            <CardContent>
              <FinanceChart data={data.financeByMonth} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Asistencias por día de la semana</CardTitle>
              </CardHeader>
              <CardContent>
                <AttendanceChart data={data.attendanceByWeekday} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribución de socios por plan</CardTitle>
              </CardHeader>
              <CardContent>
                <PlanDistributionChart data={data.planDistribution} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)">
          <Icon className="h-5 w-5" aria-hidden={true} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-(--text-sm) text-(--color-muted)">{label}</p>
          <p className="text-(--text-xl) font-semibold text-(--color-text)">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveMembersChart({ data }: { data: readonly ActiveMembersPoint[] }) {
  const max = Math.max(...data.map((d) => d.activeMembers));
  const first = data[0]!;
  const last = data[data.length - 1]!;

  return (
    <figure>
      <div className="flex h-48 items-end gap-2">
        {data.map((point) => (
          <div key={point.key} className="h-full flex-1">
            <div className="flex h-full items-end">
              <div
                className="w-full rounded-t-(--radius-sm) bg-(--color-primary)"
                style={{ height: `${(point.activeMembers / max) * 100}%` }}
                title={`${point.label}: ${point.activeMembers} socios activos`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        {data.map((point) => (
          <span key={point.key} className="flex-1 text-center text-(--text-xs) text-(--color-muted)">
            {point.label}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        Evolución de socios activos por mes: de {first.activeMembers} en {first.label} a {last.activeMembers} en{' '}
        {last.label}.
      </figcaption>
    </figure>
  );
}

function FinanceChart({ data }: { data: readonly FinancePoint[] }) {
  const max = Math.max(...data.map((d) => Math.max(Number(d.income), Number(d.expenses))));
  const first = data[0]!;
  const last = data[data.length - 1]!;

  return (
    <figure>
      <div className="mb-3 flex items-center gap-4 text-(--text-xs) text-(--color-muted)">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-(--radius-sm) bg-(--color-success)" aria-hidden={true} />
          Ingresos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-(--radius-sm) bg-(--color-danger)" aria-hidden={true} />
          Egresos
        </span>
      </div>
      <div className="flex h-48 items-end gap-3">
        {data.map((point) => (
          <div key={point.key} className="h-full flex-1">
            <div className="flex h-full items-end justify-center gap-1">
              <div
                className="w-1/2 rounded-t-(--radius-sm) bg-(--color-success)"
                style={{ height: `${(Number(point.income) / max) * 100}%` }}
                title={`Ingresos ${point.label}: ${formatMoney(point.income)}`}
              />
              <div
                className="w-1/2 rounded-t-(--radius-sm) bg-(--color-danger)"
                style={{ height: `${(Number(point.expenses) / max) * 100}%` }}
                title={`Egresos ${point.label}: ${formatMoney(point.expenses)}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-3">
        {data.map((point) => (
          <span key={point.key} className="flex-1 text-center text-(--text-xs) text-(--color-muted)">
            {point.label}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        Ingresos y egresos mensuales: en {first.label} el ingreso fue {formatMoney(first.income)} y el egreso{' '}
        {formatMoney(first.expenses)}; en {last.label} el ingreso fue {formatMoney(last.income)} y el egreso{' '}
        {formatMoney(last.expenses)}.
      </figcaption>
    </figure>
  );
}

function AttendanceChart({ data }: { data: readonly WeekdayAttendancePoint[] }) {
  const max = Math.max(...data.map((d) => d.count));
  const busiest = data.reduce((acc, d) => (d.count > acc.count ? d : acc));

  return (
    <figure>
      <ul className="flex flex-col gap-2.5">
        {data.map((point) => (
          <li key={point.key} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-(--text-xs) text-(--color-muted)">{point.label}</span>
            <div className="h-3 flex-1 rounded-(--radius-full) bg-(--color-muted-subtle)">
              <div
                className="h-3 rounded-(--radius-full) bg-(--color-primary)"
                style={{ width: `${(point.count / max) * 100}%` }}
                title={`${point.label}: ${point.count} asistencias`}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-(--text-xs) tabular-nums text-(--color-muted)">
              {point.count}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">
        Asistencias por día de la semana. El día con más asistencias es {busiest.label}, con {busiest.count} check-ins.
      </figcaption>
    </figure>
  );
}

function PlanDistributionChart({ data }: { data: readonly PlanDistributionItem[] }) {
  return (
    <figure>
      <ul className="flex flex-col gap-3">
        {data.map((plan, index) => (
          <li key={plan.planName} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-(--text-sm)">
              <span className="font-medium text-(--color-text)">{plan.planName}</span>
              <span className="text-(--color-muted)">
                {plan.percentage}% · {plan.members} socios
              </span>
            </div>
            <div className="h-2 rounded-(--radius-full) bg-(--color-muted-subtle)">
              <div
                className={`h-2 rounded-(--radius-full) ${PLAN_COLOR_CLASSES[index % PLAN_COLOR_CLASSES.length]}`}
                style={{ width: `${plan.percentage}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="sr-only">
        Distribución de socios por plan:{' '}
        {data.map((plan) => `${plan.planName} ${plan.percentage}% (${plan.members} socios)`).join(', ')}.
      </figcaption>
    </figure>
  );
}
