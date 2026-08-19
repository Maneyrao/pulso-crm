'use client';

import * as React from 'react';
import { Gift } from 'lucide-react';
import {
  Badge,
  Button,
  cn,
  DataTable,
  EmptyState,
  Input,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { DEMO_LOYALTY_ACCOUNTS, type DemoLoyaltyAccount, type LoyaltyLevel } from '@/lib/mock/data/commerce-demo';

const DEMO_TOAST_MESSAGE = 'Demo: disponible con backend';

/**
 * Fidelización › Puntos por socio — sin backend todavía (`loyalty:read`),
 * pantalla de demo con `useMockData` (docs/CONTROLFIT_PARITY_AUDIT.md §2).
 */
export default function LoyaltyMembersPage() {
  return (
    <PermissionGate
      permission="loyalty:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <LoyaltyMembersScreen />
    </PermissionGate>
  );
}

function LoyaltyMembersScreen() {
  const { data, isLoading } = useMockData(() => DEMO_LOYALTY_ACCOUNTS);
  const { toast } = useToast();
  const canConfig = usePermission('loyalty:config');

  const [search, setSearch] = React.useState('');
  const isFiltered = search.trim() !== '';

  const filtered = React.useMemo(() => {
    const items = data ?? [];
    const normalized = search.trim().toLowerCase();
    if (normalized === '') return items;
    return items.filter((m) => m.memberName.toLowerCase().includes(normalized));
  }, [data, search]);

  const handleAdjust = (): void => {
    toast({ description: DEMO_TOAST_MESSAGE, tone: 'info' });
  };

  const columns: DataTableColumn<DemoLoyaltyAccount>[] = [
    {
      id: 'member',
      header: 'Socio',
      cell: (m) => (
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--color-primary-subtle) text-(--text-xs) font-semibold text-(--color-primary-subtle-foreground)"
          >
            {getInitials(m.memberName)}
          </span>
          <span className="font-medium text-(--color-text)">{m.memberName}</span>
        </div>
      ),
    },
    {
      id: 'level',
      header: 'Nivel',
      cell: (m) => <LevelBadge level={m.level} />,
    },
    {
      id: 'points',
      header: 'Puntos',
      cell: (m) => <span className="text-(--text-lg) font-semibold tabular-nums text-(--color-text)">{m.points}</span>,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'lastActivity',
      header: 'Última actividad',
      cell: (m) => <span className="tabular-nums text-(--color-muted)">{m.lastActivity}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: () =>
        canConfig ? (
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={handleAdjust}>
              Ajustar
            </Button>
          </div>
        ) : null,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Gift}
        title="Puntos por socio"
        description="Saldo de puntos y nivel de cada socio."
        mock
      />

      <div className="flex max-w-sm flex-col gap-1.5">
        <label htmlFor="loyalty-members-search" className="text-(--text-sm) font-medium text-(--color-text)">
          Buscar
        </label>
        <Input
          id="loyalty-members-search"
          type="search"
          placeholder="Buscar por socio…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        caption="Puntos por socio"
        columns={columns}
        data={filtered}
        rowKey={(m) => m.id}
        loading={isLoading}
        isFiltered={isFiltered}
        onClearFilters={() => setSearch('')}
        emptyTitle="Todavía no hay socios con puntos"
        emptyDescription="Las cuentas de puntos van a aparecer acá cuando exista el backend de fidelización."
      />
    </div>
  );
}

function LevelBadge({ level }: { level: LoyaltyLevel }) {
  if (level === 'Oro') return <Badge tone="warning">Oro</Badge>;
  if (level === 'Plata') return <Badge tone="neutral">Plata</Badge>;
  return (
    <Badge tone="neutral" className={cn('border border-(--color-border-strong) bg-transparent')}>
      Bronce
    </Badge>
  );
}

/** "García, Bruno" -> "GB". Formato del dataset es "Apellido, Nombre". */
function getInitials(fullName: string): string {
  const [lastName = '', firstName = ''] = fullName.split(',').map((p) => p.trim());
  return `${lastName.charAt(0)}${firstName.charAt(0)}`.toUpperCase();
}
