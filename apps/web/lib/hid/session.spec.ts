import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HidDiagnostics } from './diagnostics';
import { createMemoryReaderLock, type ReaderLock } from './locks';
import { HidCaptureSession, type HidSample, type HidSessionState } from './session';
import { resetHidWebApiForTests } from './webapi';
import {
  ADC_ERROR,
  DEFAULT_DEVICE_UID,
  fakePng,
  installFakeAdc,
  uninstallFakeAdc,
  waitUntil,
  type FakeAdc,
} from './test/fake-adc';

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

function windowsBrowser(): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',
  });
}

let adc: FakeAdc;
let lock: ReaderLock;
let diagnostics: HidDiagnostics;
const sessions: HidCaptureSession[] = [];

function createSession(
  overrides: Partial<ConstructorParameters<typeof HidCaptureSession>[0]> = {},
) {
  const session = new HidCaptureSession({
    lock,
    diagnostics,
    backoffMs: [10, 20, 30],
    fingerHintMs: 30,
    ...overrides,
  });
  sessions.push(session);
  return session;
}

function trackStates(session: HidCaptureSession): HidSessionState[] {
  const seen: HidSessionState[] = [session.getSnapshot().state];
  session.subscribe((snapshot) => {
    if (seen[seen.length - 1] !== snapshot.state) seen.push(snapshot.state);
  });
  return seen;
}

async function waitState(session: HidCaptureSession, state: HidSessionState, timeoutMs = 2_000) {
  await waitUntil(() => session.getSnapshot().state === state, { timeoutMs });
}

beforeEach(() => {
  windowsBrowser();
  resetHidWebApiForTests();
  adc = installFakeAdc();
  lock = createMemoryReaderLock();
  diagnostics = new HidDiagnostics({ limit: 500 });
});

afterEach(async () => {
  for (const session of sessions.splice(0)) await session.stop();
  uninstallFakeAdc();
  window.sessionStorage.clear();
  if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
  vi.restoreAllMocks();
});

