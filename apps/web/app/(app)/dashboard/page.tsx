'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarDays,
  DoorOpen,
  LayoutDashboard,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, MoneyDisplay, Skeleton } from '@pulso/ui';
import { listDebtors, listMembers } from '@/lib/api/members';
import { getDashboard } from '@/lib/api/reporting';
import { usePermission } from '@/lib/auth/permissions';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

interface QuickAction {
  href: string;
  label: string;
  icon: typeof UserPlus;
  allowed: boolean;
}

export default function DashboardPage() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const canReadStats = usePermission('stats:read');
  const canReadMembers = usePermission('member:read');
  const canWriteMembers = usePermission('member:write');
  const canOperateAccess = usePermission('access:operate');
  const canReadCash = usePermission('cash:read');
  const canReadReservations = usePermission('reservation:read');

  const activeMembers = useQuery({
    queryKey: qk.members(gymId, branchId, { status: 'ACTIVE', limit: 1 }),
    queryFn: () => listMembers({ status: 'ACTIVE', limit: 1, branchId: branchId ?? undefined }),
    enabled: canReadMembers,
  });

  const debtors = useQuery({
    queryKey: qk.debtors(gymId, branchId, { limit: 5, sort: 'balance', order: 'asc' }),
    // Saldos deudores son negativos: balance:asc = más negativo primero =
    // "mayor deuda primero" (misma semántica que /members/debt).
    queryFn: () => listDebtors({ limit: 5, sort: 'balance', order: 'asc', branchId: branchId ?? undefined }),
    enabled: canReadMembers,
  });

  // El endpoint de reportes puede no existir todavía: `getDashboard` ya
  // devuelve `null` ante un 404 en vez de fallar (lib/api/reporting.ts).
  const dashboard = useQuery({
    queryKey: qk.dashboard(gymId, branchId),
    queryFn: getDashboard,
    enabled: canReadStats,
  });

  const quickActions: QuickAction[] = [
    { href: '/members/new', label: 'Nuevo socio', icon: UserPlus, allowed: canWriteMembers },
    { href: '/access', label: 'Registrar acceso', icon: DoorOpen, allowed: canOperateAccess },
    { href: '/cash', label: 'Ver caja', icon: Wallet, allowed: canReadCash },
    { href: '/schedule/reservations', label: 'Reservas de hoy', icon: CalendarDays, allowed: canReadReservations },
  ].filter((a) => a.allowed);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Inicio"
        description="Resumen operativo del gimnasio: socios, caja y accesos de hoy."
        className="mb-0"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {canReadMembers ? (
          <>
            <KpiCard
              title="Socios activos"
              loading={activeMembers.isLoading}
              error={activeMembers.isError ? 'No pudimos cargar este dato.' : undefined}
              value={activeMembers.data?.pageInfo.total}
            />
            <KpiCard
              title="Socios con deuda"
              loading={debtors.isLoading}
              error={debtors.isError ? 'No pudimos cargar este dato.' : undefined}
              value={debtors.data?.pageInfo.total}
            />
          </>
        ) : null}

        {canReadStats ? (
          dashboard.isLoading ? (
            <>
              <KpiCard title="Ingresos de hoy" loading />
              <KpiCard title="Asistencias de hoy" loading />
              <KpiCard title="Deuda total" loading />
              <KpiCard title="Vencen en 7 días" loading />
            </>
          ) : dashboard.isError ? (
            <>
              <KpiCard title="Ingresos de hoy" error="No pudimos cargar este dato." />
              <KpiCard title="Asistencias de hoy" error="No pudimos cargar este dato." />
              <KpiCard title="Deuda total" error="No pudimos cargar este dato." />
              <KpiCard title="Vencen en 7 días" error="No pudimos cargar este dato." />
            </>
          ) : dashboard.data ? (
            <>
              <KpiCard title="Ingresos de hoy" value={<MoneyDisplay value={dashboard.data.todayIncome} />} />
              <KpiCard title="Asistencias de hoy" value={dashboard.data.todayAttendances} />
              <KpiCard title="Deuda total" value={<MoneyDisplay value={dashboard.data.totalDebt} emphasizeNegative />} />
              <KpiCard
                title="Vencen en 7 días"
                value={dashboard.data.expiringMembershipsNext7Days}
                hint="Membresías próximas a vencer"
              />
            </>
          ) : null
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {canReadMembers ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-(--color-warning)" aria-hidden={true} />
                Deudores principales
              </CardTitle>
              <Link
                href="/members/debt"
                className="flex items-center gap-1 text-(--text-sm) font-medium text-(--color-primary) hover:underline"
              >
                Ver todos <ArrowRight className="h-3.5 w-3.5" aria-hidden={true} />
              </Link>
            </CardHeader>
            <CardContent>
              {debtors.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
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
            </CardContent>
          </Card>
        ) : null}

        <div className="flex flex-col gap-4">
          {quickActions.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Accesos rápidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((a) => {
                    const Icon = a.icon;
                    return (
                      <Link
                        key={a.href}
                        href={a.href}
                        className="flex items-center gap-2.5 rounded-(--radius-md) border border-(--color-border) px-3 py-2.5 text-(--text-sm) font-medium text-(--color-text) transition-colors hover:border-(--color-primary) hover:bg-(--color-primary-subtle)"
                      >
                        <Icon className="h-4 w-4 text-(--color-primary)" aria-hidden={true} />
                        {a.label}
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Link
            href="/ai"
            className="group flex items-center gap-4 rounded-(--radius-lg) border border-(--color-primary) bg-(--color-primary-subtle) p-4 transition-shadow hover:shadow-(--shadow-md)"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary) text-(--color-primary-foreground)">
              <Bot className="h-5.5 w-5.5" aria-hidden={true} />
            </span>
            <span className="min-w-0">
              <span className="block text-(--text-base) font-semibold text-(--color-text)">Asistente Pulso</span>
              <span className="block text-(--text-sm) text-(--color-muted)">
                Preguntá por socios, ingresos, asistencias y vencimientos.
              </span>
            </span>
            <ArrowRight
              className="ml-auto h-4 w-4 shrink-0 text-(--color-primary) transition-transform group-hover:translate-x-0.5"
              aria-hidden={true}
            />
          </Link>
        </div>
      </div>

      {!canReadMembers && !canReadStats ? (
        <p className="text-(--text-sm) text-(--color-muted)">
          Tu usuario no tiene permisos para ver indicadores en esta pantalla.
        </p>
      ) : null}
    </div>
  );
}
