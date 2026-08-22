'use client';

import { useAgentStore } from './store';

/**
 * Simulador del Pulso Agent (docs/biometrics/WEBSOCKET_PROTOCOL.md).
 *
 * Implementa la MISMA superficie de eventos que tendrá el cliente WebSocket
 * real (`ws://127.0.0.1:21987`), pero con timers en memoria. Cuando la Etapa
 * 7-8 traiga el agente de verdad, se reemplaza esta clase por una que hable
 * WS y la UI no cambia: los componentes solo conocen `AgentClient`.
 *
 * Reglas del protocolo que sí se respetan acá:
 * - una sola operación de hardware a la vez (`AGENT_BUSY`),
 * - enrolamiento por muestras con calidad variable y reintento por
 *   `LOW_QUALITY`,
 * - cancelación explícita con `operation.cancelled`.
 */

import type { AgentClient, AgentEvent, EnrollStartOptions } from './client';

export type { AgentClient, AgentEvent } from './client';

const DEVICE_NAME = 'U.are.U 4500';

/** Calidades deterministas por muestra: la 2.ª falla para ejercitar el reintento. */
const SAMPLE_QUALITIES = [72, 38, 81, 77, 86, 90];

class FakeAgentClient implements AgentClient {
  private listeners = new Set<(event: AgentEvent) => void>();
  private timers: number[] = [];
  private activeOpId: string | null = null;
  private opCounter = 0;
  connected = false;

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AgentEvent): void {
    for (const l of this.listeners) l(event);
  }

  private schedule(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  connect(): void {
    if (this.connected) return;
    useAgentStore.getState().setStatus('connecting', null);
    this.schedule(() => {
      this.connected = true;
      this.emit({ type: 'hello.ack', payload: { agentVersion: '0.0.0-demo', deviceName: DEVICE_NAME } });
      this.emit({ type: 'device.connected', payload: { deviceName: DEVICE_NAME } });
      useAgentStore.getState().setStatus('ready', DEVICE_NAME);
    }, 700);
  }

  disconnect(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    if (this.activeOpId) {
      this.emit({ type: 'operation.cancelled', payload: { opId: this.activeOpId, reason: 'AGENT_DISCONNECTED' } });
      this.activeOpId = null;
    }
    this.connected = false;
    this.emit({ type: 'device.disconnected', payload: { reason: 'AGENT_STOPPED' } });
    useAgentStore.getState().setStatus('no-agent', null);
  }

  enrollStart({ samplesRequired = 4 }: EnrollStartOptions): string | null {
    if (!this.connected) {
      this.emit({ type: 'error', payload: { code: 'NO_DEVICE', opId: null } });
      return null;
    }
    if (this.activeOpId) {
      this.emit({ type: 'error', payload: { code: 'AGENT_BUSY', opId: this.activeOpId } });
      return null;
    }
    const opId = `op-${++this.opCounter}`;
    this.activeOpId = opId;
    useAgentStore.getState().setStatus('busy');

    let captured = 0;
    let sampleIndex = 0;

    const step = () => {
      if (this.activeOpId !== opId) return;
      const quality = SAMPLE_QUALITIES[sampleIndex % SAMPLE_QUALITIES.length] ?? 70;
      sampleIndex += 1;
      if (quality < 45) {
        this.emit({
          type: 'enroll.progress',
          payload: {
            opId,
            captured,
            required: samplesRequired,
            quality,
            warning: 'LOW_QUALITY',
            prompt: 'Calidad insuficiente: apoyá el dedo firme y de nuevo.',
          },
        });
      } else {
        captured += 1;
        this.emit({
          type: 'enroll.progress',
          payload: {
            opId,
            captured,
            required: samplesRequired,
            quality,
            prompt:
              captured >= samplesRequired
                ? 'Procesando template…'
                : `Muestra ${captured} de ${samplesRequired} capturada. Levantá y volvé a apoyar el dedo.`,
          },
        });
      }
      if (captured >= samplesRequired) {
        this.schedule(() => {
          if (this.activeOpId !== opId) return;
          this.activeOpId = null;
          useAgentStore.getState().setStatus('ready');
          this.emit({ type: 'enroll.completed', payload: { opId, finalQuality: 84 } });
        }, 900);
      } else {
        this.schedule(step, 1300);
      }
    };

    this.emit({
      type: 'enroll.progress',
      payload: { opId, captured: 0, required: samplesRequired, quality: null, prompt: 'Apoyá el dedo en el lector.' },
    });
    this.schedule(step, 1200);
    return opId;
  }

  cancel(opId: string): void {
    if (this.activeOpId !== opId) return;
    this.activeOpId = null;
    useAgentStore.getState().setStatus(this.connected ? 'ready' : 'no-agent');
    this.emit({ type: 'operation.cancelled', payload: { opId, reason: 'USER_CANCELLED' } });
  }
}

/** Singleton por pestaña, como la conexión WS real (una por vez, §4.2). */
let instance: FakeAgentClient | null = null;

export function getAgentClient(): AgentClient {
  if (!instance) instance = new FakeAgentClient();
  return instance;
}
