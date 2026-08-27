import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El simulador debe respetar las reglas del protocolo real
 * (docs/biometrics/WEBSOCKET_PROTOCOL.md): conexión → ready, enrolamiento por
 * muestras con al menos un reintento LOW_QUALITY, una sola operación a la vez
 * (AGENT_BUSY) y cancelación con `operation.cancelled`. Si estas reglas se
 * rompen acá, la UI se va a portar distinto con el agente de verdad.
 */

// Estado de módulo fresco por test: el cliente es singleton.
async function freshClient() {
  vi.resetModules();
  const { getAgentClient } = await import('./fake-agent');
  const { useAgentStore } = await import('./store');
  useAgentStore.setState({ status: 'no-agent', deviceName: null });
  return { client: getAgentClient(), useAgentStore };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FakeAgent', () => {
  it('connect lleva el store a ready con el nombre del lector', async () => {
    const { client, useAgentStore } = await freshClient();
    client.connect();
    expect(useAgentStore.getState().status).toBe('connecting');
    vi.advanceTimersByTime(800);
    expect(useAgentStore.getState().status).toBe('ready');
    expect(useAgentStore.getState().deviceName).toBe('U.are.U 4500');
  });

  it('enrolamiento: 4 muestras, al menos un LOW_QUALITY, y enroll.completed', async () => {
    const { client } = await freshClient();
    client.connect();
    vi.advanceTimersByTime(800);

    const events: string[] = [];
    let warnings = 0;
    let completed = false;
    client.subscribe((e) => {
      events.push(e.type);
      if (e.type === 'enroll.progress' && e.payload.warning === 'LOW_QUALITY') warnings += 1;
      if (e.type === 'enroll.completed') completed = true;
    });

    const opId = client.enrollStart({ samplesRequired: 4 });
    expect(opId).not.toBeNull();
    vi.advanceTimersByTime(60_000);

    expect(completed).toBe(true);
    expect(warnings).toBeGreaterThanOrEqual(1);
    expect(events.filter((t) => t === 'enroll.progress').length).toBeGreaterThanOrEqual(5);
  });

  it('una sola operación a la vez: la segunda recibe AGENT_BUSY', async () => {
    const { client } = await freshClient();
    client.connect();
    vi.advanceTimersByTime(800);

    let busy = false;
    client.subscribe((e) => {
      if (e.type === 'error' && e.payload.code === 'AGENT_BUSY') busy = true;
    });

    const first = client.enrollStart({});
    const second = client.enrollStart({});
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(busy).toBe(true);
  });

  it('cancel emite operation.cancelled y vuelve a ready', async () => {
    const { client, useAgentStore } = await freshClient();
    client.connect();
    vi.advanceTimersByTime(800);

    let cancelled = false;
    client.subscribe((e) => {
      if (e.type === 'operation.cancelled') cancelled = true;
    });

    const opId = client.enrollStart({});
    expect(useAgentStore.getState().status).toBe('busy');
    client.cancel(opId!);
    expect(cancelled).toBe(true);
    expect(useAgentStore.getState().status).toBe('ready');
  });

  it('sin conexión, enrollStart devuelve null con error NO_DEVICE', async () => {
    const { client } = await freshClient();
    let noDevice = false;
    client.subscribe((e) => {
      if (e.type === 'error' && e.payload.code === 'NO_DEVICE') noDevice = true;
    });
    expect(client.enrollStart({})).toBeNull();
    expect(noDevice).toBe(true);
  });

  it('identificación simula captura y envío y vuelve a ready', async () => {
    const { client, useAgentStore } = await freshClient();
    client.connect();
    vi.advanceTimersByTime(800);

    const events: string[] = [];
    client.subscribe((event) => events.push(event.type));
    const opId = client.identifyStart({
      deviceToken: 'pdt_fake',
      deviceId: crypto.randomUUID(),
      branchId: crypto.randomUUID(),
    });

    expect(opId).not.toBeNull();
    expect(useAgentStore.getState().status).toBe('busy');
    vi.advanceTimersByTime(2_000);
    expect(events).toEqual(['identify.captured', 'identify.sent']);
    expect(useAgentStore.getState().status).toBe('ready');
  });

  it('identifyStop detiene silenciosamente la lectura activa', async () => {
    const { client, useAgentStore } = await freshClient();
    client.connect();
    vi.advanceTimersByTime(800);

    const events: string[] = [];
    client.subscribe((event) => events.push(event.type));
    const opId = client.identifyStart({
      deviceToken: 'pdt_fake',
      deviceId: crypto.randomUUID(),
      branchId: crypto.randomUUID(),
    });
    client.identifyStop(opId!);
    vi.advanceTimersByTime(2_000);

    expect(events).toEqual([]);
    expect(useAgentStore.getState().status).toBe('ready');
  });
});
