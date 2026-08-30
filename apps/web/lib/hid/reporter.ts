'use client';

import type {
  BiometricCaptureStage,
  HidCaptureEventInput,
  RecordHidCaptureEventsRequest,
  RecordHidCaptureEventsResponse,
} from '@pulso/contracts/biometrics';
import type { HidDiagnostics, HidDiagnosticEntry } from './diagnostics';

/**
 * Envía a la API los eventos de captura que SÓLO ve el navegador: arranque de
 * sesión, errores de ADC, desconexiones, timeouts y pérdida de foco. Sin esto,
 * un intento que nunca llega al backend (apoyar el dedo y que no pase nada) no
 * deja rastro en ninguna parte — que es exactamente el síntoma que originó
 * este trabajo.
 *
 * Lo que el backend ya registra por su cuenta (muestra recibida, extracción,
 * matching, resultado) NO se duplica desde acá: ambas fuentes comparten el
 * `sessionId`, así que la traza se une sola.
 */

/** Tipos de la bitácora local que se persisten, y su etapa en la API. */
export const STAGE_BY_DIAGNOSTIC_TYPE: Record<string, BiometricCaptureStage> = {
  'session.start': 'SESSION_STARTED',
  'session.stop': 'SESSION_STOPPED',
  'adc.device-info': 'READER_DETECTED',
  'adc.acquisition-armed': 'ACQUISITION_STARTED',
  'adc.arm-failed': 'ADC_UNREACHABLE',
  'hid.ErrorOccurred': 'HID_ERROR',
  'hid.DeviceDisconnected': 'DEVICE_DISCONNECTED',
  'hid.CommunicationFailed': 'ADC_UNREACHABLE',
  'sample.invalid': 'SAMPLE_INVALID',
  'sample.timeout': 'SAMPLE_TIMEOUT',
  'page.blur': 'PAGE_BLUR',
  'session.unsupported': 'ADC_UNREACHABLE',
};

/** La API acepta 50 eventos por request (recordHidCaptureEventsRequestSchema). */
const MAX_BATCH = 50;
/** Tope de la cola local: si la API no responde, se descarta lo más viejo. */
const MAX_QUEUE = 500;
const DEFAULT_FLUSH_MS = 5_000;

type Severity = HidCaptureEventInput['severity'];

const SEVERITY_BY_LEVEL: Record<string, Severity> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

export interface HidCaptureEventReporterOptions {
  diagnostics: HidDiagnostics;
  getSessionId: () => string | null;
  getBranchId: () => string | null;
  send: (payload: RecordHidCaptureEventsRequest) => Promise<RecordHidCaptureEventsResponse>;
  flushIntervalMs?: number;
  getDeviceUid?: () => string | null;
}

export class HidCaptureEventReporter {
  private readonly options: HidCaptureEventReporterOptions;
  private readonly queue: HidCaptureEventInput[] = [];
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> | null = null;

  constructor(options: HidCaptureEventReporterOptions) {
    this.options = options;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.options.diagnostics.subscribe((entry) => this.enqueue(entry));
    this.timer = setInterval(() => {
      void this.flush();
    }, this.options.flushIntervalMs ?? DEFAULT_FLUSH_MS);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.queue.length = 0;
  }

  private enqueue(entry: HidDiagnosticEntry): void {
    const stage = STAGE_BY_DIAGNOSTIC_TYPE[entry.type];
    if (!stage) return;
    const sessionId = this.options.getSessionId();
    if (!sessionId) return;
    const deviceUid = this.options.getDeviceUid?.() ?? null;
    this.queue.push({
      sessionId,
      stage,
      severity: SEVERITY_BY_LEVEL[entry.level] ?? 'INFO',
      message: entry.message.slice(0, 500),
      occurredAt: entry.at,
      ...(deviceUid ? { deviceUid: deviceUid.slice(0, 200) } : {}),
      // `entry.data` ya viene saneado por HidDiagnostics: sin imágenes ni
      // plantillas, y con los strings largos recortados.
      ...(entry.data ? { metadata: entry.data as HidCaptureEventInput['metadata'] } : {}),
    });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  /** Envía todo lo pendiente. Nunca lanza: la captura no puede caerse por la bitácora. */
  flush(): Promise<void> {
    this.flushing ??= this.flushInternal().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async flushInternal(): Promise<void> {
    const branchId = this.options.getBranchId();
    if (!branchId) return;
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, MAX_BATCH);
      try {
        await this.options.send({ branchId, events: batch });
      } catch {
        // Se descarta el lote: reencolarlo indefinidamente haría crecer la
        // memoria de una recepción que quedó sin red, y el evento ya quedó en
        // la bitácora local (descargable desde el panel de diagnóstico).
        return;
      }
    }
  }
}
