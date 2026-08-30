import { create } from 'zustand';

/**
 * Estado del agente biométrico local (Pulso Agent, docs/biometrics/
 * LOCAL_AGENT_ARCHITECTURE.md §6). Hasta la Etapa 7-8 no hay agente real:
 * el estado por defecto es `no-agent` y el simulador de demostración
 * (`lib/agent/fake-agent.ts`) puede llevarlo a los demás estados para
 * ejercitar la UI de enrolamiento e identificación.
 */
export type AgentStatus =
  'no-agent' | 'connecting' | 'ready' | 'no-device' | 'busy' | 'backend-down';

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  'no-agent': 'Sin agente',
  connecting: 'Conectando…',
  ready: 'Conectado',
  'no-device': 'Lector desconectado',
  busy: 'Operación en curso',
  'backend-down': 'Sin conexión',
};

interface AgentState {
  status: AgentStatus;
  /** Nombre del lector reportado por el agente (ej. "U.are.U 4500"). */
  deviceName: string | null;
  setStatus: (status: AgentStatus, deviceName?: string | null) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  status: 'no-agent',
  deviceName: null,
  setStatus: (status, deviceName) =>
    set((prev) => ({
      status,
      deviceName: deviceName === undefined ? prev.deviceName : deviceName,
    })),
}));
