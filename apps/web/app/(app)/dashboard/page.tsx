'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  MoneyDisplay,
  Skeleton,
} from '@pulso/ui';
import { subMoney, sumMoney } from '@pulso/config/money';
import { listAccessAttempts, listAttendances } from '@/lib/api/access';
import { getCurrentCashSession, getDaybook, listCashConcepts } from '@/lib/api/cash';
import { listDebtors } from '@/lib/api/members';
import { getDashboard } from '@/lib/api/reporting';
import { usePermission } from '@/lib/auth/permissions';
import { ACCESS_REASON_CONFIG } from '@/components/access/reason-config';
import { HourlyAttendanceChart } from '@/components/shared/HourlyAttendanceChart';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

const TODAY_ATTENDANCE_LIMIT = 100;

export default function DashboardPage() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const branchName = useSessionStore(
    (s) => s.branches.find((b) => b.id === s.activeBranchId)?.name,
  );

  const canReadStats = usePermission('stats:read');
  const canReadMembers = usePermission('member:read');
  const canWriteMembers = usePermission('member:write');
  const canReadAttendance = usePermission('attendance:read');
  const canReadAccessHistory = usePermission('access:read_history');
  const canReadCash = usePermission('cash:read');

  const today = React.useMemo(() => toIsoDate(new Date()), []);

  const dashboard = useQuery({
    queryKey: qk.dashboard(gymId, branchId),
    queryFn: getDashboard,
    enabled: canReadStats,
  });

  const cashSession = useQuery({
    queryKey: qk.cashSession(gymId, branchId),
    queryFn: getCurrentCashSession,
    enabled: canReadCash,
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

  const accessAttempts = useQuery({
    queryKey: qk.accessAttempts(gymId, branchId, { limit: 5 }),
    queryFn: () => listAccessAttempts(branchId, 5),
    enabled: canReadAccessHistory,
  });

  const debtors = useQuery({
    queryKey: qk.debtors(gymId, branchId, { limit: 4, sort: 'balance', order: 'asc' }),
    // Saldos deudores son negativos: balance:asc = más negativo primero =
    // "mayor deuda primero" (misma semántica que /members/debt).
    queryFn: () =>
      listDebtors({ limit: 4, sort: 'balance', order: 'asc', branchId: branchId ?? undefined }),
    enabled: canReadMembers,
  });

  const daybook = useQuery({
    queryKey: qk.daybook(gymId, branchId, today, today),
    queryFn: () => getDaybook({ from: today, to: today, ...(branchId ? { branchId } : {}) }),
    enabled: canReadCash,
  });

  const cashConcepts = useQuery({
    queryKey: qk.cashConcepts(gymId),
    queryFn: listCashConcepts,
    enabled: canReadCash,
  });

  const cajaSuffix =
    canReadCash && cashSession.isSuccess
      ? cashSession.data
        ? ` · caja abierta desde ${formatTime(cashSession.data.openedAt)}`
        : ' · caja cerrada'
      : '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        description={branchName ? `${branchName}${cajaSuffix}` : undefined}
        className="mb-0"
      />

      {canReadStats ? (
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
              <KpiCard
                title="Membresías por vencer (7 días)"
                error="No pudimos cargar este dato."
              />
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
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
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

        {canReadAccessHistory ? (
          <Card>
            <CardHeader>
              <CardTitle>Últimos accesos</CardTitle>
            </CardHeader>
            <CardContent>
              {accessAttempts.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : accessAttempts.isError ? (
                <p role="alert" className="text-(--text-sm) text-(--color-danger)">
                  No pudimos cargar los últimos accesos.
                </p>
              ) : accessAttempts.data && accessAttempts.data.data.length > 0 ? (
                <ul>
                  {accessAttempts.data.data.map((attempt) => {
                    const config = ACCESS_REASON_CONFIG[attempt.reasonCode];
                    const allowed = attempt.decision === 'ALLOWED';
                    return (
                      <li
                        key={attempt.id}
                        className="flex items-center gap-3 border-b border-(--color-border) py-2.5 last:border-0"
                      >
                        <span
                          aria-hidden={true}
                          className={`h-2.5 w-2.5 shrink-0 rounded-(--radius-full) ${
                            allowed ? 'bg-(--color-access-allowed)' : 'bg-(--color-access-denied)'
                          }`}
                        />
                        <span className="sr-only">{allowed ? 'Permitido' : 'Denegado'}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold text-(--color-text)">
                            {attempt.rawInputMasked ?? config.title}
                          </p>
                          <p className="truncate text-(--text-xs) text-(--color-muted)">
                            {config.title}
                          </p>
                        </div>
                        <span className="shrink-0 text-(--text-xs) tabular-nums text-(--color-muted)">
                          {formatTime(attempt.occurredAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-4 text-center text-(--text-sm) text-(--color-muted)">
                  Todavía no hay accesos.
                </p>
              )}
              <div className="mt-3">
                <Link
                  href="/access"
                  className="text-(--text-sm) font-medium text-(--color-primary) hover:underline"
                >
                  Ver acceso →
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {canReadMembers ? (
          <Card>
            <CardHeader>
              <CardTitle>Deudores</CardTitle>
            </CardHeader>
            <CardContent>
              {debtors.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : debtors.isError ? (
                <p role="alert" className="text-(--text-sm) text-(--color-danger)">
                  No pudimos cargar este dato.
                </p>
              ) : debtors.data && debtors.data.data.length > 0 ? (
                <ul className="divide-y divide-(--color-border)">
                  {debtors.data.data.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/members/${d.id}?tab=cuenta`}
                        className="flex items-center justify-between gap-3 py-2 transition-colors hover:bg-(--color-muted-subtle)"
                      >
                        <span className="min-w-0 truncate text-(--text-sm) text-(--color-text)">
                          {d.lastName}, {d.firstName}
                        </span>
                        <MoneyDisplay value={d.balance} emphasizeNegative />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-(--text-sm) text-(--color-muted)">
                  Nadie debe nada. Excelente cobranza.
                </p>
              )}
              <div className="mt-3">
                <Link
                  href="/members/debt"
                  className="text-(--text-sm) font-medium text-(--color-primary) hover:underline"
                >
                  Deudores →
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {canReadCash ? (
          <Card>
            <CardHeader>
              <CardTitle>Caja hoy</CardTitle>
            </CardHeader>
            <CardContent>
              <CajaHoySummary
                loading={daybook.isLoading || cashConcepts.isLoading}
                error={daybook.isError}
                movements={
                  daybook.data?.data.find((d) => d.businessDate === today)?.movements ?? []
                }
                concepts={cashConcepts.data?.data ?? []}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {canWriteMembers ? (
                  <Button asChild size="sm">
                    <Link href="/members/new">+ Nuevo socio</Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" size="sm">
                  <Link href="/cash">Registrar movimiento</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {!canReadMembers &&
      !canReadStats &&
      !canReadAttendance &&
      !canReadAccessHistory &&
      !canReadCash ? (
        <EmptyState
          title="Sin indicadores para mostrar"
          description="Tu usuario no tiene permisos para ver indicadores en esta pantalla."
        />
      ) : null}
    </div>
  );
}

interface CajaMovementLike {
  cashConceptId: string;
  type: 'INCOME' | 'EXPENSE';
  amount: string;
}

interface CajaHoySummaryProps {
  loading: boolean;
  error: boolean;
  movements: readonly CajaMovementLike[];
  concepts: readonly { id: string; name: string }[];
}

/** Resumen de caja de hoy: movimientos agrupados por concepto, netos de INCOME/EXPENSE. */
function CajaHoySummary({ loading, error, movements, concepts }: CajaHoySummaryProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-(--text-sm) text-(--color-danger)">
        No pudimos cargar la caja de hoy.
      </p>
    );
  }

  if (movements.length === 0) {
    return (
      <p className="py-2 text-(--text-sm) text-(--color-muted)">Todavía no hay movimientos hoy.</p>
    );
  }

  const conceptById = new Map(concepts.map((c) => [c.id, c.name]));
  const byConcept = new Map<string, { income: string[]; expense: string[] }>();
  for (const m of movements) {
    const bucket = byConcept.get(m.cashConceptId) ?? { income: [], expense: [] };
    if (m.type === 'INCOME') bucket.income.push(m.amount);
    else bucket.expense.push(m.amount);
    byConcept.set(m.cashConceptId, bucket);
  }

  return (
    <table className="w-full border-collapse text-(--text-sm)">
      <thead>
        <tr className="border-b border-(--color-border)">
          <th
            scope="col"
            className="px-0 py-1.5 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-(--color-muted)"
          >
            Concepto
          </th>
          <th
            scope="col"
            className="px-0 py-1.5 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-(--color-muted)"
          >
            Monto
          </th>
        </tr>
      </thead>
      <tbody>
        {Array.from(byConcept.entries()).map(([conceptId, bucket]) => {
          const net = subMoney(sumMoney(bucket.income), sumMoney(bucket.expense));
          return (
            <tr key={conceptId} className="border-b border-(--color-border) last:border-0">
              <td className="px-0 py-1.5 text-(--color-text)">
                {conceptById.get(conceptId) ?? conceptId.slice(0, 8)}
              </td>
              <td className="px-0 py-1.5 text-right">
                <MoneyDisplay value={net} emphasizeNegative />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
