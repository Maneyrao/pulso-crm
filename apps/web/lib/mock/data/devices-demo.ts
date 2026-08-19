/** Agentes locales vinculados (demo). El modelo real es `AgentDevice`
 * (docs/CONTROLFIT_PARITY_AUDIT.md §5), Etapa 7-8. */
export interface DemoAgentDevice {
  id: string;
  name: string;
  branch: string;
  agentVersion: string;
  lastHeartbeat: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL' | 'DISABLED';
}

export const DEMO_AGENT_DEVICES: readonly DemoAgentDevice[] = [
  {
    id: 'agent-1',
    name: 'Recepción PC-01',
    branch: 'Sede Central',
    agentVersion: '0.0.0-demo',
    lastHeartbeat: 'hace 12 segundos',
    status: 'ACTIVE',
  },
  {
    id: 'agent-2',
    name: 'Recepción PC-02',
    branch: 'Sede Norte',
    agentVersion: '0.0.0-demo',
    lastHeartbeat: 'hace 3 minutos',
    status: 'PENDING_APPROVAL',
  },
  {
    id: 'agent-3',
    name: 'Terminal autoservicio',
    branch: 'Sede Central',
    agentVersion: '0.0.0-demo',
    lastHeartbeat: 'hace 2 días',
    status: 'DISABLED',
  },
] as const;
