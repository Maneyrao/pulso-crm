'use client';

export type HidConnectionState =
  'idle' | 'checking' | 'ready' | 'no-reader' | 'client-missing' | 'unsupported' | 'error';

export interface HidReader {
  id: string;
  model: string;
}

export interface HidCheckResult {
  state: HidConnectionState;
  reader: HidReader | null;
  message: string;
}

export interface HidCaptureResult {
  reader: HidReader;
  pngBase64: string;
  qualityCode: number | null;
}

export interface HidCaptureProgress {
  stage: 'reader-ready' | 'finger-detected' | 'quality';
  message: string;
  qualityCode: number | null;
}

interface HidSamplesAcquiredEvent {
  samples: string;
}

interface HidQualityReportedEvent {
  quality: number;
}

interface HidErrorOccurredEvent {
  error: number;
}

interface HidSdkApi {
  enumerateDevices(): Promise<string[]>;
  getDeviceInfo(deviceUid: string): Promise<{ DeviceID?: string }>;
  startAcquisition(sampleFormat: number, deviceUid?: string): Promise<void>;
  stopAcquisition(deviceUid?: string): Promise<void>;
  onSamplesAcquired?: (event: HidSamplesAcquiredEvent) => void;
  onQualityReported?: (event: HidQualityReportedEvent) => void;
  onAcquisitionStarted?: () => void;
  onDeviceDisconnected?: () => void;
  onErrorOccurred?: (event: HidErrorOccurredEvent) => void;
  onCommunicationFailed?: () => void;
}

interface HidSdkGlobal {
  WebApi: new (options?: { debug?: boolean }) => HidSdkApi;
  SampleFormat: { Intermediate: number; PngImage: number };
  b64UrlTo64(value: string): string;
}

const CLIENT_MISSING_MESSAGE =
  'No se detectó HID Authentication Device Client. Instalalo junto con el driver HID Legacy del DigitalPersona 4500.';

function browserSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return /Windows/i.test(navigator.userAgent) && typeof WebSocket !== 'undefined';
}

function sdkAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.Fingerprint?.WebApi === 'function';
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return CLIENT_MISSING_MESSAGE;
}

const QUALITY_MESSAGES: Record<number, string> = {
  0: 'Dedo detectado. Procesando la muestra...',
  1: 'No se detectó una imagen. Volvé a apoyar el dedo.',
  2: 'La lectura quedó muy clara. Apoyá el dedo de forma pareja.',
  3: 'La lectura quedó muy oscura. Reducí la presión.',
  4: 'La lectura tuvo ruido. Limpiá el lector y reintentá.',
  5: 'La huella tiene poco contraste. Apoyá todo el dedo.',
  6: 'No se detectaron suficientes detalles. Reubicá el dedo.',
  7: 'Centrá el dedo sobre el lector.',
  8: 'El lector no detectó un dedo.',
  19: 'Estás presionando demasiado fuerte.',
  20: 'Presioná un poco más el dedo.',
  21: 'El dedo o el lector están húmedos. Secalos y reintentá.',
  23: 'Apoyá una superficie mayor del dedo.',
  24: 'Mantené el dedo derecho y quieto.',
};

declare global {
  interface Window {
    Fingerprint?: HidSdkGlobal;
  }
}

/**
 * Captura mediante HID ADC / DigitalPersona WebSDK. La imagen sólo vive en
 * memoria hasta enviarse a la API; la extracción y el matching nunca ocurren
 * en el navegador.
 */
export class HidFingerprintClient {
  private api: HidSdkApi | null = null;
  private activeCancel: (() => void) | null = null;
  private activeStop: (() => Promise<void>) | null = null;

  async check(): Promise<HidCheckResult> {
    if (!browserSupported()) {
      return {
        state: 'unsupported',
        reader: null,
        message: 'La huella HID se configura desde Windows 10/11 con Chrome, Edge o Firefox.',
      };
    }
    if (!sdkAvailable()) {
      return { state: 'client-missing', reader: null, message: CLIENT_MISSING_MESSAGE };
    }

    const api = this.createApi();
    try {
      const readers = await api.enumerateDevices();
      if (readers.length === 0) {
        return {
          state: 'no-reader',
          reader: null,
          message:
            'El cliente HID responde, pero no encontró un lector. Revisá USB y el driver Legacy.',
        };
      }
      const reader = await this.describe(api, readers[0]!);
      return {
        state: 'ready',
        reader,
        message: `${reader.model} listo para una prueba de captura.`,
      };
    } catch (error) {
      return { state: 'client-missing', reader: null, message: toMessage(error) };
    }
  }

