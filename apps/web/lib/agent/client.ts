'use client';

/**
 * Superficie única del cliente del Pulso Agent que conoce la UI.
 *
 * En producción `getAgentClient()` devuelve el cliente WebSocket real
 * (`real-agent.ts`, protocolo de docs/biometrics/WEBSOCKET_PROTOCOL.md).
 * Los tests inyectan el simulador (`fake-agent.ts`) con `setAgentClient()`.
 */

export type AgentEvent =
  | { type: 'hello.ack'; payload: { agentVersion: string; deviceName: string | null } }
  | { type: 'device.connected'; payload: { deviceName: string } }
  | { type: 'device.disconnected'; payload: { reason: string } }
  | { type: 'enroll.progress'; payload: { opId: string; captured: number; required: number; quality: number | null; warning?: string; prompt: string } }
  | { type: 'enroll.completed'; payload: { opId: string; finalQuality: number } }
  | { type: 'enroll.failed'; payload: { opId: string; code: string } }
  | { type: 'identify.captured'; payload: { opId: string; quality: number } }
  | { type: 'identify.sent'; payload: { opId: string } }
  | { type: 'identify.failed'; payload: { opId: string; code: string } }
  | { type: 'operation.cancelled'; payload: { opId: string; reason: string } }
  | { type: 'error'; payload: { code: string; opId: string | null } };

export interface EnrollStartOptions {
  samplesRequired?: number;
  /** Los cuatro siguientes son OBLIGATORIOS con el agente real (el fake los ignora). */
  enrollmentId?: string;
  /** De un solo uso; vive sólo lo que dura la operación. Nunca se persiste. */
  deviceToken?: string;
  deviceId?: string;
  minQuality?: number;
  fingerPosition?: string;
}

export interface IdentifyStartOptions {
  /** Token IDENTIFY de un solo uso emitido inmediatamente antes de capturar. */
  deviceToken: string;
  deviceId: string;
  branchId: string;
  minQuality?: number;
  continuous?: boolean;
}

export interface AgentClient {
  connect(): void;
  disconnect(): void;
  enrollStart(opts: EnrollStartOptions): string | null;
  identifyStart(opts: IdentifyStartOptions): string | null;
  identifyStop(opId: string): void;
  cancel(opId: string): void;
  subscribe(listener: (event: AgentEvent) => void): () => void;
  readonly connected: boolean;
}

let instance: AgentClient | null = null;
let factory: (() => AgentClient) | null = null;

/** `real-agent.ts` se registra acá al importarse; los tests registran el fake. */
export function registerAgentClientFactory(f: () => AgentClient): void {
  factory = f;
}

/** Tests: inyecta el simulador directamente. Producción: no llamar. */
export function setAgentClient(client: AgentClient | null): void {
  instance = client;
}

export function getAgentClient(): AgentClient {
  if (!instance) {
    if (!factory) {
      throw new Error('No hay cliente de agente registrado. Importá lib/agent (index) o inyectá uno con setAgentClient().');
    }
    instance = factory();
  }
  return instance;
}
