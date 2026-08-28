import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealAgentClient } from './real-agent';
import { useAgentStore } from './store';
import type { AgentEvent } from './client';

/**
 * Cliente WS real contra un WebSocket falso: valida que hable el protocolo
 * (envelope v1.0, hello al abrir, ping periódico, parseo con
 * `parseAgentMessageJson`) y que mapee los mensajes del agente a los eventos
 * que consume la UI. La conformidad del protocolo en sí ya la cubren las
 * fixtures compartidas de `@pulso/contracts/agent-protocol`.
 */

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: object | string): void {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
}

function envelope(type: string, payload?: object): object {
  return {
    v: '1.0',
    id: crypto.randomUUID(),
    type,
    ts: new Date().toISOString(),
    ...(payload ? { payload } : {}),
  };
}

let client: RealAgentClient;
let socket: FakeWebSocket;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeWebSocket as unknown as typeof WebSocket);
  FakeWebSocket.instances = [];
  useAgentStore.setState({ status: 'no-agent', deviceName: null });
  client = new RealAgentClient();
  client.connect();
  socket = FakeWebSocket.instances[0]!;
});

afterEach(() => {
  client.disconnect();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RealAgentClient', () => {
  it('al abrir manda hello con envelope v1.0 y luego ping cada 15 s', () => {
    expect(useAgentStore.getState().status).toBe('connecting');
    socket.open();
    const hello = JSON.parse(socket.sent[0]!) as {
      v: string;
      type: string;
      payload: { clientVersion: string };
    };
    expect(hello.v).toBe('1.0');
    expect(hello.type).toBe('hello');
    expect(hello.payload.clientVersion).toContain('pulso-web');

    vi.advanceTimersByTime(15_000);
    const ping = JSON.parse(socket.sent.at(-1)!) as { type: string };
    expect(ping.type).toBe('ping');
  });

  it('hello.ack actualiza el store con el estado y el lector del agente', () => {
    socket.open();
    socket.receive(
      envelope('hello.ack', {
        protocolVersion: '1.0',
        agentVersion: '1.2.0',
        agentState: 'READY',
        tls: true,
        devices: [
          {
            deviceId: crypto.randomUUID(),
            kind: 'FINGERPRINT_READER',
            vendor: 'HID_DIGITALPERSONA',
            model: 'UAREU_4500',
            status: 'ONLINE',
          },
        ],
      }),
    );
    expect(useAgentStore.getState().status).toBe('ready');
    expect(useAgentStore.getState().deviceName).toBe('UAREU_4500');
  });

  it('enrollStart exige los datos de la sesión y emite enroll.progress mapeado', () => {
    socket.open();
    const events: AgentEvent[] = [];
    client.subscribe((e) => events.push(e));

    // Sin deviceToken/enrollmentId no hay operación: error local, nada al WS.
    expect(client.enrollStart({ samplesRequired: 4 })).toBeNull();
    expect(events.at(-1)?.type).toBe('error');

    const opId = client.enrollStart({
      enrollmentId: crypto.randomUUID(),
      deviceToken: 'pdt_x',
      deviceId: crypto.randomUUID(),
      samplesRequired: 4,
      minQuality: 60,
      fingerPosition: 'RIGHT_INDEX',
    });
    expect(opId).not.toBeNull();
    const sentStart = JSON.parse(socket.sent.at(-1)!) as {
      type: string;
      payload: { deviceToken: string };
    };
    expect(sentStart.type).toBe('enroll.start');
    expect(sentStart.payload.deviceToken).toBe('pdt_x');

    socket.receive(
      envelope('enroll.progress', {
        opId,
        captured: 2,
        required: 4,
        lastQuality: 81,
        prompt: 'Otra vez',
      }),
    );
    expect(events.at(-1)).toEqual({
      type: 'enroll.progress',
      payload: { opId, captured: 2, required: 4, quality: 81, prompt: 'Otra vez' },
    });

    socket.receive(
      envelope('enroll.progress', {
        opId,
        captured: 2,
        required: 4,
        lastQuality: 81,
        prompt: 'LIFT_FINGER',
      }),
    );
    expect(events.at(-1)).toEqual({
      type: 'enroll.progress',
      payload: {
        opId,
        captured: 2,
        required: 4,
        quality: 81,
        prompt: 'Retirá el dedo antes de volver a apoyarlo.',
      },
    });

    socket.receive(
      envelope('enroll.progress', {
        opId,
        captured: 2,
        required: 4,
        lastQuality: 35,
        prompt: 'CLEAN_SENSOR',
      }),
    );
    expect(events.at(-1)).toEqual({
      type: 'enroll.progress',
      payload: {
        opId,
        captured: 2,
        required: 4,
        quality: 35,
        prompt: 'Limpiá el lector y apoyá el dedo nuevamente.',
      },
    });
  });

  it('identifyStart envía una lectura de un solo uso, permite detenerla y mapea fallos', () => {
    socket.open();
    const events: AgentEvent[] = [];
    client.subscribe((event) => events.push(event));

    expect(client.identifyStart({} as never)).toBeNull();
    expect(events.at(-1)).toEqual({
      type: 'error',
      payload: { code: 'INVALID_OPERATION', opId: null },
    });

    const deviceId = crypto.randomUUID();
    const branchId = crypto.randomUUID();
    const opId = client.identifyStart({
      deviceToken: 'pdt_identify',
      deviceId,
      branchId,
      minQuality: 65,
    });
    expect(opId).not.toBeNull();

    const sentStart = JSON.parse(socket.sent.at(-1)!) as {
      type: string;
      payload: Record<string, unknown>;
    };
    expect(sentStart).toMatchObject({
      type: 'identify.start',
      payload: {
        opId,
        deviceToken: 'pdt_identify',
        deviceId,
        branchId,
        minQuality: 65,
        continuous: false,
      },
    });

    socket.receive(envelope('identify.failed', { opId, code: 'QUALITY_TOO_LOW' }));
    expect(events.at(-1)).toEqual({
      type: 'identify.failed',
      payload: { opId, code: 'QUALITY_TOO_LOW' },
    });

    client.identifyStop(opId!);
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      type: 'identify.stop',
      payload: { opId },
    });
  });

  it('una versión mayor incompatible cierra la conexión (shouldClose)', () => {
    socket.open();
    socket.receive({ v: '2.0', id: 'x', type: 'ping', ts: new Date().toISOString() });
    expect(socket.closed).toBe(true);
  });

  it('un mensaje malformado se ignora sin romper la conexión', () => {
    socket.open();
    socket.receive('{esto no es json');
    expect(socket.closed).toBe(false);
    expect(useAgentStore.getState().status).toBe('connecting');
  });
});
