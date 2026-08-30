'use client';

import { getHidDiagnostics, type HidDiagnostics } from './diagnostics';
import { getReaderLock, type ReaderLock, type ReleaseLock } from './locks';
import {
  base64ByteLength,
  base64UrlToBase64,
  browserSupported,
  CLIENT_MISSING_MESSAGE,
  describeQuality,
  formatHidErrorCode,
  getHidWebApi,
  hidSampleFormat,
  resetWebSdkSessionCache,
  sdkAvailable,
  type HidDeviceEvent,
  type HidErrorOccurredEvent,
  type HidQualityReportedEvent,
  type HidSamplesAcquiredEvent,
  type HidWebApi,
} from './webapi';

/**
 * Sesión de captura HID: máquina de estados explícita sobre UNA instancia de
 * `Fingerprint.WebApi`, con adquisición continua (ADC entrega muestras
 * mientras la adquisición siga activa: no hace falta StartAcquisition por
 * cada dedo), propiedad exclusiva del lector entre pestañas, reconexión con
 * backoff y bitácora diagnóstica sin biometría.
 *
 * Estados:
 *   DISCONNECTED → CONNECTING → READY → ACQUIRING ⇄ FINGER_DETECTED
 *   ACQUIRING → SAMPLE_RECEIVED → IDENTIFYING → ACCESS_GRANTED | ACCESS_DENIED → ACQUIRING
 *   cualquiera → RECOVERING (backoff) → CONNECTING…   |   → PAUSED   |   → ERROR
 */
export type HidSessionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'READY'
  | 'ACQUIRING'
  | 'FINGER_DETECTED'
  | 'SAMPLE_RECEIVED'
  | 'IDENTIFYING'
  | 'ACCESS_GRANTED'
  | 'ACCESS_DENIED'
  | 'RECOVERING'
  | 'PAUSED'
  | 'ERROR';

export type HidRecoveryReason =
  | 'client-missing'
  | 'adc-unreachable'
  | 'device-disconnected'
  | 'no-reader'
  | 'hid-error'
  | 'start-failed';

export interface HidReaderInfo {
  id: string;
  model: string;
}

export interface HidSample {
  /** PNG en base64 estándar. Vive sólo en memoria hasta enviarse a la API. */
  pngBase64: string;
  qualityCode: number | null;
  deviceUid: string;
  byteLength: number;
  acquiredAt: string;
  sequence: number;
  sessionId: string;
  /** ms entre el inicio de la adquisición y la muestra. */
  sinceAcquisitionMs: number | null;
}

/** Resultado del sondeo de un formato de muestra contra el lector real. */
export interface HidFormatProbeResult {
  format: number;
  formatLabel: string;
  acquisitionStarted: boolean;
  qualityReports: number;
  samples: number;
  errorCodeHex: string | null;
  startError: string | null;
  elapsedMs: number;
}

export type HidSampleOutcome = {
  kind: 'granted' | 'denied' | 'error';
  /** Cuánto mantener el resultado antes de volver a ACQUIRING. */
  holdMs?: number;
};

export interface HidSessionSnapshot {
  state: HidSessionState;
  mode: 'continuous' | 'manual' | null;
  sessionId: string | null;
  reader: HidReaderInfo | null;
  readers: string[];
  lastQuality: { code: number; label: string; message: string; at: string } | null;
  lastError: string | null;
  recoveryReason: HidRecoveryReason | null;
  recoveryAttempt: number;
  nextRetryMs: number | null;
  consecutiveErrors: number;
  ownership: 'owner' | 'waiting' | 'none';
  pageFocused: boolean;
  visibility: string;
  acquisitionStartedAt: string | null;
  /** Última notificación de ADC de cualquier tipo (calidad, muestra, error…). */
  lastHidEventAt: string | null;
  /** Adquisición armada y ADC sin entregar una sola señal: ver `hid.silence`. */
  silent: boolean;
  samplesReceived: number;
  samplesDropped: number;
  lastSampleAt: string | null;
  lastOutcome: HidSampleOutcome['kind'] | null;
  since: string;
}

export interface HidSessionStartOptions {
  mode: 'continuous' | 'manual';
  /** Sólo en modo continuo: procesa la muestra y decide el resultado. */
  onSample?: (sample: HidSample) => Promise<HidSampleOutcome>;
  /** Lector concreto; si falta, el primero enumerado. */
  deviceUid?: string;
  /** Tiempo que se mantiene ACCESS_GRANTED/DENIED antes de volver a ACQUIRING. */
  resultHoldMs?: number;
}

export interface HidCaptureSessionDeps {
  api?: () => HidWebApi;
  lock?: ReaderLock;
  diagnostics?: HidDiagnostics;
  backoffMs?: number[];
  maxConsecutiveErrors?: number;
  fingerHintMs?: number;
  silenceMs?: number;
}

type Listener = (snapshot: HidSessionSnapshot) => void;

