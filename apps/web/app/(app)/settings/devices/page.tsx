'use client';

import * as React from 'react';
import { MonitorSmartphone, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessDevice, LocalAgent } from '@pulso/contracts/biometrics';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  FormField,
  Input,
  Modal,
  StatusBadge,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PermissionGate } from '@/lib/auth/permissions';
import { getAgentClient, AGENT_STATUS_LABEL, useAgentStore } from '@/lib/agent';
import { approveAgent, createAgent, listAgents, listDevices, revokeAgent } from '@/lib/api/biometrics';
import { ApiError } from '@/lib/api/errors';
import { useSessionStore } from '@/lib/stores/session';
import { PageHeader } from '@/components/shared/PageHeader';

const AGENT_STATUS_BADGE: Record<LocalAgent['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  ACTIVE: { label: 'Activo', tone: 'success' },
  PENDING_APPROVAL: { label: 'Pendiente de aprobación', tone: 'warning' },
  DISABLED: { label: 'Deshabilitado', tone: 'neutral' },
  REVOKED: { label: 'Revocado', tone: 'danger' },
};

const DEVICE_STATUS_BADGE: Record<AccessDevice['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  ONLINE: { label: 'En línea', tone: 'success' },
  OFFLINE: { label: 'Sin conexión', tone: 'neutral' },
  ERROR: { label: 'Error', tone: 'danger' },
  DISABLED: { label: 'Deshabilitado', tone: 'neutral' },
};

/**
 * Configuración → Dispositivos: agentes locales reales (API §10) + estado en
 * vivo del Pulso Agent de ESTA PC vía WebSocket local. El secreto de pareo se
 * muestra UNA sola vez al crear el agente y no queda en ningún estado.
 */
export default function DevicesPage() {
  return (
    <PermissionGate permission="device:manage" fallback={null}>
      <DevicesScreen />
    </PermissionGate>
  );
}

