'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { DebtorListItem, ListDebtorsQuery } from '@pulso/contracts/members';
import {
  Button,
  DataTable,
  EmptyState,
  MoneyDisplay,
  Pagination,
  Select,
  StatusBadge,
  type DataTableColumn,
} from '@pulso/ui';
import { listDebtors } from '@/lib/api/members';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

const PAGE_SIZE = 25;

type SortField = ListDebtorsQuery['sort'];
type SortOrder = ListDebtorsQuery['order'];

const SORT_OPTIONS: Array<{ value: `${SortField}:${SortOrder}`; label: string }> = [
  { value: 'balance:desc', label: 'Mayor deuda primero' },
  { value: 'balance:asc', label: 'Menor deuda primero' },
  { value: 'debtAge:desc', label: 'Deuda más antigua primero' },
  { value: 'debtAge:asc', label: 'Deuda más reciente primero' },
];

const DEFAULT_SORT: `${SortField}:${SortOrder}` = 'balance:desc';

export default function DebtorsPage() {
  return (
    <PermissionGate
      permission="member:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <DebtorsScreen />
    </PermissionGate>
  );
}

function DebtorsScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1') || 1;
  const sortParam = (searchParams.get('sort') as `${SortField}:${SortOrder}` | null) ?? DEFAULT_SORT;
  const [sortField, sortOrder] = React.useMemo(() => {
    const [f, o] = sortParam.split(':') as [SortField, SortOrder];
    return [f ?? 'balance', o ?? 'desc'] as const;
  }, [sortParam]);

  const queryFilters = React.useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      sort: sortField,
      order: sortOrder,
      branchId: branchId ?? undefined,
    }),
    [page, sortField, sortOrder, branchId],
  );

  const query = useQuery({
    queryKey: qk.debtors(gymId, branchId, queryFilters),
    queryFn: () => listDebtors(queryFilters),
    enabled: Boolean(gymId),
  });

  const total = query.data?.pageInfo.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const setParam = (key: string, value: string | null): void => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  };

  const columns: DataTableColumn<DebtorListItem>[] = [
    {
      id: 'name',
      header: 'Socio',
      cell: (m) => (
        <Link href={`/members/${m.id}`} className="font-medium text-(--color-text) hover:underline">
          {m.lastName}, {m.firstName}
        </Link>
      ),
    },
    {
      id: 'document',
      header: 'Documento',
      cell: (m) => <span className="tabular-nums text-(--color-muted)">{m.documentMasked}</span>,
    },
    {
      id: 'lastMembership',
      header: 'Última membresía',
      cell: (m) =>
        m.activeMembership ? (
          <div className="flex flex-col">
            <StatusBadge tone="success" label={m.activeMembership.planName} />
            {m.activeMembership.endDate ? (
              <span className="mt-0.5 text-(--text-xs) text-(--color-muted)">
                Vence {m.activeMembership.endDate}
              </span>
            ) : null}
          </div>
        ) : (
          <StatusBadge tone="neutral" label="Sin membresía activa" />
        ),
    },
    {
      id: 'debtSince',
      header: 'Deuda desde',
      cell: (m) => (
        <span className="text-(--color-muted) tabular-nums">{m.debtSince ?? '—'}</span>
      ),
    },
    {
      id: 'balance',
      header: 'Deuda',
      cell: (m) => (
        <span className="font-semibold">
          <MoneyDisplay value={m.balance} emphasizeNegative />
        </span>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'actions',
      header: '',
      cell: (m) => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" asChild>
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Deudores</h1>
          <p className="text-(--text-sm) text-(--color-muted)">
            Socios con saldo pendiente ordenados según el criterio que elijas.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="debtors-sort" className="text-(--text-sm) font-medium text-(--color-text)">
            Ordenar por
          </label>
          <Select
            id="debtors-sort"
            options={SORT_OPTIONS}
            value={sortParam}
            onValueChange={(value) => setParam('sort', value === DEFAULT_SORT ? null : value)}
          />
        </div>
      </div>

      <DataTable
        caption="Socios con deuda"
        columns={columns}
        data={query.data?.data ?? []}
        rowKey={(m) => m.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
        emptyTitle="Ningún socio con deuda"
        emptyDescription="Cuando alguien acumule saldo pendiente va a aparecer en esta lista."
      />

      {total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={(next) => setParam('page', String(next))}
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
