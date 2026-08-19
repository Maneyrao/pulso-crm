'use client';

import * as React from 'react';
import { Fingerprint, MonitorSmartphone, Usb } from 'lucide-react';
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DataTable, StatusBadge } from '@pulso/ui';
import type { DataTableColumn } from '@pulso/ui';
import { PermissionGate } from '@/lib/auth/permissions';
import { getAgentClient } from '@/lib/agent/fake-agent';
import { AGENT_STATUS_LABEL, useAgentStore } from '@/lib/agent/store';
import { DEMO_AGENT_DEVICES, type DemoAgentDevice } from '@/lib/mock/data/devices-demo';
import { EnrollmentDialog } from '@/components/biometrics/EnrollmentDialog';
import { PageHeader } from '@/components/shared/PageHeader';

const DEVICE_STATUS_LABEL: Record<DemoAgentDevice['status'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  ACTIVE: { label: 'Activo', tone: 'success' },
  PENDING_APPROVAL: { label: 'Pendiente de aprobación', tone: 'warning' },
  DISABLED: { label: 'Deshabilitado', tone: 'neutral' },
};

const COLUMNS: DataTableColumn<DemoAgentDevice>[] = [
  { id: 'name', header: 'Agente', cell: (d) => <span className="font-medium text-(--color-text)">{d.name}</span> },
  { id: 'branch', header: 'Sede', cell: (d) => d.branch },
  { id: 'version', header: 'Versión', cell: (d) => <span className="font-mono text-(--text-xs)">{d.agentVersion}</span> },
  { id: 'heartbeat', header: 'Último contacto', cell: (d) => d.lastHeartbeat },
  {
    id: 'status',
    header: 'Estado',
    cell: (d) => {
      const s = DEVICE_STATUS_LABEL[d.status];
      return <StatusBadge tone={s.tone} label={s.label} />;
    },
  },
];

/**
 * Gestión de dispositivos de acceso. La cadena real (Etapa 7-8) es:
 * lector USB DigitalPersona → Pulso Agent (servicio local, WS 127.0.0.1) →
 * este CRM → backend → PostgreSQL. Acá se gestiona el agente de la terminal
 * y se prueba el flujo de enrolamiento con el simulador.
 */
function DevicesPage() {
  const status = useAgentStore((s) => s.status);
  const deviceName = useAgentStore((s) => s.deviceName);
  const [enrollOpen, setEnrollOpen] = React.useState(false);

  const connected = status === 'ready' || status === 'busy';

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        icon={Fingerprint}
        title="Dispositivos"
        description="Agentes locales y lectores de huella conectados al control de acceso."
        mock
      />

      <Alert tone="info" title="Cómo funciona la huella digital">
        El navegador no accede al lector USB: cada terminal corre un agente local que captura la huella y la envía al
        backend, que decide el acceso. Hasta la etapa de biometría podés simular el agente para probar la interfaz.
      </Alert>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4" aria-hidden={true} />
              Agente de esta terminal
            </CardTitle>
            <CardDescription>Estado de la conexión con el servicio local.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-(--text-sm) text-(--color-muted)">Estado</span>
              <StatusBadge
                tone={connected ? 'success' : status === 'connecting' ? 'warning' : 'neutral'}
                label={AGENT_STATUS_LABEL[status]}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-(--text-sm) text-(--color-muted)">Lector</span>
              <span className="flex items-center gap-1.5 text-(--text-sm) text-(--color-text)">
                <Usb className="h-3.5 w-3.5 text-(--color-muted)" aria-hidden={true} />
                {deviceName ?? 'No detectado'}
              </span>
            </div>
            <div className="pt-1">
              {connected ? (
                <Button variant="outline" onClick={() => getAgentClient().disconnect()}>
                  Desconectar agente
                </Button>
              ) : (
                <Button loading={status === 'connecting'} onClick={() => getAgentClient().connect()}>
                  Simular agente conectado
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Fingerprint className="h-4 w-4" aria-hidden={true} />
              Probar enrolamiento
            </CardTitle>
            <CardDescription>Ejercitá el flujo de captura de huella con el lector simulado.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-(--text-sm) text-(--color-muted)">
              Se capturan 4 muestras con control de calidad, igual que con el lector real U.are.U 4500.
            </p>
            <Button variant="outline" disabled={!connected} onClick={() => setEnrollOpen(true)}>
              Iniciar prueba
            </Button>
            {!connected ? (
              <p className="mt-2 text-(--text-xs) text-(--color-muted)">Primero conectá el agente.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-(--text-lg) font-semibold text-(--color-text)">
          Agentes vinculados <Badge tone="neutral">{DEMO_AGENT_DEVICES.length}</Badge>
        </h2>
        <DataTable
          columns={COLUMNS}
          data={[...DEMO_AGENT_DEVICES]}
          rowKey={(d) => d.id}
          caption="Agentes locales vinculados al gimnasio"
          emptyTitle="Sin agentes"
          emptyDescription="Todavía no se vinculó ningún agente local."
        />
      </div>

      <EnrollmentDialog open={enrollOpen} onOpenChange={setEnrollOpen} />
    </div>
  );
}

export default function Page() {
  return (
    <PermissionGate permission="device:manage">
      <DevicesPage />
    </PermissionGate>
  );
}
