'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { Trash2, UserMinus, UserX } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import {
  NO_ATTENDANCE_MEMBERS,
  OVERDUE_MEMBERS,
  getInactiveMembersCount,
  type InactiveMember,
} from '@/lib/mock/data/members-demo';

type TabValue = 'debt' | 'no-attendance';

/**
 * Baja de socios (demo, sin backend todavía). La acción "dar de baja" no
 * hace nada real: sólo limpia la selección y avisa por toast que el módulo
 * todavía no tiene backend (regla del brief: nada de rutas/API que no existan).
 */
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
  const { data, isLoading } = useMockData(() => ({
    overdue: OVERDUE_MEMBERS,
    noAttendance: NO_ATTENDANCE_MEMBERS,
    total: getInactiveMembersCount(),
  }));

  const [tab, setTab] = React.useState<TabValue>('debt');
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [pendingIds, setPendingIds] = React.useState<readonly string[]>([]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const currentItems: readonly InactiveMember[] = React.useMemo(() => {
    if (!data) return [];
    return tab === 'debt' ? data.overdue : data.noAttendance;
  }, [data, tab]);

  const selectedInTab = currentItems.filter((member) => selected.has(member.id));
  const allSelectedInTab = currentItems.length > 0 && currentItems.every((member) => selected.has(member.id));

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
      if (allSelectedInTab) {
        for (const member of currentItems) next.delete(member.id);
      } else {
        for (const member of currentItems) next.add(member.id);
      }
      return next;
    });
  };

  const openConfirm = (ids: readonly string[]) => {
    setPendingIds(ids);
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    setConfirmOpen(false);
    toast({
      tone: 'info',
      title: 'Función disponible cuando el módulo tenga backend',
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of pendingIds) next.delete(id);
      return next;
    });
    setPendingIds([]);
  };

  const columns: DataTableColumn<InactiveMember>[] = [
    {
      id: 'select',
      header: '',
      cell: (member) => (
        <Checkbox
          checked={selected.has(member.id)}
          onChange={() => toggleOne(member.id)}
          aria-label={`Seleccionar a ${member.name}`}
        />
      ),
      cellClassName: 'w-10',
    },
    {
      id: 'member',
      header: 'Socio',
      cell: (member) => (
        <div className="flex flex-col">
          <span className="font-medium text-(--color-text)">{member.name}</span>
          <span className="text-(--text-xs) text-(--color-muted)">{member.email}</span>
        </div>
      ),
    },
    {
      id: 'dni',
      header: 'DNI',
      cell: (member) => <span className="tabular-nums">{member.dni}</span>,
    },
    {
      id: 'membership',
      header: 'Membresía',
      cell: (member) => (
        <Badge tone="neutral" className="border border-(--color-border-strong) bg-transparent text-(--color-text)">
          {member.membership}
        </Badge>
      ),
    },
    {
      id: 'dueDate',
      header: 'Vencimiento',
      cell: (member) => <span className="tabular-nums">{format(parseISO(member.dueDate), 'dd/MM/yyyy')}</span>,
    },
    {
      id: 'daysOverdue',
      header: 'Días de retraso',
      cell: (member) => (
        <span className="inline-flex items-center gap-1 font-medium text-(--color-danger)">
          <UserX className="h-4 w-4" aria-hidden="true" />
          {member.daysOverdue} días
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (member) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            title="Dar de baja"
            aria-label={`Dar de baja a ${member.name}`}
            onClick={() => openConfirm([member.id])}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
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
        description="Socios con cuotas vencidas hace más de 45 días o sin asistir hace más de 30 días."
        mock
        actions={<Badge tone="neutral">{data ? data.total : '—'} socios</Badge>}
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
        <TabsList>
          <TabsTrigger value="debt">Con cuota vencida</TabsTrigger>
          <TabsTrigger value="no-attendance">Sin asistencias</TabsTrigger>
        </TabsList>

        {selectedInTab.length > 0 ? (
          <div className="mt-3 flex items-center justify-between rounded-(--radius-md) border border-(--color-border) bg-(--color-muted-subtle) px-4 py-2.5">
            <span className="text-(--text-sm) text-(--color-text)">
              {selectedInTab.length} socio{selectedInTab.length === 1 ? '' : 's'} seleccionado
              {selectedInTab.length === 1 ? '' : 's'}
            </span>
            <Button variant="danger" size="sm" onClick={() => openConfirm(selectedInTab.map((member) => member.id))}>
              Dar de baja {selectedInTab.length} socios
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 px-1">
            <Checkbox
              checked={allSelectedInTab}
              onChange={toggleAll}
              aria-label="Seleccionar todos los socios visibles"
              disabled={currentItems.length === 0}
            />
            <span className="text-(--text-sm) text-(--color-muted)">Seleccionar todos</span>
          </div>
        )}

        <TabsContent value="debt">
          <DataTable
            caption="Socios con cuota vencida"
            columns={columns}
            data={data?.overdue ?? []}
            rowKey={(member) => member.id}
            loading={isLoading}
            emptyTitle="Ningún socio con cuota vencida"
            emptyDescription="Cuando alguien acumule más de 45 días de atraso va a aparecer acá."
          />
        </TabsContent>
        <TabsContent value="no-attendance">
          <DataTable
            caption="Socios sin asistencias recientes"
            columns={columns}
            data={data?.noAttendance ?? []}
            rowKey={(member) => member.id}
            loading={isLoading}
            emptyTitle="Ningún socio sin asistir hace más de 30 días"
            emptyDescription="Cuando alguien deje de asistir va a aparecer acá."
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={pendingIds.length === 1 ? 'Dar de baja a este socio' : `Dar de baja a ${pendingIds.length} socios`}
        description="Esta acción todavía no está conectada a un backend: es una demostración de la interfaz."
        confirmLabel="Dar de baja"
        tone="danger"
        onConfirm={handleConfirm}
      />
    </div>
  );
}
