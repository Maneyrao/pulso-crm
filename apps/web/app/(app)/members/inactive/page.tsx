'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserMinus, UserX } from 'lucide-react';
import type { DebtorListItem, MemberListItem } from '@pulso/contracts/members';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  MoneyDisplay,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { deactivateMember, listDebtors, listMembers } from '@/lib/api/members';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

type TabValue = 'debt' | 'inactive';

const PAGE_SIZE = 100;
const BULK_DEACTIVATION_REASON = 'Baja manual desde el modulo Baja de socios.';

export default function InactiveMembersPage() {
  return (
    <PermissionGate
      permission="member:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <InactiveMembersScreen />
    </PermissionGate>
  );
}

function InactiveMembersScreen() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const permissions = useSessionStore((s) => s.permissions);
  const canDelete = permissions.includes('member:delete');

  const [tab, setTab] = React.useState<TabValue>('debt');
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [pendingIds, setPendingIds] = React.useState<readonly string[]>([]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const debtorFilters = React.useMemo(
    () => ({
      branchId: branchId ?? undefined,
      limit: PAGE_SIZE,
      page: 1,
      sort: 'balance' as const,
      order: 'asc' as const,
    }),
    [branchId],
  );
  const inactiveFilters = React.useMemo(
    () => ({
      branchId: branchId ?? undefined,
      limit: PAGE_SIZE,
      page: 1,
      status: 'INACTIVE' as const,
      sort: 'lastName' as const,
      order: 'asc' as const,
    }),
    [branchId],
  );

  const debtorsQuery = useQuery({
    queryKey: qk.debtors(gymId, branchId, debtorFilters),
    queryFn: () => listDebtors(debtorFilters),
    enabled: Boolean(gymId),
  });
  const inactiveQuery = useQuery({
    queryKey: qk.members(gymId, branchId, inactiveFilters),
    queryFn: () => listMembers(inactiveFilters),
    enabled: Boolean(gymId),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (ids: readonly string[]) => {
      await Promise.all(
        ids.map((id) =>
          deactivateMember(id, {
            force: true,
            reason: BULK_DEACTIVATION_REASON,
          }),
        ),
      );
    },
    onSuccess: async (_data, ids) => {
      setConfirmOpen(false);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setPendingIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['debtors', gymId] }),
        queryClient.invalidateQueries({ queryKey: ['members', gymId] }),
      ]);
      toast({
        tone: 'success',
        title: ids.length === 1 ? 'Socio dado de baja' : `${ids.length} socios dados de baja`,
      });
    },
    onError: (error) => {
      toast({
        tone: 'danger',
        title: 'No pudimos dar de baja',
        description: errorMessage(error),
      });
    },
  });

  const debtors = debtorsQuery.data?.data ?? [];
  const inactiveMembers = inactiveQuery.data?.data ?? [];
  const selectedDebtors = debtors.filter((member) => selected.has(member.id));
  const allDebtorsSelected = debtors.length > 0 && debtors.every((member) => selected.has(member.id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allDebtorsSelected) {
        for (const member of debtors) next.delete(member.id);
      } else {
        for (const member of debtors) next.add(member.id);
      }
      return next;
    });
  };

  const openConfirm = (ids: readonly string[]) => {
    setPendingIds(ids);
    setConfirmOpen(true);
  };

  const debtorColumns: DataTableColumn<DebtorListItem>[] = [
    ...(canDelete
      ? [
          {
            id: 'select',
            header: '',
            cell: (member: DebtorListItem) => (
              <Checkbox
                checked={selected.has(member.id)}
                onChange={() => toggleOne(member.id)}
                aria-label={`Seleccionar a ${member.firstName} ${member.lastName}`}
              />
            ),
            cellClassName: 'w-10',
          } satisfies DataTableColumn<DebtorListItem>,
        ]
      : []),
    {
      id: 'member',
      header: 'Socio',
      cell: (member) => (
        <div className="flex flex-col">
          <Link href={`/members/${member.id}`} className="font-medium text-(--color-text) hover:underline">
            {member.lastName}, {member.firstName}
          </Link>
          <span className="text-(--text-xs) text-(--color-muted)">{member.documentMasked}</span>
        </div>
      ),
    },
    {
      id: 'membership',
      header: 'Membresía',
      cell: (member) =>
        member.activeMembership ? (
          <StatusBadge tone="success" label={member.activeMembership.planName} />
        ) : (
          <StatusBadge tone="neutral" label="Sin membresía activa" />
        ),
    },
    {
      id: 'debtSince',
      header: 'Deuda desde',
      cell: (member) => <span className="tabular-nums">{member.debtSince ?? '—'}</span>,
    },
    {
      id: 'balance',
      header: 'Deuda',
      cell: (member) => (
        <span className="font-semibold">
          <MoneyDisplay value={member.balance} emphasizeNegative />
        </span>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'actions',
      header: '',
      cell: (member) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/members/${member.id}`}>Ver ficha</Link>
          </Button>
          {canDelete ? (
            <Button
              variant="ghost"
              size="sm"
              title="Dar de baja"
              aria-label={`Dar de baja a ${member.firstName} ${member.lastName}`}
              onClick={() => openConfirm([member.id])}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  const inactiveColumns: DataTableColumn<MemberListItem>[] = [
    {
      id: 'member',
      header: 'Socio',
      cell: (member) => (
        <div className="flex flex-col">
          <Link href={`/members/${member.id}`} className="font-medium text-(--color-text) hover:underline">
            {member.lastName}, {member.firstName}
          </Link>
          <span className="text-(--text-xs) text-(--color-muted)">{member.documentMasked}</span>
        </div>
      ),
    },
    {
      id: 'branch',
      header: 'Sede',
      cell: (member) => member.branch?.name ?? '—',
    },
    {
      id: 'membership',
      header: 'Última membresía',
      cell: (member) => member.activeMembership?.planName ?? 'Sin membresía activa',
    },
    {
      id: 'status',
      header: 'Estado',
      cell: () => (
        <span className="inline-flex items-center gap-1 font-medium text-(--color-muted)">
          <UserX className="h-4 w-4" aria-hidden="true" />
          Inactivo
        </span>
      ),
    },
    {
      id: 'balance',
      header: 'Saldo',
      cell: (member) =>
        member.balance === '0.00' ? (
          <span className="text-(--color-muted)">—</span>
        ) : (
          <MoneyDisplay value={member.balance} emphasizeNegative />
        ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={UserMinus}
        title="Baja de socios"
        description="Gestioná candidatos a baja por deuda y revisá socios ya inactivos."
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge tone="warning">{debtorsQuery.data?.pageInfo.total ?? 0} con deuda</Badge>
            <Badge tone="neutral">{inactiveQuery.data?.pageInfo.total ?? 0} inactivos</Badge>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
        <TabsList>
          <TabsTrigger value="debt">Con deuda</TabsTrigger>
          <TabsTrigger value="inactive">Ya inactivos</TabsTrigger>
        </TabsList>

        {tab === 'debt' && canDelete ? (
          selectedDebtors.length > 0 ? (
            <div className="mt-3 flex items-center justify-between rounded-(--radius-md) border border-(--color-border) bg-(--color-muted-subtle) px-4 py-2.5">
              <span className="text-(--text-sm) text-(--color-text)">
                {selectedDebtors.length} socio{selectedDebtors.length === 1 ? '' : 's'} seleccionado
                {selectedDebtors.length === 1 ? '' : 's'}
              </span>
              <Button variant="danger" size="sm" onClick={() => openConfirm(selectedDebtors.map((member) => member.id))}>
                Dar de baja {selectedDebtors.length} socios
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 px-1">
              <Checkbox
                checked={allDebtorsSelected}
                onChange={toggleAll}
                aria-label="Seleccionar todos los deudores visibles"
                disabled={debtors.length === 0}
              />
              <span className="text-(--text-sm) text-(--color-muted)">Seleccionar todos los deudores visibles</span>
            </div>
          )
        ) : null}

        <TabsContent value="debt">
          <DataTable
            caption="Socios con deuda"
            columns={debtorColumns}
            data={debtors}
            rowKey={(member) => member.id}
            loading={debtorsQuery.isLoading}
            error={debtorsQuery.isError ? errorMessage(debtorsQuery.error) : undefined}
            onRetry={() => debtorsQuery.refetch()}
            emptyTitle="Ningún socio con deuda"
            emptyDescription="Cuando alguien acumule saldo pendiente va a aparecer acá."
          />
        </TabsContent>
        <TabsContent value="inactive">
          <DataTable
            caption="Socios inactivos"
            columns={inactiveColumns}
            data={inactiveMembers}
            rowKey={(member) => member.id}
            loading={inactiveQuery.isLoading}
            error={inactiveQuery.isError ? errorMessage(inactiveQuery.error) : undefined}
            onRetry={() => inactiveQuery.refetch()}
            emptyTitle="No hay socios inactivos"
            emptyDescription="Los socios dados de baja quedan listados en esta vista."
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={pendingIds.length === 1 ? 'Dar de baja a este socio' : `Dar de baja a ${pendingIds.length} socios`}
        description="La baja deja al socio como inactivo y queda auditada. Si tiene deuda, no se borra: sigue visible en su cuenta corriente."
        confirmLabel="Dar de baja"
        tone="danger"
        loading={deactivateMutation.isPending}
        onConfirm={() => deactivateMutation.mutate(pendingIds)}
      />
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
