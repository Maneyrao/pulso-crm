'use client';

import { parseAgentMessageJson, type AgentParsedMessage } from '@pulso/contracts/agent-protocol';
import {
  registerAgentClientFactory,
  type AgentClient,
  type AgentEvent,
  type EnrollStartOptions,
  type IdentifyStartOptions,
} from './client';
import { useAgentStore, type AgentStatus } from './store';

/**
 * Cliente WebSocket real del Pulso Agent (docs/biometrics/WEBSOCKET_PROTOCOL.md).
 *
 * - `wss://127.0.0.1:21987/agent/v1` (override: NEXT_PUBLIC_AGENT_WS_URL).
 * - Todo mensaje entrante pasa por `parseAgentMessageJson` (el mismo espejo
 *   Zod que valida las fixtures compartidas con el lado C#).
 * - hello → hello.ack al abrir; ping cada 15 s; reconexión con backoff
 *   exponencial + jitter.
 * - El `deviceToken` viaja en el payload de `enroll.start` y muere ahí:
 *   nunca se guarda en estado, storage ni logs.
 */

const WS_URL = process.env['NEXT_PUBLIC_AGENT_WS_URL'] ?? 'wss://127.0.0.1:21987/agent/v1';
const PING_INTERVAL_MS = 15_000;
const RECONNECT_MAX_MS = 30_000;

/** AgentState del agente (Pulso.Agent.Core) → estado de la UI. */
const STATE_MAP: Record<string, AgentStatus> = {
  Ready: 'ready',
  NoDevice: 'no-device',
  Busy: 'busy',
  BackendDown: 'backend-down',
  NotConfigured: 'no-agent',
  PendingApproval: 'no-agent',
  Disabled: 'no-agent',
};

interface StatusLike {
  agentVersion?: string;
  agentState?: string;
  devices?: Array<{ model?: string | null; deviceId?: string }>;
}