function DevicesScreen() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const status = useAgentStore((s) => s.status);
  const deviceName = useAgentStore((s) => s.deviceName);
  const branches = useSessionStore((s) => s.branches);
  const activeBranchId = useSessionStore((s) => s.activeBranchId);

  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: () => listAgents() });
  const devicesQuery = useQuery({ queryKey: ['devices'], queryFn: () => listDevices() });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [pairing, setPairing] = React.useState<{ secret: string; installationId: string } | null>(null);
  const [toRevoke, setToRevoke] = React.useState<LocalAgent | null>(null);
  const [revokeReason, setRevokeReason] = React.useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['agents'] });
    void queryClient.invalidateQueries({ queryKey: ['devices'] });
  };

  const createMutation = useMutation({
    mutationFn: () => createAgent({ branchId: activeBranchId ?? branches[0]!.id, name }),
    onSuccess: (res) => {
      setPairing({ secret: res.pairingSecret, installationId: res.agent.installationId });
      setName('');
      invalidate();
    },
    onError: (err) => toast({ title: 'No se pudo crear el agente', description: err instanceof ApiError ? err.message : undefined, tone: 'danger' }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAgent(id),
    onSuccess: () => {
      toast({ title: 'Agente aprobado', tone: 'success' });
      invalidate();
    },
    onError: (err) => toast({ title: 'No se pudo aprobar', description: err instanceof ApiError ? err.message : undefined, tone: 'danger' }),
  });

  const revokeMutation = useMutation({
    mutationFn: (input: { id: string; reason: string }) => revokeAgent(input.id, { reason: input.reason }),
    onSuccess: () => {
      toast({ title: 'Agente revocado', description: 'Sus tokens en curso quedaron invalidados.', tone: 'success' });
      setToRevoke(null);
      setRevokeReason('');
      invalidate();
    },
    onError: (err) => toast({ title: 'No se pudo revocar', description: err instanceof ApiError ? err.message : undefined, tone: 'danger' }),
  });

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';

  const agentColumns: DataTableColumn<LocalAgent>[] = [
    { id: 'name', header: 'Agente', cell: (a) => <span className="font-medium text-(--color-text)">{a.name}</span> },
    { id: 'branch', header: 'Sede', cell: (a) => branchName(a.branchId) },
    { id: 'version', header: 'Versión', cell: (a) => <span className="font-mono text-(--text-xs)">{a.agentVersion ?? '—'}</span> },
    {
      id: 'lastSeen',
      header: 'Último contacto',
      cell: (a) => (a.lastSeenAt ? new Date(a.lastSeenAt).toLocaleString('es-AR') : 'Nunca'),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (a) => {
        const s = AGENT_STATUS_BADGE[a.status];
        return <StatusBadge tone={s.tone} label={s.label} />;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (a) => (
        <div className="flex justify-end gap-2">
          {a.status === 'PENDING_APPROVAL' ? (
            <Button size="sm" onClick={() => approveMutation.mutate(a.id)}>
              Aprobar
            </Button>
          ) : null}
          {a.status !== 'REVOKED' ? (
            <Button size="sm" variant="outline" onClick={() => setToRevoke(a)}>
              Revocar
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const deviceColumns: DataTableColumn<AccessDevice>[] = [
    { id: 'model', header: 'Lector', cell: (d) => <span className="font-medium text-(--color-text)">{d.model}</span> },
    { id: 'branch', header: 'Sede', cell: (d) => branchName(d.branchId) },
    { id: 'serial', header: 'Serie', cell: (d) => <span className="font-mono text-(--text-xs)">{d.serialNumber ?? '—'}</span> },
    {
      id: 'status',
      header: 'Estado',
      cell: (d) => {
        const s = DEVICE_STATUS_BADGE[d.status];
        return <StatusBadge tone={s.tone} label={s.label} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispositivos"
        description="Agentes locales de biometría y lectores de huella por sede."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden={true} /> Nuevo agente
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5" aria-hidden={true} /> Agente de esta PC
          </CardTitle>
          <CardDescription>
            Conexión WebSocket local (wss://127.0.0.1:21987). {deviceName ? `Lector: ${deviceName}.` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <StatusBadge tone={status === 'ready' ? 'success' : status === 'no-agent' ? 'neutral' : 'warning'} label={AGENT_STATUS_LABEL[status]} />
          {status === 'no-agent' ? (
            <Button size="sm" loading={false} onClick={() => getAgentClient().connect()}>
              Conectar
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => getAgentClient().disconnect()}>
              Desconectar
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agentes vinculados</CardTitle>
          <CardDescription>Un agente por PC de recepción. La revocación invalida sus tokens al instante.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable<LocalAgent>
            caption="Agentes locales vinculados"
            columns={agentColumns}
            data={agentsQuery.data?.data ?? []}
            rowKey={(a) => a.id}
            loading={agentsQuery.isLoading}
            emptyTitle="Sin agentes"
            emptyDescription="Creá un agente y pareá la PC de recepción con el secreto de un solo uso."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lectores</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable<AccessDevice>
            caption="Lectores de huella"
            columns={deviceColumns}
            data={devicesQuery.data?.data ?? []}
            rowKey={(d) => d.id}
            loading={devicesQuery.isLoading}
            emptyTitle="Sin lectores"
            emptyDescription="Los lectores aparecen cuando el agente de la sede se aprueba y reporta su hardware."
          />
        </CardContent>
      </Card>

      <Modal
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) setPairing(null);
        }}
        title={pairing ? 'Secreto de pareo' : 'Nuevo agente'}
        size="md"
      >
        {pairing ? (
          <div className="space-y-4">
            <Alert tone="warning" title="Se muestra una sola vez">
              Copiá estos valores en la instalación de El Templo Agent. Al cerrar este diálogo no se pueden recuperar.
            </Alert>
            <FormField label="Installation ID">
              {(field) => <Input {...field} readOnly={true} value={pairing.installationId} />}
            </FormField>
            <FormField label="Secreto de pareo">
              {(field) => <Input {...field} readOnly={true} value={pairing.secret} />}
            </FormField>
            <div className="flex justify-end">
              <Button onClick={() => { setCreateOpen(false); setPairing(null); }}>Listo</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <FormField label="Nombre" required>
              {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Recepción principal" />}
            </FormField>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button loading={createMutation.isPending} disabled={name.trim().length < 2} onClick={() => createMutation.mutate()}>
                Crear agente
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={toRevoke !== null}
        onOpenChange={(next) => !next && setToRevoke(null)}
        title={`Revocar ${toRevoke?.name ?? ''}`}
        description="El agente deja de operar y sus tokens en curso se invalidan. Esta acción no se deshace."
        size="sm"
      >
        <div className="space-y-4">
          <FormField label="Motivo" required>
            {(field) => <Input {...field} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="PC dada de baja" />}
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setToRevoke(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={revokeMutation.isPending}
              disabled={revokeReason.trim().length < 5}
              onClick={() => toRevoke && revokeMutation.mutate({ id: toRevoke.id, reason: revokeReason })}
            >
              Revocar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