describe('HidCaptureSession — conexión y adquisición', () => {
  it('usa una sola instancia WebApi por pestaña y una sola adquisición activa', async () => {
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');

    expect(adc.channels).toHaveLength(1);
    expect(adc.startCount).toBe(1);
    expect(adc.enumerateCount).toBe(1);
    expect(session.getSnapshot().reader).toMatchObject({ id: DEFAULT_DEVICE_UID });

    await expect(
      session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) }),
    ).rejects.toThrow(/ya está activa/i);
    expect(adc.startCount).toBe(1);
    expect(adc.channels).toHaveLength(1);
  });

  it('recorre la secuencia completa de eventos HID y vuelve solo a ACQUIRING sin reiniciar la adquisición', async () => {
    const received: HidSample[] = [];
    const session = createSession();
    const states = trackStates(session);
    await session.start({
      mode: 'continuous',
      resultHoldMs: 40,
      onSample: async (sample) => {
        received.push(sample);
        return { kind: 'granted' };
      },
    });
    await waitState(session, 'ACQUIRING');

    expect(adc.placeFinger({ png: fakePng(32) })).toBe(true);
    await waitUntil(() => received.length === 1);
    await waitState(session, 'ACQUIRING');

    expect(states).toEqual([
      'DISCONNECTED',
      'CONNECTING',
      'READY',
      'ACQUIRING',
      'FINGER_DETECTED',
      'SAMPLE_RECEIVED',
      'IDENTIFYING',
      'ACCESS_GRANTED',
      'ACQUIRING',
    ]);
    // La muestra llega como base64 estándar (no base64url) y con el tamaño real.
    expect(received[0]!.pngBase64).toBe(Buffer.from(fakePng(32)).toString('base64'));
    expect(received[0]!.byteLength).toBe(32);
    expect(received[0]!.qualityCode).toBe(0);
    expect(received[0]!.deviceUid).toBe(DEFAULT_DEVICE_UID);
    // ADC es continuo: no se re-arma la adquisición por cada lectura.
    expect(adc.startCount).toBe(1);
    expect(adc.stopCount).toBe(0);

    const types = diagnostics.entries().map((entry) => entry.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'session.start',
        'adc.enumerate',
        'adc.start-acquisition',
        'hid.AcquisitionStarted',
        'hid.QualityReported',
        'hid.SamplesAcquired',
        'sample.outcome',
      ]),
    );
  });

  it('una calidad mala no produce muestra, explica el motivo y sigue esperando', async () => {
    const onSample = vi.fn(async () => ({ kind: 'granted' as const }));
    const session = createSession();
    await session.start({ mode: 'continuous', onSample });
    await waitState(session, 'ACQUIRING');

    adc.placeFinger({ quality: 7 });
    await waitState(session, 'FINGER_DETECTED');
    expect(session.getSnapshot().lastQuality).toMatchObject({ code: 7, label: 'NotCentered' });
    expect(session.getSnapshot().lastQuality?.message).toMatch(/centrá/i);

    await waitState(session, 'ACQUIRING');
    expect(onSample).not.toHaveBeenCalled();
    expect(adc.startCount).toBe(1);
  });

  it('muestras vacías o corruptas se registran como error y no rompen la sesión', async () => {
    const onSample = vi.fn(async () => ({ kind: 'granted' as const }));
    const session = createSession();
    await session.start({ mode: 'continuous', onSample });
    await waitState(session, 'ACQUIRING');

    adc.emitRawSamples('[]');
    adc.emitRawSamples('esto-no-es-json');
    adc.emitRawSamples(JSON.stringify(['']));
    adc.emitRawSamples(['a', 'b']);
    await waitUntil(
      () => diagnostics.entries().filter((e) => e.type === 'sample.invalid').length === 4,
    );

    expect(onSample).not.toHaveBeenCalled();
    expect(session.getSnapshot().state).toBe('ACQUIRING');

    adc.placeFinger();
    await waitUntil(() => onSample.mock.calls.length === 1);
  });

  it('ErrorOccurred con código real: registra decimal y hex, recupera con backoff sin intervención', async () => {
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');

    adc.emitError(ADC_ERROR.ACCESS_DENIED);
    await waitState(session, 'RECOVERING');
    const error = diagnostics.entries().find((e) => e.type === 'hid.ErrorOccurred');
    expect(error?.data).toMatchObject({
      errorCode: ADC_ERROR.ACCESS_DENIED,
      errorCodeHex: '0x80070005',
    });
    expect(session.getSnapshot().lastError).toMatch(/0x80070005/);

    await waitState(session, 'ACQUIRING');
    expect(adc.startCount).toBe(2);
    expect(session.getSnapshot().lastError).toBeNull();
  });

  it('tras varios errores consecutivos pasa a ERROR y retry() vuelve a armar el lector', async () => {
    const session = createSession({ maxConsecutiveErrors: 2 });
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');

    adc.startAcquisitionResult = ADC_ERROR.E_FAIL;
    adc.emitError(ADC_ERROR.E_FAIL);
    await waitState(session, 'ERROR');
    const startsWhileBroken = adc.startCount;

    adc.startAcquisitionResult = null;
    session.retry();
    await waitState(session, 'ACQUIRING');
    expect(adc.startCount).toBe(startsWhileBroken + 1);
  });
});

