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
  quality: number | null;
}

interface HidSdkApi {
  enumerateDevices(): Promise<string[]>;
  getDeviceInfo(deviceUid: string): Promise<{ DeviceID?: string }>;
  startAcquisition(sampleFormat: number, deviceUid?: string): Promise<void>;
  stopAcquisition(deviceUid?: string): Promise<void>;
  onSamplesAcquired?: () => void;
  onErrorOccurred?: () => void;
  onCommunicationFailed?: () => void;
}

interface HidSdkGlobal {
  WebApi: new (options?: { debug?: boolean }) => HidSdkApi;
  SampleFormat: { Intermediate: number };
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

declare global {
  interface Window {
    Fingerprint?: HidSdkGlobal;
  }
}

/**
 * Cliente de diagnóstico para HID ADC / DigitalPersona WebSDK.
 * Sólo confirma canal local, lector y captura. No persiste ni muestra imágenes
 * biométricas y no implementa matching en el navegador.
 */
export class HidFingerprintClient {
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

  async captureProbe(timeoutMs = 20_000): Promise<HidCaptureResult> {
    const check = await this.check();
    if (check.state !== 'ready' || !check.reader) throw new Error(check.message);

    const api = this.createApi();
    const reader = check.reader;
    return new Promise<HidCaptureResult>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(
        () => finish(new Error('No llegó una muestra. Apoyá el dedo sobre el lector y reintentá.')),
        timeoutMs,
      );

      const cleanup = () => {
        window.clearTimeout(timer);
        api.onSamplesAcquired = undefined;
        api.onErrorOccurred = undefined;
        api.onCommunicationFailed = undefined;
        void api.stopAcquisition(reader.id).catch(() => undefined);
      };
      const finish = (result: HidCaptureResult | Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (result instanceof Error) reject(result);
        else resolve(result);
      };

      api.onCommunicationFailed = () => finish(new Error(CLIENT_MISSING_MESSAGE));
      api.onErrorOccurred = () =>
        finish(new Error('HID informó un error al capturar. Revisá el driver y el lector.'));
      api.onSamplesAcquired = () => finish({ reader, quality: null });
      void api
        .startAcquisition(window.Fingerprint!.SampleFormat.Intermediate, reader.id)
        .catch((error: unknown) => finish(new Error(toMessage(error))));
    });
  }

  private createApi(): HidSdkApi {
    if (!sdkAvailable()) throw new Error(CLIENT_MISSING_MESSAGE);
    return new window.Fingerprint!.WebApi({ debug: false });
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