const DEFAULT_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
const DEFAULT_RESULT_HOLD_MS = 2_500;
const DEFAULT_FINGER_HINT_MS = 1_800;
const DEFAULT_MAX_CONSECUTIVE_ERRORS = 5;
/**
 * Tiempo que se le da a ADC para emitir ALGO —calidad, muestra o error— desde
 * que la adquisición quedó armada. Si no llega nada, el dedo apoyado no está
 * produciendo frames: el problema está en el driver, en ADC o en el hardware,
 * no en esta página. Sin este aviso la UI decía "Esperando huella" para
 * siempre y el intento no dejaba rastro en ninguna parte.
 */
const DEFAULT_SILENCE_MS = 12_000;
/** Orden del sondeo: primero el de producción, después los alternativos. */
const PROBE_FORMATS: Array<{ format: number; formatLabel: string }> = [
  { format: 5, formatLabel: 'PngImage' },
  { format: 2, formatLabel: 'Intermediate' },
  { format: 3, formatLabel: 'Compressed' },
  { format: 1, formatLabel: 'Raw' },
];
const DEFAULT_PROBE_MS = 8_000;

function readerModel(info: { DeviceID?: string } | null, id: string): string {
  if (info?.DeviceID && info.DeviceID !== id) return `HID DigitalPersona (${info.DeviceID})`;
  return 'HID DigitalPersona U.are.U 4500';
}

/**
 * Id de sesión de captura. Tiene que ser un UUID: la API lo valida así y es la
 * clave que une la bitácora del navegador con la del backend.
 */
function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback para navegadores sin randomUUID (o contextos no seguros): UUID v4
  // armado a mano. No se usa para nada criptográfico, sólo para correlacionar.
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[Math.floor(Math.random() * 4) + 8]!;
    else out += hex[Math.floor(Math.random() * 16)]!;
  }
  return out;
}

export class HidCaptureSession {
  private readonly getApi: () => HidWebApi;
  private readonly lock: ReaderLock;
  private readonly diagnostics: HidDiagnostics;
  private readonly backoffMs: number[];
  private readonly maxConsecutiveErrors: number;
  private readonly fingerHintMs: number;
  private readonly silenceMs: number;

