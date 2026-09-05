'use client';

import { usePathname } from 'next/navigation';
import { Fingerprint } from 'lucide-react';
import { cn } from '@pulso/ui';
import { AGENT_STATUS_LABEL, useAgentStore, type AgentStatus } from '@/lib/agent/store';

/** Rutas operativas donde el estado del hardware de acceso es relevante. */
const HARDWARE_ROUTES = ['/access', '/schedule/reservations', '/settings/devices'];

const STATUS_TONE: Record<AgentStatus, string> = {
  'no-agent': 'text-(--color-muted)',
  connecting: 'text-(--color-warning)',
  ready: 'text-(--color-success)',
  'no-device': 'text-(--color-danger)',
  busy: 'text-(--color-info)',
  'backend-down': 'text-(--color-danger)',
};

/**
 * Pie fijo del área autenticada. En pantallas de operación de acceso muestra
 * además el estado del agente biométrico local (integración real en Etapa
 * 7-8, ver docs/biometrics/; hasta entonces lo alimenta el simulador).
 */
export function AppFooter() {
  const pathname = usePathname();
  const status = useAgentStore((s) => s.status);
  const deviceName = useAgentStore((s) => s.deviceName);
  const showHardware = HARDWARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  return (
    <footer className="flex h-10 shrink-0 items-center justify-between gap-4 border-t border-(--color-border) bg-(--color-surface) px-4 text-(length:--text-xs) text-(--color-muted)">
      <span>© {new Date().getFullYear()} El Templo</span>
      {showHardware ? (
        <span className="flex items-center gap-1.5">
          <Fingerprint className="h-3.5 w-3.5" aria-hidden={true} />
          <span>{deviceName ?? 'Lector de huella'}:</span>
          <span className={cn('font-medium', STATUS_TONE[status])}>
            {AGENT_STATUS_LABEL[status]}
          </span>
        </span>
      ) : null}
    </footer>
  );
}