export class RealAgentClient implements AgentClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<(event: AgentEvent) => void>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private manualClose = false;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.manualClose = false;
    useAgentStore.getState().setStatus('connecting');

    let socket: WebSocket;
    try {
      socket = new WebSocket(WS_URL);
    } catch {
      useAgentStore.getState().setStatus('no-agent');
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.send('hello', { clientVersion: 'pulso-web/1.0.0', userAgent: navigator.userAgent });
      this.pingTimer = setInterval(() => this.send('ping'), PING_INTERVAL_MS);
    };

    socket.onmessage = (raw: MessageEvent) => {
      const result = parseAgentMessageJson(String(raw.data));
      if (!result.success) {
        if (result.shouldClose) socket.close();
        return;
      }
      this.handle(result.message);
    };

    socket.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      this.ws = null;
      useAgentStore.getState().setStatus('no-agent', null);
      if (!this.manualClose) this.scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose llega igual después; ahí se decide la reconexión.
    };
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws?.close();
  }

  enrollStart(opts: EnrollStartOptions): string | null {
    if (!this.connected) return null;
    if (!opts.enrollmentId || !opts.deviceToken || !opts.deviceId) {
      this.emit({ type: 'error', payload: { code: 'INVALID_OPERATION', opId: null } });
      return null;
    }
    const opId = crypto.randomUUID();
    this.send('enroll.start', {
      opId,
      enrollmentId: opts.enrollmentId,
      deviceToken: opts.deviceToken,
      deviceId: opts.deviceId,
      samplesRequired: opts.samplesRequired ?? 4,
      minQuality: opts.minQuality ?? 60,
      fingerPosition: opts.fingerPosition ?? null,
    });
    return opId;
  }

  identifyStart(opts: IdentifyStartOptions): string | null {
    if (!this.connected) return null;
    if (!opts.deviceToken || !opts.deviceId || !opts.branchId) {
      this.emit({ type: 'error', payload: { code: 'INVALID_OPERATION', opId: null } });
      return null;
    }
    const opId = crypto.randomUUID();
    this.send('identify.start', {
      opId,
      deviceToken: opts.deviceToken,
      deviceId: opts.deviceId,
      branchId: opts.branchId,
      minQuality: opts.minQuality ?? 60,
      continuous: opts.continuous ?? false,
      idleTimeoutMs: 300_000,
    });
    return opId;
  }

  identifyStop(opId: string): void {
    this.send('identify.stop', { opId });
  }

  cancel(opId: string): void {
    this.send('operation.cancel', { opId, reason: 'user_cancelled' });
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Internos ──────────────────────────────────────────────────────────

  private handle(message: AgentParsedMessage): void {
    const payload = (message.payload ?? {}) as Record<string, unknown>;
    switch (message.type) {
      case 'hello.ack':
      case 'status': {
        const status = payload as StatusLike;
        const deviceName = status.devices?.[0]?.model ?? null;
        useAgentStore.getState().setStatus(STATE_MAP[status.agentState ?? ''] ?? 'connecting', deviceName);
        this.emit({
          type: 'hello.ack',
          payload: { agentVersion: status.agentVersion ?? '', deviceName },
        });
        break;
      }
      case 'device.connected':
        useAgentStore.getState().setStatus('ready', (payload['model'] as string | null) ?? null);
        this.emit({ type: 'device.connected', payload: { deviceName: (payload['model'] as string) ?? 'Lector' } });
        break;
      case 'device.disconnected':
        useAgentStore.getState().setStatus('no-device');
        this.emit({ type: 'device.disconnected', payload: { reason: (payload['reason'] as string) ?? '' } });
        break;
      case 'enroll.progress':
        this.emit({
          type: 'enroll.progress',
          payload: {
            opId: payload['opId'] as string,
            captured: payload['captured'] as number,
            required: payload['required'] as number,
            quality: (payload['lastQuality'] as number | null) ?? null,
            ...(payload['warning'] ? { warning: payload['warning'] as string } : {}),
            prompt: (payload['prompt'] as string) ?? 'Apoyá el dedo en el lector',
          },
        });
        break;
      case 'enroll.completed':
        this.emit({
          type: 'enroll.completed',
          payload: { opId: payload['opId'] as string, finalQuality: payload['finalQuality'] as number },
        });
        break;
      case 'enroll.failed':
        this.emit({
          type: 'enroll.failed',
          payload: { opId: payload['opId'] as string, code: (payload['code'] as string) ?? 'UNKNOWN' },
        });
        break;
      case 'identify.captured':
        this.emit({
          type: 'identify.captured',
          payload: { opId: payload['opId'] as string, quality: (payload['quality'] as number) ?? 0 },
        });
        break;
      case 'identify.sent':
        this.emit({ type: 'identify.sent', payload: { opId: payload['opId'] as string } });
        break;
      case 'identify.failed':
        this.emit({
          type: 'identify.failed',
          payload: { opId: payload['opId'] as string, code: (payload['code'] as string) ?? 'UNKNOWN' },
        });
        break;
      case 'operation.cancelled':
        this.emit({
          type: 'operation.cancelled',
          payload: { opId: payload['opId'] as string, reason: (payload['reason'] as string) ?? '' },
        });
        break;
      case 'error':
        this.emit({
          type: 'error',
          payload: { code: (payload['code'] as string) ?? 'UNKNOWN', opId: (payload['opId'] as string | null) ?? null },
        });
        break;
      default:
        // pong y demás: nada que hacer.
        break;
    }
  }

  private send(type: string, payload?: Record<string, unknown>): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        v: '1.0',
        id: crypto.randomUUID(),
        type,
        ts: new Date().toISOString(),
        ...(payload ? { payload } : {}),
      }),
    );
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.attempts += 1;
    const base = Math.min(RECONNECT_MAX_MS, 1000 * 2 ** this.attempts);
    const delay = base + Math.random() * 500;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

registerAgentClientFactory(() => new RealAgentClient());
