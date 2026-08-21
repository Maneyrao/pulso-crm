'use client';

import * as React from 'react';
import { BookOpen } from 'lucide-react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  CashMovement,
  CashSession,
  DaybookQuery,
  DaybookResponse,
  PaymentMethod,
} from '@pulso/contracts/cash';
import { formatMoney, subMoney, sumMoney } from '@pulso/config/money';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  MoneyDisplay,
  StatusBadge,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { getDaybook, listPaymentMethods } from '@/lib/api/cash';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Libro diario de caja (API_CONTRACTS §8 `GET /cash/daybook`).
 *
 * Rango de fechas por día de negocio (default: hoy). El backend arma el
 * agrupamiento por día y los totales por método, así que la UI sólo lo pinta.
 */
export default function DaybookPage() {
  return (
    <PermissionGate
      permission="cash:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <DaybookScreen />
    </PermissionGate>
  );
}

function DaybookScreen() {
  const gymId = useSessionStore((s) => s.gym?.id);
  const activeBranchId = useSessionStore((s) => s.activeBranchId ?? null);

  const today = React.useMemo(() => new Date(), []);
  const todayIso = React.useMemo(() => toIsoDate(today), [today]);
  const [from, setFrom] = React.useState(() => toIsoDate(startOfMonth(today)));
  const [to, setTo] = React.useState(todayIso);

  const daybookQuery = useQuery({
    queryKey: qk.daybook(gymId ?? '', activeBranchId, from, to),
    queryFn: () => getDaybook(buildQuery(from, to, activeBranchId)),
    enabled: Boolean(gymId && from && to && from <= to),
  });

  const paymentMethodsQuery = useQuery({
    queryKey: qk.paymentMethods(gymId ?? ''),
    queryFn: listPaymentMethods,
    enabled: Boolean(gymId),
  });

  const paymentMethodById = React.useMemo(
    () => new Map((paymentMethodsQuery.data?.data ?? []).map((m) => [m.id, m])),
    [paymentMethodsQuery.data],
  );

  const days = React.useMemo(() => daybookQuery.data?.data ?? [], [daybookQuery.data]);
  const periodBalance = React.useMemo(() => {
    const income = sumMoney(days.flatMap((d) => d.totalsByMethod.map((t) => t.income)));
    const expense = sumMoney(days.flatMap((d) => d.totalsByMethod.map((t) => t.expense)));
    return subMoney(income, expense);
  }, [days]);

  const selectCurrentMonth = () => {
    setFrom(toIsoDate(startOfMonth(today)));
    setTo(todayIso);
  };
  const selectPreviousMonth = () => {
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    setFrom(toIsoDate(startOfMonth(prevMonthEnd)));
    setTo(toIsoDate(prevMonthEnd));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={BookOpen}
        title="Libro diario"
        description={
          daybookQuery.isSuccess
            ? `${formatRangeLabel(from, to)} · saldo ${formatMoney(periodBalance)}`
            : 'Sesiones y movimientos agrupados por día de negocio, con totales por método.'
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={selectCurrentMonth}>
            Mes actual
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={selectPreviousMonth}>
            Mes anterior
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Desde">
            {(field) => (
              <Input
                {...field}
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Hasta">
            {(field) => (
              <Input
                {...field}
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            )}
          </FormField>
        </div>
      </div>

      {from && to && from > to ? (
        <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
          El rango es inválido: la fecha "desde" es posterior a "hasta".
        </p>
      ) : null}

      <DaybookContent
        query={daybookQuery}
        paymentMethodById={paymentMethodById}
      />
    </div>
  );
}

interface DaybookContentProps {
  query: UseQueryResult<DaybookResponse>;
  paymentMethodById: ReadonlyMap<string, PaymentMethod>;
}

function DaybookContent({ query, paymentMethodById }: DaybookContentProps) {
  if (query.isLoading) {
    return (
      <EmptyState
        title="Cargando libro diario"
        description="Buscando movimientos del rango seleccionado..."
      />
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        title="No pudimos cargar el libro diario"
        description={errorMessage(query.error)}
        onRetry={() => query.refetch()}
      />
    );
  }

  const days = query.data?.data ?? [];
  if (days.length === 0) {
    return (
      <EmptyState
        title="Sin movimientos en el rango"
        description="No se registraron sesiones ni movimientos para las fechas elegidas."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {days.map((day) => (
        <DayBlock
          key={day.businessDate}
          date={day.businessDate}
          sessions={day.sessions}
          movements={day.movements}
          totalsByMethod={day.totalsByMethod}
          paymentMethodById={paymentMethodById}
        />
      ))}
    </div>
  );
}

interface DayBlockProps {
  date: string;
  sessions: readonly CashSession[];
  movements: readonly CashMovement[];
  totalsByMethod: readonly { paymentMethodId: string; income: string; expense: string }[];
  paymentMethodById: ReadonlyMap<string, PaymentMethod>;
}

function DayBlock({ date, sessions, movements, totalsByMethod, paymentMethodById }: DayBlockProps) {
  const shortSessionId = (id: string) => id.slice(0, 8);
  const sessionShortById = React.useMemo(
    () => new Map(sessions.map((s) => [s.id, shortSessionId(s.id)])),
    [sessions],
  );

  const totalIncome = sumMoney(totalsByMethod.map((t) => t.income));
  const totalExpense = sumMoney(totalsByMethod.map((t) => t.expense));
  const netTotal = subMoney(totalIncome, totalExpense);

  const columns: DataTableColumn<CashMovement>[] = [
    {
      id: 'time',
      header: 'Hora',
      cell: (m) => <span className="tabular-nums">{formatTime(m.createdAt)}</span>,
    },
    {
      id: 'session',
      header: 'Sesión',
      cell: (m) => (
        <span className="font-mono text-(--text-xs) text-(--color-muted)">
          {sessionShortById.get(m.cashSessionId) ?? shortSessionId(m.cashSessionId)}
        </span>
      ),
    },
    {
      id: 'method',
      header: 'Método',
      cell: (m) => paymentMethodById.get(m.paymentMethodId)?.name ?? shortSessionId(m.paymentMethodId),
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: (m) =>
        m.type === 'INCOME' ? (
          <StatusBadge tone="success" label="Ingreso" />
        ) : (
          <StatusBadge tone="danger" label="Egreso" />
        ),
    },
    {
      id: 'amount',
      header: 'Importe',
      cell: (m) => (
        <MoneyDisplay
          value={m.type === 'EXPENSE' ? `-${m.amount}` : m.amount}
          emphasizeNegative={m.type === 'EXPENSE'}
        />
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'member',
      header: 'Socio',
      cell: (m) =>
        m.memberId ? (
          <span className="font-mono text-(--text-xs) text-(--color-muted)">
            {shortSessionId(m.memberId)}
          </span>
        ) : (
          <span className="text-(--color-muted)">—</span>
        ),
    },
  ];

  return (
    <section aria-label={`Día ${date}`} className="flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-(--text-lg) font-semibold text-(--color-text) tabular-nums">{date}</h2>
        <p className="text-(--text-sm) text-(--color-muted)">
          {sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'} ·{' '}
          {movements.length} {movements.length === 1 ? 'movimiento' : 'movimientos'}
        </p>
      </header>

      <DataTable
        caption={`Movimientos del día ${date}`}
        columns={columns}
        data={movements}
        rowKey={(m) => m.id}
        emptyTitle="Sin movimientos"
        emptyDescription="Este día no tiene movimientos cargados."
      />

      <div className="overflow-x-auto rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4">
        <h3 className="mb-2 text-(--text-sm) font-medium text-(--color-text)">Totales por método</h3>
        <table className="w-full border-collapse text-(--text-sm)">
          <thead>
            <tr className="border-b border-(--color-border)">
              <th scope="col" className="px-2 py-1.5 text-left font-medium text-(--color-muted)">Método</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium text-(--color-muted)">Ingresos</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium text-(--color-muted)">Egresos</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium text-(--color-muted)">Neto</th>
            </tr>
          </thead>
          <tbody>
            {totalsByMethod.map((row) => {
              const net = subMoney(row.income, row.expense);
              return (
                <tr key={row.paymentMethodId} className="border-b border-(--color-border) last:border-0">
                  <td className="px-2 py-1.5">
                    {paymentMethodById.get(row.paymentMethodId)?.name ?? row.paymentMethodId.slice(0, 8)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <MoneyDisplay value={row.income} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <MoneyDisplay value={row.expense} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <MoneyDisplay value={net} emphasizeNegative />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-(--color-border) font-medium">
              <td className="px-2 py-1.5">Total del día</td>
              <td className="px-2 py-1.5 text-right">
                <MoneyDisplay value={totalIncome} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <MoneyDisplay value={totalExpense} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <MoneyDisplay value={netTotal} emphasizeNegative />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** "01/08/2026 – 20/08/2026" para el subtítulo del período. */
function formatRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function buildQuery(from: string, to: string, branchId: string | null): DaybookQuery {
  return { from, to, ...(branchId ? { branchId } : {}) };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}