  async captureSample(
    timeoutMs = 30_000,
    onProgress?: (progress: HidCaptureProgress) => void,
  ): Promise<HidCaptureResult> {
    await this.cancelCapture();
    const check = await this.check();
    if (check.state !== 'ready' || !check.reader) throw new Error(check.message);

    const api = this.createApi();
    const reader = check.reader;
    return new Promise<HidCaptureResult>((resolve, reject) => {
      let settled = false;
      let qualityCode: number | null = null;
      let stopping: Promise<void> | null = null;
      const stop = () => {
        stopping ??= api.stopAcquisition(reader.id).catch(() => undefined);
        return stopping;
      };
      const timer = window.setTimeout(
        () => finish(new Error('No llegó una muestra. Apoyá el dedo sobre el lector y reintentá.')),
        timeoutMs,
      );

      const cleanup = () => {
        window.clearTimeout(timer);
        api.onSamplesAcquired = undefined;
        api.onQualityReported = undefined;
        api.onAcquisitionStarted = undefined;
        api.onDeviceDisconnected = undefined;
        api.onErrorOccurred = undefined;
        api.onCommunicationFailed = undefined;
        if (this.activeCancel === cancel) {
          this.activeCancel = null;
          this.activeStop = null;
        }
        void stop();
      };
      const finish = (result: HidCaptureResult | Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (result instanceof Error) reject(result);
        else resolve(result);
      };
      const cancel = () => finish(new Error('Captura cancelada.'));
      this.activeCancel = cancel;
      this.activeStop = stop;

      api.onCommunicationFailed = () => finish(new Error(CLIENT_MISSING_MESSAGE));
      api.onDeviceDisconnected = () =>
        finish(new Error('El lector se desconectó durante la captura.'));
      api.onAcquisitionStarted = () =>
        onProgress?.({
          stage: 'reader-ready',
          message: 'Lector listo. Apoyá el dedo y mantenelo quieto.',
          qualityCode: null,
        });
      api.onErrorOccurred = (event) =>
        finish(
          new Error(
            `HID informó el error ${event.error}. Reconectá el lector y verificá el driver Legacy.`,
          ),
        );
      api.onQualityReported = (event) => {
        qualityCode = event.quality;
        onProgress?.({
          stage: event.quality === 0 ? 'finger-detected' : 'quality',
          message:
            QUALITY_MESSAGES[event.quality] ??
            `El lector rechazó la muestra por calidad (código ${event.quality}). Reubicá el dedo.`,
          qualityCode: event.quality,
        });
      };
      api.onSamplesAcquired = (event) => {
        try {
          const samples: unknown = JSON.parse(event.samples);
          const first = Array.isArray(samples) ? samples[0] : null;
          if (typeof first !== 'string' || !first) {
            finish(new Error('HID no devolvió una muestra utilizable.'));
            return;
          }
          finish({
            reader,
            pngBase64: window.Fingerprint!.b64UrlTo64(first),
            qualityCode,
          });
        } catch {
          finish(new Error('HID devolvió una muestra con formato inválido.'));
        }
      };
      void api
        .startAcquisition(window.Fingerprint!.SampleFormat.PngImage, reader.id)
        .then(() => {
          if (!settled) {
            onProgress?.({
              stage: 'reader-ready',
              message: 'Lector listo. Apoyá el dedo y mantenelo quieto.',
              qualityCode: null,
            });
          }
        })
        .catch((error: unknown) => finish(new Error(toMessage(error))));
    });
  }

  /** Compatibilidad temporal con el panel de diagnóstico existente. */
  captureProbe(timeoutMs = 20_000): Promise<HidCaptureResult> {
    return this.captureSample(timeoutMs);
  }

  async cancelCapture(): Promise<void> {
    const cancel = this.activeCancel;
    const stop = this.activeStop;
    cancel?.();
    await stop?.();
  }

  private createApi(): HidSdkApi {
    if (!sdkAvailable()) throw new Error(CLIENT_MISSING_MESSAGE);
    this.api ??= new window.Fingerprint!.WebApi({ debug: false });
    return this.api;
  }

  private async describe(api: HidSdkApi, id: string): Promise<HidReader> {
    const info = await api.getDeviceInfo(id).catch(() => null);
    return {
      id,
      model: info?.DeviceID ? `HID DigitalPersona (${info.DeviceID})` : 'HID DigitalPersona 4500',
    };
  }
}

let instance: HidFingerprintClient | null = null;

export function getHidFingerprintClient(): HidFingerprintClient {
  instance ??= new HidFingerprintClient();
  return instance;
}
