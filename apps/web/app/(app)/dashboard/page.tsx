'use client';

import { useQuery } from '@tanstack/react-query';
import { MoneyDisplay } from '@pulso/ui';
import { listDebtors, listMembers } from '@/lib/api/members';
import { getDashboard } from '@/lib/api/reporting';
import { usePermission } from '@/lib/auth/permissions';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

export default function DashboardPage() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const canReadStats = usePermission('stats:read');
  const canReadMembers = usePermission('member:read');

  const activeMembers = useQuery({
    queryKey: qk.members(gymId, branchId, { status: 'ACTIVE', limit: 1 }),
    queryFn: () => listMembers({ status: 'ACTIVE', limit: 1, branchId: branchId ?? undefined }),
    enabled: canReadMembers,
  });

  const debtors = useQuery({
    queryKey: qk.debtors(gymId, branchId, { limit: 1 }),
    queryFn: () => listDebtors({ limit: 1, branchId: branchId ?? undefined }),
    enabled: canReadMembers,
  });

  // El endpoint de reportes puede no existir todavía: `getDashboard` ya
  // devuelve `null` ante un 404 en vez de fallar (lib/api/reporting.ts).
  const dashboard = useQuery({
    queryKey: qk.dashboard(gymId, branchId),
    queryFn: getDashboard,
    enabled: canReadStats,
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Inicio</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      {!canReadMembers && !canReadStats ? (
        <p className="text-(--text-sm) text-(--color-muted)">
          Tu usuario no tiene permisos para ver indicadores en esta pantalla.
        </p>
      ) : null}
    </div>
  );
}
