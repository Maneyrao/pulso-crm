'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type {
  MemberListItem,
  MemberMembershipFilter,
  MemberStatus,
} from '@pulso/contracts/members';
import {
  Button,
  DataTable,
  EmptyState,
  MoneyDisplay,
  Pagination,
  StatusBadge,
  type DataTableColumn,
  type StatusTone,
} from '@pulso/ui';
import { Banknote, Download, Users } from 'lucide-react';
import { useToast } from '@pulso/ui';
import { listMembers } from '@/lib/api/members';
import { ApiError } from '@/lib/api/errors';
import { downloadCsv, toCsv } from '@/lib/csv';
import { PermissionGate } from '@/lib/auth/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';
import { useMemberFilters } from '@/lib/hooks/useMemberFilters';
import { MemberFiltersBar } from '@/components/members/MemberFiltersBar';
import { MemberPaymentDialog } from '@/components/members/MemberPaymentDialog';

const PAGE_SIZE = 25;
/** Tope del export CSV: 10 páginas de API (el límite del contrato es 100 por página). */
const EXPORT_MAX_ROWS = 1000;

export default function MembersPage() {
  return (
    <PermissionGate
      permission="member:read"
      fallback={
        <EmptyState
          title="Sin acceso"
          description="Tu usuario no tiene permiso para ver esta pantalla."
        />
      }
    >
      <MembersScreen />
    </PermissionGate>
  );
}

/**
 * Estado visible del socio (columna "Estado"): se deriva de campos reales de
 * `MemberListItem` — nunca se inventa un dato que la API no manda.
 *
 * - "Vencido" describe el período de la membresía, no el saldo de la cuenta.
 *   Un período puede estar vencido y completamente saldado: son dos hechos
 *   distintos y la tabla los muestra en columnas separadas.
 * - "En deuda" usa el signo real del ledger: saldo NEGATIVO = deuda (el
 *   backend filtra `hasDebt` con `balance < 0`; ver `members.service.ts`).
 *   Ojo: esto corrige una inversión de signo que tenía esta pantalla antes.
 */
function memberStatusTag(
  member: MemberListItem,
  expiredSegmentActive: boolean,
): { tone: StatusTone; label: string } {
  if (member.latestMembership?.status === 'EXPIRED' || expiredSegmentActive) {
    return { tone: 'danger', label: 'Vencido' };
  }
  if (member.latestMembership?.status === 'SUSPENDED') {
    return { tone: 'warning', label: 'Suspendido' };
  }
  if (member.latestMembership?.status === 'CANCELLED') {
    return { tone: 'neutral', label: 'Cancelado' };
  }
  if (Number(member.balance) < 0) return { tone: 'warning', label: 'En deuda' };
  if (member.status === 'ACTIVE') return { tone: 'success', label: 'Activo' };
  return { tone: 'neutral', label: 'Inactivo' };
}

function MembersScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const { filters, isFiltered, update, setPage, clearFilters } = useMemberFilters();

  const [exporting, setExporting] = React.useState(false);
  const [payingMember, setPayingMember] = React.useState<MemberListItem | null>(null);
  const { toast } = useToast();

  /**
   * Exporta el listado con los filtros vigentes. Pagina contra la API hasta
   * EXPORT_MAX_ROWS (el límite por página del contrato es 100) y avisa si el
   * resultado quedó truncado.
   */
  const handleExport = async () => {
    setExporting(true);
    try {
      const rows: MemberListItem[] = [];
      let page = 1;
      let total = Infinity;
      while (rows.length < EXPORT_MAX_ROWS && rows.length < total) {
        const res = await listMembers({
          q: filters.q || undefined,
          status: (filters.status || undefined) as MemberStatus | undefined,
          membershipStatus: (filters.membershipStatus || undefined) as
            MemberMembershipFilter | undefined,
          hasDebt: filters.hasDebt || undefined,
          page,
          limit: 100,
        });
        rows.push(...res.data);
        total = res.pageInfo.total;
        if (res.data.length === 0) break;
        page += 1;
      }
      const csv = toCsv(
        ['N°', 'Apellido', 'Nombre', 'Documento', 'Plan', 'Vence', 'Sede', 'Estado', 'Cuenta'],
        rows
          .slice(0, EXPORT_MAX_ROWS)
          .map((m) => [
            String(m.memberNumber),
            m.lastName,
            m.firstName,
            m.documentMasked,
            m.latestMembership?.planName ?? m.activeMembership?.planName ?? '',
            m.latestMembership?.endDate ?? m.activeMembership?.endDate ?? '',
            m.branch?.name ?? '',
            m.latestMembership?.status === 'EXPIRED'
              ? 'Vencido'
              : m.status === 'ACTIVE'
                ? 'Activo'
                : 'Inactivo',
            m.balance,
          ]),
      );
      downloadCsv(`socios-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      if (total > EXPORT_MAX_ROWS) {
        toast({
          tone: 'warning',
          title: 'Export truncado',
          description: `Se exportaron ${EXPORT_MAX_ROWS} de ${total} socios. Afiná los filtros para exportar el resto.`,
        });
      }
    } catch {
      toast({
        tone: 'danger',
        title: 'No pudimos exportar',
        description: 'Probá de nuevo en unos segundos.',
      });
    } finally {
      setExporting(false);
    }
  };

  const queryFilters = React.useMemo(
    () => ({
      q: filters.q || undefined,
      status: (filters.status || undefined) as MemberStatus | undefined,
      membershipStatus: (filters.membershipStatus || undefined) as
        MemberMembershipFilter | undefined,
      hasDebt: filters.hasDebt || undefined,
      page: filters.page,
      limit: PAGE_SIZE,
    }),
    [filters],
  );

  const query = useQuery({
    // El padrón de socios es del gimnasio completo. Las vistas operativas de
    // caja y deuda sí siguen la sede activa.
    queryKey: qk.members(gymId, null, queryFilters),
    queryFn: () => listMembers(queryFilters),
    enabled: Boolean(gymId),
  });

  const total = query.data?.pageInfo.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const expiredSegmentActive = filters.membershipStatus === 'EXPIRED';

  const columns: DataTableColumn<MemberListItem>[] = [
    {
      id: 'name',
      header: 'Socio',
      cell: (m) => (
        <div className="flex flex-col">
          <Link
            href={`/members/${m.id}`}
            className="font-medium text-(--color-text) hover:underline"
          >
            {m.lastName}, {m.firstName}
          </Link>
          <span className="text-(--text-xs) text-(--color-muted)">#{m.memberNumber}</span>
        </div>
      ),
    },
    {
      id: 'document',
      header: 'DNI',
      cell: (m) => <span className="tabular-nums text-(--color-muted)">{m.documentMasked}</span>,
    },
    {
      id: 'plan',
      header: 'Plan',
      cell: (m) =>
        (m.latestMembership?.planName ?? m.activeMembership?.planName) ?? (
          <span className="text-(--color-muted)">Sin plan</span>
        ),
    },
    {
      id: 'endDate',
      header: 'Vence',
      cell: (m) => (
        <span className="tabular-nums text-(--color-muted)">
          {m.latestMembership?.endDate ?? m.activeMembership?.endDate ?? '—'}
        </span>
      ),
    },
    {
      id: 'branch',
      header: 'Sede',
      cell: (m) => m.branch?.name ?? <span className="text-(--color-muted)">Sin sede</span>,
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (m) => {
        const tag = memberStatusTag(m, expiredSegmentActive);
        return <StatusBadge tone={tag.tone} label={tag.label} />;
      },
    },
    {
      id: 'balance',
      header: 'Cuenta',
      cell: (m) =>
        Number(m.balance) < 0 ? (
          <MoneyDisplay value={m.balance} emphasizeNegative />
        ) : (
          Number(m.balance) > 0 ? (
            <span>Saldo a favor: <MoneyDisplay value={m.balance} /></span>
          ) : m.latestMembership?.status === 'EXPIRED' ? (
            <span className="text-(--color-success)" title="El período venció, pero no tiene saldo pendiente">
              Cuota saldada
            </span>
          ) : (
            <span className="text-(--color-success)">Al día</span>
          )
        ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'payment', header: 'Pago',
      cell: (member) => Number(member.balance) < 0 ? <PermissionGate permission="cash:operate"><PermissionGate permission="cash:read"><PermissionGate permission="payment:collect">
        <Button size="sm" onClick={() => setPayingMember(member)}><Banknote className="h-4 w-4" aria-hidden />Pagar</Button>
      </PermissionGate></PermissionGate></PermissionGate> : <Button asChild size="sm" variant="ghost"><Link href={`/members/${member.id}?tab=pagos`}>Ver pagos</Link></Button>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {payingMember && <MemberPaymentDialog key={payingMember.id} member={payingMember} onClose={() => setPayingMember(null)} />}
      <PageHeader
        icon={Users}
        title="Socios"
        description={
          query.data
            ? `${total} socio${total === 1 ? '' : 's'}`
            : 'Personas que asisten al gimnasio.'
        }
        actions={
          <>
            <Button variant="outline" loading={exporting} onClick={() => void handleExport()}>
              <Download className="h-4 w-4" aria-hidden={true} />
              Exportar
            </Button>
            <PermissionGate permission="member:write">
              <Button asChild>
                <Link href="/members/new">Nuevo socio</Link>
              </Button>
            </PermissionGate>
          </>
        }
      />

      <MemberFiltersBar filters={filters} onChange={(patch) => update(patch)} />

      <DataTable
        caption="Socios del gimnasio"
        columns={columns}
        data={query.data?.data ?? []}
        rowKey={(m) => m.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        emptyTitle="Todavía no hay socios"
        emptyDescription="Creá el primer socio para empezar a registrar membresías y cobros."
        emptyAction={
          <PermissionGate permission="member:write">
            <Button asChild>
              <Link href="/members/new">Nuevo socio</Link>
            </Button>
          </PermissionGate>
        }
      />

      {total > 0 ? (
        <Pagination
          page={filters.page}
          pageCount={pageCount}
          onPageChange={setPage}
          totalItems={total}
          pageSize={PAGE_SIZE}
        />
      ) : null}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
