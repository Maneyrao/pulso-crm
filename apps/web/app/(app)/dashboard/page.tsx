'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, DoorOpen, LayoutDashboard, Package, RefreshCw, UserPlus, Wallet } from 'lucide-react';
import { Button, EmptyState, MoneyDisplay, Skeleton } from '@pulso/ui';
import { subMoney, sumMoney } from '@pulso/config/money';
import { DEFAULT_TIMEZONE, toBusinessDate } from '@pulso/config/time';
import { listAccessAttempts, listAttendances } from '@/lib/api/access';
import { getCurrentCashSession, getDaybook, listPaymentMethods } from '@/lib/api/cash';
import { listDebtors } from '@/lib/api/members';
import { getDashboard } from '@/lib/api/reporting';
import { usePermission } from '@/lib/auth/permissions';
import { ACCESS_REASON_CONFIG } from '@/components/access/reason-config';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';
import { paymentMethodLabel } from '../cash/payment-options';

const REFRESH_MS = 60_000;

export default function DashboardPage() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const branch = useSessionStore((s) => s.branches.find((b) => b.id === s.activeBranchId));
  const timezone = branch?.timezone ?? DEFAULT_TIMEZONE;
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const tick = () => { if (document.visibilityState !== 'hidden') setNow(new Date()); };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const today = toBusinessDate(now, timezone);

  const canReadStats = usePermission('stats:read');
  const canReadMembers = usePermission('member:read');
  const canCollect = usePermission('payment:collect');
  const canWriteMembers = usePermission('member:write');
  const canReadAttendance = usePermission('attendance:read');
  const canReadAccessHistory = usePermission('access:read_history');
  const canOperateAccess = usePermission('access:operate');
  const canReadCash = usePermission('cash:read');
  const canReadProducts = usePermission('product:read');
  const refreshOptions = { refetchInterval: REFRESH_MS, refetchIntervalInBackground: false };

  const dashboard = useQuery({ queryKey: qk.dashboard(gymId, branchId), queryFn: getDashboard, enabled: canReadStats, ...refreshOptions });
  const cashSession = useQuery({ queryKey: qk.cashSession(gymId, branchId), queryFn: getCurrentCashSession, enabled: canReadCash, ...refreshOptions });
  const attendanceFilters = { from: today, to: today, page: 1, limit: 1 };
  const attendances = useQuery({
    queryKey: qk.attendances(gymId, branchId, attendanceFilters),
    queryFn: () => listAttendances({ ...attendanceFilters, branchId: branchId ?? undefined }),
    enabled: canReadAttendance, ...refreshOptions,
  });
  const attempts = useQuery({
    queryKey: qk.accessAttempts(gymId, branchId, { from: today, to: today, limit: 5 }),
    queryFn: () => listAccessAttempts(branchId, 5, { from: today, to: today }),
    enabled: canReadAccessHistory, ...refreshOptions,
  });
  const debtors = useQuery({
    queryKey: qk.debtors(gymId, branchId, { limit: 4, sort: 'balance', order: 'asc' }),
    queryFn: () => listDebtors({ limit: 4, sort: 'balance', order: 'asc', branchId: branchId ?? undefined }),
    enabled: canReadMembers, ...refreshOptions,
  });
  const daybook = useQuery({
    queryKey: qk.daybook(gymId, branchId, today, today),
    queryFn: () => getDaybook({ from: today, to: today, ...(branchId ? { branchId } : {}) }),
    enabled: canReadCash, ...refreshOptions,
  });
  const methods = useQuery({ queryKey: qk.paymentMethods(gymId), queryFn: listPaymentMethods, enabled: canReadCash });
  const queries = [dashboard, cashSession, attendances, attempts, debtors, daybook, methods];
  const enabled = [canReadStats, canReadCash, canReadAttendance, canReadAccessHistory, canReadMembers, canReadCash, canReadCash];
  const refresh = () => { setNow(new Date()); queries.forEach((query, index) => { if (enabled[index]) void query.refetch(); }); };
  const suffix = canReadCash && cashSession.isSuccess ? cashSession.data ? ` · caja abierta desde ${formatTime(cashSession.data.openedAt, timezone)}` : ' · caja cerrada' : '';
  const totals = daybook.data?.data.find((day) => day.businessDate === today)?.totalsByMethod ?? [];
  const methodNames = new Map(methods.data?.data.map((method) => [method.id, paymentMethodLabel(method)]));
  const attendanceQuery = canReadAttendance ? attendances : dashboard;
  const attendanceCount = canReadAttendance ? attendances.data?.pageInfo.total : dashboard.data?.todayAttendances;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={LayoutDashboard} title="Dashboard" description={branch ? `${branch.name}${suffix}` : undefined}
        actions={<Button variant="outline" aria-label="Actualizar dashboard" title="Actualizar dashboard" onClick={refresh} disabled={!enabled.some(Boolean) || queries.some((q) => q.isFetching)}><RefreshCw className="h-4 w-4" aria-hidden /></Button>} />
      <nav aria-label="Acciones del día" className="flex flex-wrap gap-2">
        {canOperateAccess && <Button asChild><Link href="/access"><DoorOpen className="h-4 w-4" aria-hidden />Registrar ingreso</Link></Button>}
        {canReadMembers && <Button asChild variant="outline"><Link href="/members">{canCollect ? 'Buscar socio / cobrar' : 'Buscar socio'}</Link></Button>}
        {canWriteMembers && <Button asChild variant="outline"><Link href="/members/new"><UserPlus className="h-4 w-4" aria-hidden />Nuevo socio</Link></Button>}
        {canReadCash && <Button asChild variant="outline"><Link href="/cash"><Wallet className="h-4 w-4" aria-hidden />Ir a caja</Link></Button>}
        {canReadProducts && <Button asChild variant="outline"><Link href="/inventory"><Package className="h-4 w-4" aria-hidden />Inventario</Link></Button>}
      </nav>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(canReadAttendance || canReadStats) && <KpiCard title="Asistencias hoy" loading={attendanceQuery.isLoading} error={attendanceQuery.isError ? 'No pudimos cargar este dato.' : undefined} value={attendanceCount} />}
        {canReadMembers && <KpiCard title="Socios con saldo pendiente" loading={debtors.isLoading} error={debtors.isError ? 'No pudimos cargar este dato.' : undefined} value={debtors.data?.pageInfo.total} />}
        {canReadStats && <KpiCard title="Membresías por vencer (7 días)" loading={dashboard.isLoading} error={dashboard.isError ? 'No pudimos cargar este dato.' : undefined} value={dashboard.data?.expiringMembershipsNext7Days} />}
        {canReadCash && <KpiCard title="Ingresos registrados hoy" loading={daybook.isLoading} error={daybook.isError ? 'No pudimos cargar este dato.' : undefined} value={daybook.isSuccess ? <MoneyDisplay value={sumMoney(totals.map((total) => total.income))} /> : undefined} />}
      </div>

      {canReadCash && <Section title="Caja por medio · hoy">
        {daybook.isLoading || methods.isLoading ? <Skeleton className="h-28 w-full" /> : daybook.isError || methods.isError ? <LoadError onRetry={() => { void daybook.refetch(); void methods.refetch(); }} /> : totals.length === 0 ? <p>Todavía no hay movimientos hoy.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left text-xs text-(--color-muted)">Día de apertura {today}. Importes con correcciones incluidas.</caption>
              <thead><tr><th scope="col" className="py-2">Medio</th><th scope="col" className="p-2 text-right">Ingresos</th><th scope="col" className="p-2 text-right">Salidas</th><th scope="col" className="p-2 text-right">Neto</th></tr></thead>
              <tbody>{totals.map((total) => <tr key={total.paymentMethodId} className="border-t border-(--color-border)">
                <th scope="row" className="py-3 font-medium">{methodNames.get(total.paymentMethodId) ?? 'Medio no disponible'}</th>
                <td className="p-2 text-right"><MoneyDisplay value={total.income} /></td>
                <td className="p-2 text-right"><MoneyDisplay value={total.expense} /></td>
                <td className="p-2 text-right"><MoneyDisplay value={subMoney(total.income, total.expense)} emphasizeNegative /></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
        <Link className="inline-flex items-center gap-1 py-2 text-sm text-(--color-primary) hover:underline" href="/cash/daybook">Libro diario<ArrowRight className="h-4 w-4" aria-hidden /></Link>
        {cashSession.isError && <p role="alert" className="text-sm text-(--color-danger)">No se pudo verificar si la caja está abierta.</p>}
      </Section>}

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        {canReadAccessHistory && <Section title="Últimos accesos de hoy">
          {attempts.isLoading ? <Skeleton className="h-32 w-full" /> : attempts.isError ? <LoadError onRetry={() => void attempts.refetch()} /> : attempts.data?.data.length ? <ul className="divide-y divide-(--color-border)">
            {attempts.data.data.map((attempt) => <li key={attempt.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0"><p className="break-words font-semibold">{attempt.rawInputMasked ?? 'Acceso registrado'}</p><p className="text-(--color-muted)">{attempt.decision === 'ALLOWED' ? 'Permitido' : 'Denegado'} · {ACCESS_REASON_CONFIG[attempt.reasonCode].title}</p></div>
              <time className="shrink-0 tabular-nums" dateTime={attempt.occurredAt}>{formatTime(attempt.occurredAt, timezone)}</time>
            </li>)}
          </ul> : <p>Todavía no hay accesos hoy.</p>}
          {canOperateAccess && <Link href="/access" className="inline-flex py-2 text-sm text-(--color-primary) hover:underline">Ver acceso</Link>}
        </Section>}
        {canReadMembers && <Section title="Saldos pendientes">
          {debtors.isLoading ? <Skeleton className="h-32 w-full" /> : debtors.isError ? <LoadError onRetry={() => void debtors.refetch()} /> : debtors.data?.data.length ? <ul className="divide-y divide-(--color-border)">
            {debtors.data.data.map((member) => <li key={member.id}><Link href={`/members/${member.id}?tab=cuenta`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm transition-colors duration-150 hover:bg-(--color-muted-subtle) motion-reduce:transition-none"><span>{member.lastName}, {member.firstName}</span><MoneyDisplay value={member.balance} emphasizeNegative /></Link></li>)}
          </ul> : <p>Sin saldos pendientes registrados.</p>}
          <Link href="/members/debt" className="inline-flex py-2 text-sm text-(--color-primary) hover:underline">Ver deudores</Link>
        </Section>}
      </div>
      {!enabled.some(Boolean) && <EmptyState title="Sin indicadores para mostrar" description="Tu usuario no tiene permisos para ver indicadores en esta pantalla." />}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section aria-label={title} className="min-w-0 border-t border-(--color-border) pt-4"><h2 className="mb-3 text-lg font-semibold">{title}</h2>{children}</section>;
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <div className="flex flex-wrap items-center gap-3"><p role="alert">No pudimos cargar estos datos.</p><Button variant="outline" size="sm" onClick={onRetry}>Reintentar</Button></div>;
}

function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { timeZone, hour: '2-digit', minute: '2-digit' });
}
