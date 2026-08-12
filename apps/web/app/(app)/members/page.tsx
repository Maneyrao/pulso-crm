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
} from '@pulso/ui';
import { listMembers } from '@/lib/api/members';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';
import { useMemberFilters } from '@/lib/hooks/useMemberFilters';
import { MemberFiltersBar } from '@/components/members/MemberFiltersBar';

const PAGE_SIZE = 25;

export default function MembersPage() {
  return (
    <PermissionGate
      permission="member:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <MembersScreen />
    </PermissionGate>
  );
}

function MembersScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const { filters, isFiltered, update, setPage, clearFilters } = useMemberFilters();

  const queryFilters = React.useMemo(
    () => ({
      q: filters.q || undefined,
      status: (filters.status || undefined) as MemberStatus | undefined,
      membershipStatus: (filters.membershipStatus || undefined) as MemberMembershipFilter | undefined,
      hasDebt: filters.hasDebt || undefined,
      page: filters.page,
      limit: PAGE_SIZE,
      branchId: branchId ?? undefined,
    }),
    [filters, branchId],
  );

  const query = useQuery({
    queryKey: qk.members(gymId, branchId, queryFilters),
    queryFn: () => listMembers(queryFilters),
    enabled: Boolean(gymId),
  });

  const total = query.data?.pageInfo.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: DataTableColumn<MemberListItem>[] = [
    {
      id: 'memberNumber',
      header: 'N°',
      cell: (m) => <span className="font-mono tabular-nums text-(--color-muted)">#{m.memberNumber}</span>,
    },
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
        </div>
      ),
    },
    {
      id: 'document',
      header: 'Documento',
      cell: (m) => <span className="tabular-nums text-(--color-muted)">{m.documentMasked}</span>,
    },
    {
      id: 'phone',
      header: 'Teléfono',
      cell: (m) => <span className="text-(--color-muted)">{m.phone ?? '—'}</span>,
    },
    {
      id: 'membership',
      header: 'Membresía',
      cell: (m) => {
        if (!m.activeMembership) {
          return <StatusBadge tone="neutral" label="Sin membresía" />;
        }
        return (
          <div className="flex flex-col">
            <StatusBadge tone="success" label={m.activeMembership.planName} />
            {m.activeMembership.endDate ? (
              <span className="mt-0.5 text-(--text-xs) text-(--color-muted)">
                Vence {m.activeMembership.endDate}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (m) =>
        m.status === 'ACTIVE' ? (
          <StatusBadge tone="success" label="Activo" />
        ) : (
          <StatusBadge tone="neutral" label="Inactivo" />
        ),
    },
    {
      id: 'balance',
      header: 'Deuda',
      cell: (m) =>
        Number(m.balance) > 0 ? (
          <MoneyDisplay value={m.balance} emphasizeNegative />
        ) : (
          <span className="text-(--color-muted)">—</span>
        ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'actions',
      header: '',
      cell: (m) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/members/${m.id}`}>Ver ficha</Link>
          </Button>
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Socios</h1>
          <p className="text-(--text-sm) text-(--color-muted)">
            Personas que asisten al gimnasio con su ficha, membresías y cuenta corriente.
          </p>
        </div>
        <PermissionGate permission="member:write">
          <Button asChild>
            <Link href="/members/new">Nuevo socio</Link>
          </Button>
        </PermissionGate>
      </div>

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