  private snapshot: HidSessionSnapshot;
  private readonly listeners = new Set<Listener>();
  private options: HidSessionStartOptions | null = null;
  private api: HidWebApi | null = null;
  private release: ReleaseLock | null = null;
  private handlersAttached = false;
  private active = false;
  private armGeneration = 0;
  private arming: Promise<void> | null = null;
  private busy = false;
  private sampleSequence = 0;
  private acquisitionStartedAtMs: number | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private fingerTimer: ReturnType<typeof setTimeout> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private probe: {
    quality: number;
    samples: number;
    started: boolean;
    errorCode: number | null;
  } | null = null;
  private manualWaiter: {
    resolve: (sample: HidSample) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private readonly boundHandlers = {
    samples: (event: HidSamplesAcquiredEvent) => this.onSamplesAcquired(event),
    quality: (event: HidQualityReportedEvent) => this.onQualityReported(event),
    started: (event: HidDeviceEvent) => this.onAcquisitionStarted(event),
    stopped: (event: HidDeviceEvent) => this.onAcquisitionStopped(event),
    connected: (event: HidDeviceEvent) => this.onDeviceConnected(event),
    disconnected: (event: HidDeviceEvent) => this.onDeviceDisconnected(event),
    error: (event: HidErrorOccurredEvent) => this.onErrorOccurred(event),
    communicationFailed: () => this.onCommunicationFailed(),
  };
  private readonly boundFocus = () => this.onFocusChange(true);
  private readonly boundBlur = () => this.onFocusChange(false);
  private readonly boundVisibility = () => this.onVisibilityChange();

  constructor(deps: HidCaptureSessionDeps = {}) {
    this.getApi = deps.api ?? getHidWebApi;
    this.lock = deps.lock ?? getReaderLock();
    this.diagnostics = deps.diagnostics ?? getHidDiagnostics();
    this.backoffMs = deps.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.maxConsecutiveErrors = deps.maxConsecutiveErrors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;
    this.fingerHintMs = deps.fingerHintMs ?? DEFAULT_FINGER_HINT_MS;
    this.silenceMs = deps.silenceMs ?? DEFAULT_SILENCE_MS;
    this.snapshot = {
      state: 'DISCONNECTED',
      mode: null,
      sessionId: null,
      reader: null,
      readers: [],
      lastQuality: null,
      lastError: null,
      recoveryReason: null,
      recoveryAttempt: 0,
      nextRetryMs: null,
      consecutiveErrors: 0,
      ownership: 'none',
      pageFocused: typeof document !== 'undefined' ? document.hasFocus() : false,
      visibility: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
      acquisitionStartedAt: null,
      lastHidEventAt: null,
      silent: false,
      samplesReceived: 0,
      samplesDropped: 0,
      lastSampleAt: null,
      lastOutcome: null,
      since: new Date().toISOString(),
    };
  }

  // ── API pública ─────────────────────────────────────────────────────────

  getSnapshot(): HidSessionSnapshot {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isActive(): boolean {
    return this.active;
  }

  get diagnosticsLog(): HidDiagnostics {
    return this.diagnostics;
  }

  /**
   * Arranca la sesión. Resuelve cuando termina el primer intento de armar el
   * lector: los fallos recuperables NO se lanzan, se reflejan en el estado
   * (RECOVERING con `recoveryReason`) y se reintentan con backoff.
   */
  async start(options: HidSessionStartOptions): Promise<void> {
    if (this.active) throw new Error('La sesión de captura ya está activa en esta pestaña.');
    if (options.mode === 'continuous' && !options.onSample) {
      throw new Error('El modo continuo requiere onSample.');
    }
    this.active = true;
    this.options = options;
    this.sampleSequence = 0;
    const sessionId = newSessionId();
    this.update({
      mode: options.mode,
      sessionId,
      lastError: null,
      recoveryReason: null,
      recoveryAttempt: 0,
      consecutiveErrors: 0,
      samplesReceived: 0,
      samplesDropped: 0,
      lastOutcome: null,
      lastHidEventAt: null,
      silent: false,
      since: new Date().toISOString(),
    });
    this.diagnostics.info('session.start', 'Sesión de captura iniciada', {
      sessionId,
      mode: options.mode,
      requestedDeviceUid: options.deviceUid ?? null,
    });
    this.attachPageListeners();

    if (!browserSupported()) {
      this.transition('ERROR', {
        lastError: 'La huella HID se configura desde Windows 10/11 con Chrome, Edge o Firefox.',
      });
      this.diagnostics.error('session.unsupported', 'Navegador o sistema no soportado');
      return;
    }

    const release = await this.lock.tryAcquire();
    if (!this.active) return;
    if (release) {
      this.release = release;
      this.update({ ownership: 'owner' });
      this.diagnostics.info('lock.acquired', 'Esta pestaña es dueña del lector');
    } else {
      this.update({ ownership: 'waiting' });
      this.transition('PAUSED', {
        lastError: 'Otra pestaña del CRM está usando el lector. Cerrala o detené la huella ahí.',
      });
      this.diagnostics.warn('lock.waiting', 'Otra pestaña tiene el lector; esperando');
      void this.lock.acquire().then((granted) => {
        if (!this.active) {
          granted();
          return;
        }
        this.release = granted;
        this.update({ ownership: 'owner', lastError: null });
        this.diagnostics.info('lock.acquired', 'La otra pestaña liberó el lector');
        void this.arm();
      });
      return;
    }
    await this.arm();
  }

  /** Modo manual: espera la próxima muestra válida. */
  nextSample(timeoutMs = 30_000): Promise<HidSample> {
    if (!this.active || this.options?.mode !== 'manual') {
      return Promise.reject(new Error('La sesión no está en modo manual.'));
    }
    if (this.manualWaiter) {
      return Promise.reject(new Error('Ya hay una captura esperando una muestra.'));
    }
    this.diagnostics.info('sample.wait', 'Esperando muestra', { timeoutMs });
    return new Promise<HidSample>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.manualWaiter = null;
        this.diagnostics.warn('sample.timeout', 'No llegó una muestra dentro del tiempo', {
          timeoutMs,
          state: this.snapshot.state,
          pageFocused: this.snapshot.pageFocused,
        });
        reject(new Error('No llegó una muestra. Apoyá el dedo sobre el lector y reintentá.'));
      }, timeoutMs);
      this.manualWaiter = { resolve, reject, timer };
    });
  }

  async pause(): Promise<void> {
    if (!this.active) return;
    this.clearTimers();
    this.armGeneration += 1;
    this.rejectManualWaiter(new Error('Captura pausada.'));
    await this.stopAcquisitionQuietly();
    this.transition('PAUSED', { lastError: null, silent: false });
    this.diagnostics.info('session.pause', 'Captura pausada por el operador');
  }

  resume(): void {
    if (!this.active || this.snapshot.state !== 'PAUSED') return;
    if (this.snapshot.ownership !== 'owner') return;
    this.diagnostics.info('session.resume', 'Captura reanudada por el operador');
    void this.arm();
  }

  /** Desde ERROR: reintenta armar el lector manualmente. */
  retry(): void {
    if (!this.active) return;
    this.diagnostics.info('session.retry', 'Reintento manual');
    this.update({ consecutiveErrors: 0, recoveryAttempt: 0 });
    void this.arm();
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    this.armGeneration += 1;
    this.clearTimers();
    this.rejectManualWaiter(new Error('Captura cancelada.'));
    this.detachPageListeners();
    await this.stopAcquisitionQuietly();
    this.detachHandlers();
    this.release?.();
    this.release = null;
    this.options = null;
    this.busy = false;
    this.diagnostics.info('session.stop', 'Sesión de captura detenida', {
      samplesReceived: this.snapshot.samplesReceived,
      samplesDropped: this.snapshot.samplesDropped,
    });
    this.transition('DISCONNECTED', {
      mode: null,
      ownership: 'none',
      silent: false,
      acquisitionStartedAt: null,
      recoveryReason: null,
      nextRetryMs: null,
    });
  }

  /**
   * Prueba cada formato de muestra contra el lector real y devuelve qué
   * entregó ADC en cada uno. Es la prueba que separa un problema de código de
   * uno de driver/ADC/hardware: si NINGÚN formato produce señal, el sensor no
   * está entregando frames a la PC; si sólo falla `PngImage`, el que no
   * funciona es el formato, no el lector.
   *
   * Las muestras del sondeo se cuentan y se descartan: no se decodifican, no
   * se envían a la API y no quedan en la bitácora.
   */
  async probeSampleFormats(
    options: { perFormatMs?: number } = {},
  ): Promise<HidFormatProbeResult[]> {
    if (!this.active) throw new Error('La sesión de captura no está activa.');
    if (this.snapshot.ownership !== 'owner') {
      throw new Error('Esta pestaña no es dueña del lector: no se puede sondear.');
    }
    const api = this.api;
    const deviceUid = this.snapshot.reader?.id;
    if (!api || !deviceUid) throw new Error('Todavía no hay un lector identificado.');
    if (this.busy) throw new Error('Hay una lectura en curso. Esperá a que termine.');

    const perFormatMs = options.perFormatMs ?? DEFAULT_PROBE_MS;
    this.clearTimers();
    this.armGeneration += 1;
    this.rejectManualWaiter(new Error('Sondeo de formatos en curso.'));
    await this.stopAcquisitionQuietly();
    this.diagnostics.info('probe.start', 'Sondeo de formatos iniciado', { perFormatMs });

    const results: HidFormatProbeResult[] = [];
    try {
      for (const { format, formatLabel } of PROBE_FORMATS) {
        this.probe = { quality: 0, samples: 0, started: false, errorCode: null };
        const startedAt = Date.now();
        let startError: string | null = null;
        try {
          await api.startAcquisition(format, deviceUid);
          this.diagnostics.info('probe.armed', `Formato ${formatLabel} armado`, {
            format,
            formatLabel,
          });
          await new Promise((resolve) => setTimeout(resolve, perFormatMs));
          await api.stopAcquisition(deviceUid).catch(() => undefined);
        } catch (error) {
          startError = error instanceof Error ? error.message : String(error);
        }
        const probe = this.probe;
        this.probe = null;
        const result: HidFormatProbeResult = {
          format,
          formatLabel,
          acquisitionStarted: probe?.started ?? false,
          qualityReports: probe?.quality ?? 0,
          samples: probe?.samples ?? 0,
          errorCodeHex:
            probe?.errorCode !== null && probe?.errorCode !== undefined
              ? formatHidErrorCode(probe.errorCode)
              : null,
          startError,
          elapsedMs: Date.now() - startedAt,
        };
        results.push(result);
        this.diagnostics[result.samples > 0 ? 'info' : 'warn'](
          'probe.result',
          `${formatLabel}: ${result.samples} muestra(s), ${result.qualityReports} calidad(es)`,
          { ...result },
        );
      }
    } finally {
      this.probe = null;
      this.diagnostics.info('probe.stop', 'Sondeo de formatos terminado', {
        formatsWithSamples: results.filter((r) => r.samples > 0).length,
      });
      // El lector vuelve al formato de producción pase lo que pase.
      if (this.active) await this.arm();
    }
    return results;
  }

  // ── Armado del lector ───────────────────────────────────────────────────

  private arm(): Promise<void> {
    this.arming ??= this.armInternal().finally(() => {
      this.arming = null;
    });
    return this.arming;
  }

  private async armInternal(): Promise<void> {
    if (!this.active || this.snapshot.ownership !== 'owner') return;
    const generation = ++this.armGeneration;
    this.clearRetryTimer();
    this.transition('CONNECTING');

    if (!sdkAvailable()) {
      this.scheduleRecovery('client-missing', CLIENT_MISSING_MESSAGE);
      return;
    }

    try {
      const api = this.getApi();
      this.api = api;
      this.attachHandlers(api);

      const startedAt = Date.now();
      const readers = await api.enumerateDevices();
      if (generation !== this.armGeneration) return;
      this.diagnostics.info('adc.enumerate', 'ADC enumeró lectores', {
        count: readers.length,
        readers,
        elapsedMs: Date.now() - startedAt,
      });
      this.update({ readers });
      const requested = this.options?.deviceUid;
      const readerId = requested && readers.includes(requested) ? requested : readers[0];
      if (!readerId) {
        this.scheduleRecovery(
          'no-reader',
          'El cliente HID responde, pero no encontró un lector. Revisá USB y el driver Legacy.',
        );
        return;
      }

      const info = await api.getDeviceInfo(readerId).catch((error: unknown) => {
        this.diagnostics.warn('adc.device-info-failed', 'GetDeviceInfo falló', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (generation !== this.armGeneration) return;
      const reader = { id: readerId, model: readerModel(info, readerId) };
      this.update({ reader });
      this.diagnostics.info('adc.device-info', 'Lector identificado', {
        deviceUid: readerId,
        info,
      });
      this.transition('READY');

      const format = hidSampleFormat().PngImage;
      this.diagnostics.info('adc.start-acquisition', 'StartAcquisition enviado', {
        deviceUid: readerId,
        sampleFormat: format,
        pageFocused: this.snapshot.pageFocused,
      });
      const startAt = Date.now();
      await api.startAcquisition(format, readerId);
      if (generation !== this.armGeneration) return;
      this.acquisitionStartedAtMs = Date.now();
      this.diagnostics.info('adc.acquisition-armed', 'ADC aceptó StartAcquisition', {
        elapsedMs: Date.now() - startAt,
      });
      this.update({
        consecutiveErrors: 0,
        recoveryAttempt: 0,
        recoveryReason: null,
        nextRetryMs: null,
        lastError: null,
        acquisitionStartedAt: new Date(this.acquisitionStartedAtMs).toISOString(),
      });
      this.transition('ACQUIRING');
      this.armSilenceWatchdog();
    } catch (error) {
      if (generation !== this.armGeneration) return;
      const message = error instanceof Error ? error.message : String(error);
      const communication = /communication failure/i.test(message);
      this.diagnostics.error('adc.arm-failed', 'No se pudo armar el lector', { error: message });
      if (communication) {
        resetWebSdkSessionCache();
        this.scheduleRecovery('adc-unreachable', CLIENT_MISSING_MESSAGE);
      } else {
        this.scheduleRecovery('start-failed', message);
      }
    }
  }

  private scheduleRecovery(reason: HidRecoveryReason, message: string): void {
    if (!this.active) return;
    this.clearSilenceTimer();
    this.acquisitionStartedAtMs = null;
    const consecutiveErrors = this.snapshot.consecutiveErrors + 1;
    if (consecutiveErrors >= this.maxConsecutiveErrors) {
      this.transition('ERROR', {
        silent: false,
        lastError: message,
        recoveryReason: reason,
        consecutiveErrors,
        nextRetryMs: null,
        acquisitionStartedAt: null,
      });
      this.diagnostics.error('session.error', 'Se agotaron los reintentos automáticos', {
        reason,
        consecutiveErrors,
      });
      return;
    }
    const attempt = this.snapshot.recoveryAttempt + 1;
    const delay = this.backoffMs[Math.min(attempt - 1, this.backoffMs.length - 1)] ?? 1_000;
    this.transition('RECOVERING', {
      silent: false,
      lastError: message,
      recoveryReason: reason,
      recoveryAttempt: attempt,
      consecutiveErrors,
      nextRetryMs: delay,
      acquisitionStartedAt: null,
    });
    this.diagnostics.warn('session.recovering', 'Reintento programado', {
      reason,
      attempt,
      delayMs: delay,
    });
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.arm();
    }, delay);
  }

  // ── Eventos HID ─────────────────────────────────────────────────────────

  private onAcquisitionStarted(event: HidDeviceEvent): void {
    this.noteHidActivity();
    if (this.probe) this.probe.started = true;
    this.diagnostics.info('hid.AcquisitionStarted', 'ADC confirmó el inicio de adquisición', {
      deviceUid: event.deviceUid ?? null,
    });
  }

  private onAcquisitionStopped(event: HidDeviceEvent): void {
    this.noteHidActivity();
    this.diagnostics.info('hid.AcquisitionStopped', 'ADC informó adquisición detenida', {
      deviceUid: event.deviceUid ?? null,
      state: this.snapshot.state,
    });
  }

  private onQualityReported(event: HidQualityReportedEvent): void {
    this.noteHidActivity();
    if (this.probe) {
      this.probe.quality += 1;
      return;
    }
    const quality = describeQuality(event.quality);
    const entry = {
      code: event.quality,
      label: quality.label,
      message: quality.message,
      at: new Date().toISOString(),
    };
    this.diagnostics[event.quality === 0 ? 'info' : 'warn'](
      'hid.QualityReported',
      `Calidad ${event.quality} (${quality.label})`,
      { qualityCode: event.quality, label: quality.label, deviceUid: event.deviceUid ?? null },
    );
    this.update({ lastQuality: entry });
    if (this.snapshot.state === 'ACQUIRING' || this.snapshot.state === 'FINGER_DETECTED') {
      this.transition('FINGER_DETECTED');
      this.clearFingerTimer();
      this.fingerTimer = setTimeout(() => {
        this.fingerTimer = null;
        if (this.snapshot.state === 'FINGER_DETECTED') this.transition('ACQUIRING');
      }, this.fingerHintMs);
    }
  }

  private onSamplesAcquired(event: HidSamplesAcquiredEvent): void {
    this.noteHidActivity();
    if (this.probe) {
      // Sólo se cuenta: la muestra del sondeo no se decodifica ni se guarda.
      this.probe.samples += 1;
      return;
    }
    const receivedAt = Date.now();
    const parsed = this.parseSamples(event.samples);
    if (!parsed) return;
    const byteLength = base64ByteLength(parsed);
    this.diagnostics.info('hid.SamplesAcquired', 'Muestra recibida del lector', {
      deviceUid: event.deviceUid ?? null,
      sampleFormat: event.sampleFormat ?? null,
      sampleCount: 1,
      byteLength,
      qualityCode: this.snapshot.lastQuality?.code ?? null,
      sinceAcquisitionMs:
        this.acquisitionStartedAtMs !== null ? receivedAt - this.acquisitionStartedAtMs : null,
    });
    this.clearFingerTimer();

    if (this.busy || this.snapshot.state === 'PAUSED') {
      this.update({ samplesDropped: this.snapshot.samplesDropped + 1 });
      this.diagnostics.warn('sample.dropped', 'Muestra descartada: hay un resultado en curso', {
        state: this.snapshot.state,
      });
      return;
    }

    this.sampleSequence += 1;
    const sample: HidSample = {
      pngBase64: parsed,
      qualityCode: this.snapshot.lastQuality?.code ?? null,
      deviceUid: event.deviceUid ?? this.snapshot.reader?.id ?? '',
      byteLength,
      acquiredAt: new Date(receivedAt).toISOString(),
      sequence: this.sampleSequence,
      sessionId: this.snapshot.sessionId ?? '',
      sinceAcquisitionMs:
        this.acquisitionStartedAtMs !== null ? receivedAt - this.acquisitionStartedAtMs : null,
    };
    this.update({
      samplesReceived: this.snapshot.samplesReceived + 1,
      lastSampleAt: sample.acquiredAt,
      lastQuality: null,
    });

    if (this.options?.mode === 'manual') {
      const waiter = this.manualWaiter;
      if (!waiter) {
        this.update({ samplesDropped: this.snapshot.samplesDropped + 1 });
        this.diagnostics.warn('sample.dropped', 'Muestra descartada: nadie la esperaba', {
          state: this.snapshot.state,
        });
        if (this.snapshot.state === 'FINGER_DETECTED') this.transition('ACQUIRING');
        return;
      }
      clearTimeout(waiter.timer);
      this.manualWaiter = null;
      this.transition('SAMPLE_RECEIVED');
      waiter.resolve(sample);
      this.transition('ACQUIRING');
      return;
    }

    this.transition('SAMPLE_RECEIVED');
    void this.deliver(sample);
  }

  private parseSamples(raw: unknown): string | null {
    const reject = (reason: string, data: Record<string, unknown> = {}) => {
      this.diagnostics.error('sample.invalid', reason, {
        rawType: typeof raw,
        ...data,
      });
      return null;
    };
    if (typeof raw !== 'string') return reject('HID devolvió samples con un tipo inesperado');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return reject('HID devolvió samples que no son JSON', { rawLength: raw.length });
    }
    if (!Array.isArray(parsed)) return reject('HID devolvió samples que no son una lista');
    if (parsed.length === 0) return reject('HID devolvió una lista de samples vacía');
    const first: unknown = parsed[0];
    if (typeof first !== 'string' || first.length === 0) {
      return reject('HID devolvió una muestra vacía o no textual', { sampleCount: parsed.length });
    }
    return base64UrlToBase64(first);
  }

  private async deliver(sample: HidSample): Promise<void> {
    const onSample = this.options?.onSample;
    if (!onSample) return;
    this.busy = true;
    const generation = this.armGeneration;
    this.transition('IDENTIFYING');
    const startedAt = Date.now();
    let outcome: HidSampleOutcome;
    try {
      outcome = await onSample(sample);
    } catch (error) {
      outcome = { kind: 'error' };
      this.diagnostics.error('sample.outcome', 'El procesamiento de la muestra falló', {
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - startedAt,
      });
    }
    if (!this.active || generation !== this.armGeneration) {
      this.busy = false;
      return;
    }
    if (outcome.kind !== 'error') {
      this.diagnostics.info('sample.outcome', `Resultado: ${outcome.kind}`, {
        outcome: outcome.kind,
        elapsedMs: Date.now() - startedAt,
      });
    }
    this.update({ lastOutcome: outcome.kind });
    const resultState: HidSessionState =
      outcome.kind === 'granted'
        ? 'ACCESS_GRANTED'
        : outcome.kind === 'denied'
          ? 'ACCESS_DENIED'
          : 'ACQUIRING';
    if (resultState === 'ACQUIRING') {
      this.busy = false;
      this.transition('ACQUIRING');
      return;
    }
    this.transition(resultState);
    const hold = outcome.holdMs ?? this.options?.resultHoldMs ?? DEFAULT_RESULT_HOLD_MS;
    this.clearHoldTimer();
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this.busy = false;
      if (!this.active || generation !== this.armGeneration) return;
      if (this.snapshot.state === 'ACCESS_GRANTED' || this.snapshot.state === 'ACCESS_DENIED') {
        this.transition('ACQUIRING');
      }
    }, hold);
  }

  private onDeviceConnected(event: HidDeviceEvent): void {
    this.noteHidActivity();
    this.diagnostics.info('hid.DeviceConnected', 'Lector conectado', {
      deviceUid: event.deviceUid ?? null,
    });
    if (
      this.snapshot.state === 'RECOVERING' &&
      this.snapshot.recoveryReason === 'device-disconnected'
    ) {
      this.clearRetryTimer();
      this.update({ recoveryAttempt: 0, consecutiveErrors: 0 });
      void this.arm();
    }
  }

  private onDeviceDisconnected(event: HidDeviceEvent): void {
    this.noteHidActivity();
    this.diagnostics.warn('hid.DeviceDisconnected', 'Lector desconectado (USB)', {
      deviceUid: event.deviceUid ?? null,
      state: this.snapshot.state,
    });
    if (!this.active || this.snapshot.state === 'PAUSED') return;
    if (this.snapshot.reader && event.deviceUid && event.deviceUid !== this.snapshot.reader.id) {
      return;
    }
    this.rejectManualWaiter(new Error('El lector se desconectó durante la captura.'));
    this.armGeneration += 1;
    this.busy = false;
    this.clearHoldTimer();
    this.clearFingerTimer();
    this.update({ reader: null, consecutiveErrors: 0 });
    this.scheduleRecovery('device-disconnected', 'El lector se desconectó. Revisá el cable USB.');
  }

  private onErrorOccurred(event: HidErrorOccurredEvent): void {
    this.noteHidActivity();
    if (this.probe) {
      this.probe.errorCode = event.error;
      return;
    }
    const hex = formatHidErrorCode(event.error);
    this.diagnostics.error('hid.ErrorOccurred', `ADC informó un error ${hex}`, {
      deviceUid: event.deviceUid ?? null,
      errorCode: event.error >>> 0,
      errorCodeHex: hex,
      state: this.snapshot.state,
    });
    if (!this.active || this.snapshot.state === 'PAUSED') return;
    this.rejectManualWaiter(new Error(`HID informó el error ${hex}.`));
    this.armGeneration += 1;
    this.busy = false;
    this.clearHoldTimer();
    this.clearFingerTimer();
    this.scheduleRecovery(
      'hid-error',
      `HID informó el error ${hex}. Reconectá el lector y verificá el driver Legacy.`,
    );
  }

  private onCommunicationFailed(): void {
    this.noteHidActivity();
    this.diagnostics.error('hid.CommunicationFailed', 'Se perdió la conexión con ADC');
    if (!this.active || this.snapshot.state === 'PAUSED') return;
    this.rejectManualWaiter(new Error(CLIENT_MISSING_MESSAGE));
    this.armGeneration += 1;
    this.busy = false;
    this.clearHoldTimer();
    this.clearFingerTimer();
    resetWebSdkSessionCache();
    this.update({ reader: null });
    this.scheduleRecovery('adc-unreachable', CLIENT_MISSING_MESSAGE);
  }

  // ── Foco de la pestaña ──────────────────────────────────────────────────

  private onFocusChange(focused: boolean): void {
    this.update({ pageFocused: focused });
    this.diagnostics[focused ? 'info' : 'warn'](
      focused ? 'page.focus' : 'page.blur',
      focused
        ? 'La pestaña recuperó el foco'
        : 'La pestaña perdió el foco: ADC entrega muestras sólo a la página activa',
      { state: this.snapshot.state },
    );
  }

  private onVisibilityChange(): void {
    const visibility = document.visibilityState;
    this.update({ visibility });
    this.diagnostics.info('page.visibility', `Visibilidad: ${visibility}`, {
      state: this.snapshot.state,
    });
  }

  // ── Infraestructura ─────────────────────────────────────────────────────

  private attachHandlers(api: HidWebApi): void {
    if (this.handlersAttached) return;
    this.handlersAttached = true;
    api.on('SamplesAcquired', this.boundHandlers.samples);
    api.on('QualityReported', this.boundHandlers.quality);
    api.on('AcquisitionStarted', this.boundHandlers.started);
    api.on('AcquisitionStopped', this.boundHandlers.stopped);
    api.on('DeviceConnected', this.boundHandlers.connected);
    api.on('DeviceDisconnected', this.boundHandlers.disconnected);
    api.on('ErrorOccurred', this.boundHandlers.error);
    api.on('CommunicationFailed', this.boundHandlers.communicationFailed);
  }

  private detachHandlers(): void {
    const api = this.api;
    if (!api || !this.handlersAttached) return;
    this.handlersAttached = false;
    api.off('SamplesAcquired', this.boundHandlers.samples);
    api.off('QualityReported', this.boundHandlers.quality);
    api.off('AcquisitionStarted', this.boundHandlers.started);
    api.off('AcquisitionStopped', this.boundHandlers.stopped);
    api.off('DeviceConnected', this.boundHandlers.connected);
    api.off('DeviceDisconnected', this.boundHandlers.disconnected);
    api.off('ErrorOccurred', this.boundHandlers.error);
    api.off('CommunicationFailed', this.boundHandlers.communicationFailed);
  }

  private attachPageListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('focus', this.boundFocus);
    window.addEventListener('blur', this.boundBlur);
    document.addEventListener('visibilitychange', this.boundVisibility);
    this.update({ pageFocused: document.hasFocus(), visibility: document.visibilityState });
  }

  private detachPageListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('focus', this.boundFocus);
    window.removeEventListener('blur', this.boundBlur);
    document.removeEventListener('visibilitychange', this.boundVisibility);
  }

  private async stopAcquisitionQuietly(): Promise<void> {
    const api = this.api;
    const reader = this.snapshot.reader;
    this.acquisitionStartedAtMs = null;
    if (!api || this.snapshot.acquisitionStartedAt === null) return;
    this.update({ acquisitionStartedAt: null });
    const startedAt = Date.now();
    try {
      await api.stopAcquisition(reader?.id);
      this.diagnostics.info('adc.stop-acquisition', 'StopAcquisition confirmado', {
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      this.diagnostics.warn('adc.stop-acquisition', 'StopAcquisition falló', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private rejectManualWaiter(error: Error): void {
    const waiter = this.manualWaiter;
    if (!waiter) return;
    clearTimeout(waiter.timer);
    this.manualWaiter = null;
    waiter.reject(error);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearFingerTimer(): void {
    if (this.fingerTimer) clearTimeout(this.fingerTimer);
    this.fingerTimer = null;
  }

  /**
   * Toda notificación de ADC —incluso una calidad mala— prueba que el sensor
   * está entregando frames. Corta el aviso de silencio y lo vuelve a armar.
   */
  private noteHidActivity(): void {
    this.update({ lastHidEventAt: new Date().toISOString(), silent: false });
    if (this.snapshot.acquisitionStartedAt !== null) this.armSilenceWatchdog();
  }

  private armSilenceWatchdog(): void {
    this.clearSilenceTimer();
    if (!this.active || this.silenceMs <= 0) return;
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (!this.active || this.snapshot.acquisitionStartedAt === null) return;
      if (this.snapshot.state === 'PAUSED' || this.probe) return;
      this.update({ silent: true });
      this.diagnostics.warn(
        'hid.silence',
        'Adquisición armada y ADC no entregó ninguna señal del lector',
        {
          silentMs: this.silenceMs,
          state: this.snapshot.state,
          pageFocused: this.snapshot.pageFocused,
          visibility: this.snapshot.visibility,
          deviceUid: this.snapshot.reader?.id ?? null,
          samplesReceived: this.snapshot.samplesReceived,
          lastHidEventAt: this.snapshot.lastHidEventAt,
        },
      );
      // Un aviso por episodio: mientras el lector siga mudo no hay novedad que
      // registrar, y esta traza es append-only. La próxima señal del lector
      // baja la bandera y vuelve a armar el watchdog (ver noteHidActivity).
    }, this.silenceMs);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private clearHoldTimer(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  private clearTimers(): void {
    this.clearRetryTimer();
    this.clearFingerTimer();
    this.clearHoldTimer();
    this.clearSilenceTimer();
  }

  private transition(state: HidSessionState, patch: Partial<HidSessionSnapshot> = {}): void {
    if (this.snapshot.state !== state) {
      this.diagnostics.info('session.state', `${this.snapshot.state} → ${state}`, {
        from: this.snapshot.state,
        to: state,
      });
    }
    this.update({ ...patch, state });
  }

  private update(patch: Partial<HidSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}

let shared: HidCaptureSession | null = null;

/** Sesión única por pestaña. */
export function getHidCaptureSession(): HidCaptureSession {
  shared ??= new HidCaptureSession();
  return shared;
}

/**
 * Sólo para tests: descarta la sesión compartida. Con `deps` la reemplaza por
 * una configurada (p. ej. un watchdog de silencio corto), porque los
 * componentes toman la sesión del módulo y no pueden inyectarla.
 */
export function resetHidCaptureSessionForTests(deps?: HidCaptureSessionDeps): void {
  shared = deps ? new HidCaptureSession(deps) : null;
}
