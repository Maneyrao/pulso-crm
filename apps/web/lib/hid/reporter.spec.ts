import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HidDiagnostics } from './diagnostics';
import { HidCaptureEventReporter, STAGE_BY_DIAGNOSTIC_TYPE } from './reporter';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';

let diagnostics: HidDiagnostics;
let send: ReturnType<typeof vi.fn>;
let reporter: HidCaptureEventReporter;

beforeEach(() => {
  vi.useFakeTimers();
  diagnostics = new HidDiagnostics();
  send = vi.fn().mockResolvedValue({ accepted: 1 });
  reporter = new HidCaptureEventReporter({
    diagnostics,
    getSessionId: () => SESSION_ID,
    getBranchId: () => BRANCH_ID,
    send,
    flushIntervalMs: 1_000,
  });
  reporter.start();
});

afterEach(() => {
  reporter.stop();
  vi.useRealTimers();
});

describe('HidCaptureEventReporter', () => {
  it('agrupa varios eventos en un solo POST con la sede y la sesión activas', async () => {
    diagnostics.info('session.start', 'Sesión iniciada', { mode: 'continuous' });
    diagnostics.error('hid.ErrorOccurred', 'error', { errorCode: 5, errorCodeHex: '0x00000005' });
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]![0] as {
      branchId: string;
      events: Array<{ sessionId: string; stage: string; severity: string }>;
    };
    expect(payload.branchId).toBe(BRANCH_ID);
    expect(payload.events.map((e) => e.stage)).toEqual(['SESSION_STARTED', 'HID_ERROR']);
    expect(payload.events.every((e) => e.sessionId === SESSION_ID)).toBe(true);
    expect(payload.events[1]!.severity).toBe('ERROR');
  });

  it('ignora los tipos de diagnóstico que el backend ya registra por su cuenta', async () => {
    diagnostics.info('session.state', 'ACQUIRING → FINGER_DETECTED');
    diagnostics.info('hid.SamplesAcquired', 'muestra', { byteLength: 10 });
    diagnostics.info('sample.outcome', 'granted');

    await vi.advanceTimersByTimeAsync(1_000);

    expect(send).not.toHaveBeenCalled();
    for (const type of ['session.state', 'hid.SamplesAcquired', 'sample.outcome']) {
      expect(STAGE_BY_DIAGNOSTIC_TYPE[type]).toBeUndefined();
    }
  });

  it('no envía nada sin sede seleccionada', async () => {
    // Bitácora propia: el reporter del beforeEach escucha la compartida y sí
    // tiene sede, así que enviaría el evento y taparía lo que se prueba acá.
    const isolated = new HidDiagnostics();
    const orphan = new HidCaptureEventReporter({
      diagnostics: isolated,
      getSessionId: () => SESSION_ID,
      getBranchId: () => null,
      send,
      flushIntervalMs: 1_000,
    });
    orphan.start();
    isolated.info('session.start', 'Sesión iniciada');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).not.toHaveBeenCalled();
    orphan.stop();
  });

  it('sin sesión activa no se encola nada', async () => {
    const isolated = new HidDiagnostics();
    const noSession = new HidCaptureEventReporter({
      diagnostics: isolated,
      getSessionId: () => null,
      getBranchId: () => BRANCH_ID,
      send,
      flushIntervalMs: 1_000,
    });
    noSession.start();
    isolated.error('hid.ErrorOccurred', 'error sin sesión');

    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).not.toHaveBeenCalled();
    noSession.stop();
  });

  it('un fallo de red no propaga el error ni bloquea los envíos siguientes', async () => {
    send.mockRejectedValueOnce(new Error('sin conexión'));
    diagnostics.info('session.start', 'uno');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledOnce();

    diagnostics.warn('page.blur', 'dos');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(send).toHaveBeenCalledTimes(2);
    const second = send.mock.calls[1]![0] as { events: Array<{ stage: string }> };
    expect(second.events.map((e) => e.stage)).toEqual(['PAGE_BLUR']);
  });

  it('flush() envía lo pendiente de inmediato y nunca manda datos biométricos', async () => {
    diagnostics.info('session.start', 'Sesión iniciada', {
      pngBase64: 'A'.repeat(400),
      mode: 'continuous',
    });

    await reporter.flush();

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]![0] as {
      events: Array<{ metadata?: Record<string, unknown> }>;
    };
    expect(payload.events[0]!.metadata).toMatchObject({
      pngBase64: '[omitido]',
      mode: 'continuous',
    });
    expect(JSON.stringify(payload)).not.toContain('AAAA');
  });

  it('corta los lotes al máximo que acepta la API', async () => {
    for (let i = 0; i < 120; i += 1) diagnostics.warn('page.blur', `evento ${i}`);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(send).toHaveBeenCalled();
    for (const call of send.mock.calls) {
      expect((call[0] as { events: unknown[] }).events.length).toBeLessThanOrEqual(50);
    }
    const total = send.mock.calls.reduce(
      (sum, call) => sum + (call[0] as { events: unknown[] }).events.length,
      0,
    );
    expect(total).toBe(120);
  });
});