describe('HidCaptureSession — adquisición muda (driver / ADC / hardware)', () => {
  it('avisa cuando la adquisición queda armada y ADC no entrega NINGUNA señal', async () => {
    const session = createSession({ silenceMs: 40 });
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');

    await waitUntil(() => session.getSnapshot().silent);

    // No es un error del lector ni del código: la adquisición sigue viva.
    expect(session.getSnapshot().state).toBe('ACQUIRING');
    const silence = diagnostics.entries().find((entry) => entry.type === 'hid.silence');
    expect(silence).toBeDefined();
    expect(silence!.data).toMatchObject({ pageFocused: expect.any(Boolean), silentMs: 40 });
    expect(session.getSnapshot().lastHidEventAt).not.toBeNull();
  });

  it('cualquier señal del lector cancela el aviso y lo vuelve a armar', async () => {
    const session = createSession({ silenceMs: 60 });
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');
    await waitUntil(() => session.getSnapshot().silent);

    adc.placeFinger({ quality: 7 });
    await waitUntil(() => !session.getSnapshot().silent);

    // Vuelve a quedar mudo si el dedo no aparece nunca más.
    await waitUntil(() => session.getSnapshot().silent, { timeoutMs: 2_000 });
    expect(
      diagnostics.entries().filter((entry) => entry.type === 'hid.silence').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('stop() apaga el aviso: una sesión detenida no está muda, está apagada', async () => {
    const session = createSession({ silenceMs: 40 });
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');
    await waitUntil(() => session.getSnapshot().silent);

    await session.stop();
    expect(session.getSnapshot().silent).toBe(false);
  });
});

describe('HidCaptureSession — sondeo de formatos', () => {
  it('distingue un lector mudo de un formato que ADC acepta pero no entrega', async () => {
    // Caso real a descartar: ADC acepta StartAcquisition con PngImage y no
    // emite jamás una notificación, mientras que otro formato sí funciona.
    adc.mutedFormats = [5];
    const onSample = vi.fn(async () => ({ kind: 'granted' as const }));
    const session = createSession({ silenceMs: 0 });
    await session.start({ mode: 'continuous', onSample });
    await waitState(session, 'ACQUIRING');

    // El operador deja el dedo apoyado durante todo el sondeo.
    const unsubscribe = diagnostics.subscribe((entry) => {
      if (entry.type === 'probe.armed') adc.placeFinger();
    });
    const results = await session.probeSampleFormats({ perFormatMs: 60 });
    unsubscribe();

    const png = results.find((r) => r.format === 5)!;
    const intermediate = results.find((r) => r.format === 2)!;
    expect(png.acquisitionStarted).toBe(true);
    expect(png.qualityReports).toBe(0);
    expect(png.samples).toBe(0);
    expect(intermediate.samples).toBe(1);
    expect(intermediate.qualityReports).toBe(1);

    // El sondeo nunca identifica ni enrola con lo que capturó.
    expect(onSample).not.toHaveBeenCalled();
    expect(session.getSnapshot().samplesReceived).toBe(0);
    // Ni deja rastro de la muestra en la bitácora.
    expect(JSON.stringify(diagnostics.entries())).not.toContain('pngBase64');

    // Y el lector vuelve a quedar operativo con el formato de producción.
    await waitState(session, 'ACQUIRING');
    expect(adc.acquiring.get(DEFAULT_DEVICE_UID)?.sampleFormat).toBe(5);
  });

  it('no sondea si la pestaña no es dueña del lector', async () => {
    const other = createMemoryReaderLock();
    const owner = createSession({ lock: other });
    await owner.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    const guest = createSession({ lock: other });
    await guest.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });

    await expect(guest.probeSampleFormats({ perFormatMs: 10 })).rejects.toThrow(/dueña/i);
  });
});

describe('HidCaptureSession — modo manual (enrolamiento)', () => {
  it('nextSample() entrega la siguiente muestra válida y falla por timeout sin muestra', async () => {
    const session = createSession();
    await session.start({ mode: 'manual' });
    await waitState(session, 'ACQUIRING');

    await expect(session.nextSample(40)).rejects.toThrow(/no llegó una muestra/i);
    expect(diagnostics.entries().some((e) => e.type === 'sample.timeout')).toBe(true);
    expect(session.getSnapshot().state).toBe('ACQUIRING');

    const pending = session.nextSample(1_000);
    adc.placeFinger({ png: fakePng(16) });
    const sample = await pending;
    expect(sample.byteLength).toBe(16);
    expect(session.getSnapshot().state).toBe('ACQUIRING');
  });

  it('en modo manual una muestra sin nadie esperando se descarta y se registra', async () => {
    const session = createSession();
    await session.start({ mode: 'manual' });
    await waitState(session, 'ACQUIRING');

    adc.placeFinger();
    await waitUntil(() => diagnostics.entries().some((e) => e.type === 'sample.dropped'));
    expect(session.getSnapshot().state).toBe('ACQUIRING');
  });
});

describe('HidCaptureSession — resiliencia', () => {
  it('desconexión USB → RECOVERING y reconexión automática cuando vuelve el lector', async () => {
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');

    adc.unplugDevice();
    await waitState(session, 'RECOVERING');
    expect(session.getSnapshot().recoveryReason).toBe('device-disconnected');

    adc.plugDevice();
    await waitState(session, 'ACQUIRING');
    expect(adc.startCount).toBe(2);
    expect(adc.channels).toHaveLength(1);
  });

  it('caída de ADC → RECOVERING con backoff, limpia la caché del WebSdk y reconecta sola', async () => {
    window.sessionStorage.setItem('websdk', JSON.stringify({ port: 1, srp: {} }));
    window.sessionStorage.setItem('websdk.sessionId', 'abc');
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');

    adc.killService();
    await waitState(session, 'RECOVERING');
    expect(session.getSnapshot().recoveryReason).toBe('adc-unreachable');
    expect(window.sessionStorage.getItem('websdk')).toBeNull();
    expect(window.sessionStorage.getItem('websdk.sessionId')).toBeNull();
    const attemptsBefore = session.getSnapshot().recoveryAttempt;
    await waitUntil(() => session.getSnapshot().recoveryAttempt > attemptsBefore);

    adc.restoreService();
    await waitState(session, 'ACQUIRING');
    expect(adc.channels).toHaveLength(1);
  });

  it('dos pestañas: sólo la dueña del lock adquiere; la otra espera y toma el lector al liberarse', async () => {
    const first = createSession();
    const second = createSession();
    await first.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(first, 'ACQUIRING');

    await second.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(second, 'PAUSED');
    expect(second.getSnapshot().ownership).toBe('waiting');
    expect(adc.startCount).toBe(1);

    await first.stop();
    await waitState(second, 'ACQUIRING');
    expect(second.getSnapshot().ownership).toBe('owner');
    expect(adc.startCount).toBe(2);
  });

  it('descarta muestras mientras identifica o muestra un resultado (anti doble lectura)', async () => {
    let resolveOutcome: (() => void) | null = null;
    const onSample = vi.fn(
      () =>
        new Promise<{ kind: 'granted' }>((resolve) => {
          resolveOutcome = () => resolve({ kind: 'granted' });
        }),
    );
    const session = createSession();
    await session.start({ mode: 'continuous', onSample, resultHoldMs: 60 });
    await waitState(session, 'ACQUIRING');

    adc.placeFinger();
    await waitState(session, 'IDENTIFYING');
    adc.placeFinger();
    await waitUntil(() => diagnostics.entries().some((e) => e.type === 'sample.dropped'));
    resolveOutcome!();
    await waitState(session, 'ACCESS_GRANTED');
    adc.placeFinger();
    await waitState(session, 'ACQUIRING');

    expect(onSample).toHaveBeenCalledTimes(1);
    expect(diagnostics.entries().filter((e) => e.type === 'sample.dropped')).toHaveLength(2);
  });

  it('pause() apaga la adquisición y resume() la reanuda sin crear otro canal', async () => {
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');

    await session.pause();
    expect(session.getSnapshot().state).toBe('PAUSED');
    expect(adc.stopCount).toBe(1);
    expect(adc.placeFinger()).toBe(false);

    session.resume();
    await waitState(session, 'ACQUIRING');
    expect(adc.startCount).toBe(2);
    expect(adc.channels).toHaveLength(1);
  });

  it('stop() detiene la adquisición, libera el lock y nunca abre ventanas', async () => {
    const open = vi.spyOn(window, 'open');
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');
    adc.placeFinger();
    await waitState(session, 'ACCESS_GRANTED');

    await session.stop();
    expect(session.getSnapshot().state).toBe('DISCONNECTED');
    expect(adc.stopCount).toBe(1);
    expect(adc.acquiring.size).toBe(0);
    expect(open).not.toHaveBeenCalled();
    expect(await lock.tryAcquire()).not.toBeNull();
  });

  it('registra la pérdida de foco de la pestaña (ADC entrega muestras sólo a la página con foco)', async () => {
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');

    window.dispatchEvent(new Event('blur'));
    expect(session.getSnapshot().pageFocused).toBe(false);
    expect(diagnostics.entries().some((e) => e.type === 'page.blur')).toBe(true);
    window.dispatchEvent(new Event('focus'));
    expect(session.getSnapshot().pageFocused).toBe(true);
  });

  it('el informe diagnóstico describe el entorno y nunca incluye la muestra biométrica', async () => {
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'ACQUIRING');
    const png = fakePng(64);
    adc.placeFinger({ png });
    await waitState(session, 'ACCESS_GRANTED');

    const report = diagnostics.buildReport({ session: session.getSnapshot() });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(Buffer.from(png).toString('base64'));
    expect(serialized).not.toContain(Buffer.from(png).toString('base64url'));
    expect(report.environment).toMatchObject({
      webSdkVersion: '1.1.0',
      fingerprintSdkVersion: '1.0.0',
      windows: true,
    });
    expect(report.environment.userAgent).toContain('Windows');
    const sampleEntry = report.entries.find((e) => e.type === 'hid.SamplesAcquired');
    expect(sampleEntry?.data).toMatchObject({ sampleCount: 1, byteLength: 64, sampleFormat: 5 });
  });

  it('un navegador no soportado o sin ADC instalado deja un estado explicable', async () => {
    uninstallFakeAdc();
    const session = createSession();
    await session.start({ mode: 'continuous', onSample: async () => ({ kind: 'granted' }) });
    await waitState(session, 'RECOVERING');
    expect(session.getSnapshot().lastError).toMatch(/Authentication Device Client/);
    expect(session.getSnapshot().recoveryReason).toBe('client-missing');
  });
});
