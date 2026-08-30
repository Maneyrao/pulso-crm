/**
 * Simulador fiel del protocolo HID ADC (Authentication Device Client) para
 * tests. Reemplaza `WebSdk.WebChannelClient` (el canal WebSocket cifrado) por
 * una implementación en memoria que habla EXACTAMENTE el mismo protocolo que
 * espera `fingerprint.sdk.js` (que se carga REAL, sin mocks, desde
 * `public/vendor/hid`):
 *
 *   navegador → ADC : b64url(JSON({ Method, Parameters: b64url(JSON(params)) }))
 *   ADC → navegador : b64url(JSON({ Type: 0, Data: b64url(JSON({ Method, Result, Data })) }))   (respuesta)
 *                     b64url(JSON({ Type: 1, Data: b64url(JSON({ Event, Device, Data })) }))    (notificación)
 *
 * Los códigos de `Method`, `Event` (NotificationType) y `SampleFormat` son los
 * del SDK oficial. Ninguna huella real: los "PNG" son bytes arbitrarios.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const ADC_METHOD = {
  EnumerateDevices: 1,
  GetDeviceInfo: 2,
  StartAcquisition: 3,
  StopAcquisition: 4,
} as const;

export const ADC_NOTIFICATION = {
  Completed: 0,
  Error: 1,
  Disconnected: 2,
  Connected: 3,
  Quality: 4,
  Stopped: 10,
  Started: 11,
} as const;

/** HRESULT típicos que ADC devuelve como uint32 en `uError` / `Result`. */
export const ADC_ERROR = {
  /** E_FAIL */
  E_FAIL: 0x80004005,
  /** ERROR_DEVICE_NOT_CONNECTED como HRESULT (0x8007048F). */
  DEVICE_NOT_CONNECTED: 0x8007048f,
  /** ERROR_ACCESS_DENIED (lector tomado por otro proceso / WBF). */
  ACCESS_DENIED: 0x80070005,
} as const;

export const DEFAULT_DEVICE_UID = '{5A6D5B29-6B2A-4C67-9D10-0A0B0C0D0E0F}';

export function b64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf8')
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function b64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

/** Bytes → base64url (así envía ADC las muestras PNG). */
export function bytesToB64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export interface AdcCommand {
  method: number;
  params: Record<string, unknown> | null;
  at: number;
}

export interface FakeAdcOptions {
  /** Dispositivos conectados al iniciar. */
  devices?: string[];
  /** Si es false, ADC "no está instalado": toda conexión falla. */
  reachable?: boolean;
  /** Retardo (ms) con el que ADC responde a cada comando. */
  latencyMs?: number;
}

interface ChannelHandle {
  onConnectionSucceed: (() => void) | null;
  onConnectionFailed: (() => void) | null;
  onDataReceivedTxt: ((data: string) => void) | null;
  connected: boolean;
}

/**
 * Estado del "servicio" ADC, compartido por todos los canales (pestañas) que
 * se conecten. Expone acciones físicas: apoyar dedo, desenchufar USB, matar
 * el servicio.
 */
export class FakeAdc {
  readonly commands: AdcCommand[] = [];
  readonly channels: ChannelHandle[] = [];
  devices: string[];
  reachable: boolean;
  latencyMs: number;
  /** Dispositivo con adquisición activa (ADC admite una por dispositivo). */
  acquiring: Map<string, { channel: ChannelHandle; sampleFormat: number }> = new Map();
  /** Si está definido, StartAcquisition responde con este Result (error). */
  startAcquisitionResult: number | null = null;

  constructor(options: FakeAdcOptions = {}) {
    this.devices = [...(options.devices ?? [DEFAULT_DEVICE_UID])];
    this.reachable = options.reachable ?? true;
    this.latencyMs = options.latencyMs ?? 0;
  }

  get startCount(): number {
    return this.commands.filter((c) => c.method === ADC_METHOD.StartAcquisition).length;
  }

  get stopCount(): number {
    return this.commands.filter((c) => c.method === ADC_METHOD.StopAcquisition).length;
  }

  get enumerateCount(): number {
    return this.commands.filter((c) => c.method === ADC_METHOD.EnumerateDevices).length;
  }

  /** Crea la clase `WebChannelClient` que el SDK real instanciará. */
  createWebSdk(): { WebChannelClient: new (path: string, options?: unknown) => unknown } {
    return createWebChannelClientFor(this);
  }
  schedule(fn: () => void): void {
    setTimeout(fn, this.latencyMs);
  }

  handleCommand(channel: ChannelHandle, raw: string): void {
    const command = JSON.parse(b64UrlDecode(raw)) as { Method: number; Parameters?: string };
    const params = command.Parameters
      ? (JSON.parse(b64UrlDecode(command.Parameters)) as Record<string, unknown>)
      : null;
    this.commands.push({ method: command.Method, params, at: Date.now() });

    this.schedule(() => {
      if (!channel.connected) return;
      switch (command.Method) {
        case ADC_METHOD.EnumerateDevices:
          this.respond(channel, command.Method, 0, { DeviceIDs: JSON.stringify(this.devices) });
          return;
        case ADC_METHOD.GetDeviceInfo: {
          const id = String(params?.['DeviceID'] ?? '');
          if (!this.devices.includes(id)) {
            this.respond(channel, command.Method, ADC_ERROR.DEVICE_NOT_CONNECTED, null);
            return;
          }
          this.respond(channel, command.Method, 0, {
            DeviceID: id,
            eUidType: 0,
            eDeviceModality: 2,
            eDeviceTech: 1,
          });
          return;
        }
        case ADC_METHOD.StartAcquisition: {
          const requested = String(params?.['DeviceID'] ?? '');
          const id =
            requested === '00000000-0000-0000-0000-000000000000' ? this.devices[0] : requested;
          if (this.startAcquisitionResult !== null) {
            this.respond(channel, command.Method, this.startAcquisitionResult, null);
            return;
          }
          if (!id || !this.devices.includes(id)) {
            this.respond(channel, command.Method, ADC_ERROR.DEVICE_NOT_CONNECTED, null);
            return;
          }
          this.acquiring.set(id, { channel, sampleFormat: Number(params?.['SampleType']) });
          this.respond(channel, command.Method, 0, null);
          this.notify(channel, ADC_NOTIFICATION.Started, id, null);
          return;
        }
        case ADC_METHOD.StopAcquisition: {
          const requested = String(params?.['DeviceID'] ?? '');
          const id =
            requested === '00000000-0000-0000-0000-000000000000' ? this.devices[0] : requested;
          if (id) this.acquiring.delete(id);
          this.respond(channel, command.Method, 0, null);
          if (id) this.notify(channel, ADC_NOTIFICATION.Stopped, id, null);
          return;
        }
        default:
          this.respond(channel, command.Method, ADC_ERROR.E_FAIL, null);
      }
    });
  }

  private respond(
    channel: ChannelHandle,
    method: number,
    result: number,
    data: Record<string, unknown> | null,
  ): void {
    if (!channel.connected) return;
    const response = {
      Method: method,
      // ADC devuelve HRESULT como entero con signo; el SDK acepta > 2^31 como error.
      Result: result,
      Data: data ? b64UrlEncode(JSON.stringify(data)) : '',
    };
    const envelope = { Type: 0, Data: b64UrlEncode(JSON.stringify(response)) };
    channel.onDataReceivedTxt?.(b64UrlEncode(JSON.stringify(envelope)));
  }

  private notify(
    channel: ChannelHandle,
    event: number,
    device: string,
    data: Record<string, unknown> | null,
  ): void {
    if (!channel.connected) return;
    const notification = {
      Event: event,
      Device: device,
      Data: data ? b64UrlEncode(JSON.stringify(data)) : '',
    };
    const envelope = { Type: 1, Data: b64UrlEncode(JSON.stringify(notification)) };
    channel.onDataReceivedTxt?.(b64UrlEncode(JSON.stringify(envelope)));
  }

  // ── Acciones físicas ────────────────────────────────────────────────────

  /**
   * Apoya un dedo. Con `quality` 0 (Good) ADC emite Quality y luego Completed
   * con la muestra; con otra calidad sólo emite Quality (captura rechazada).
   * La adquisición sigue activa (modo continuo real de ADC).
   */
  placeFinger(options: { quality?: number; png?: Uint8Array; deviceUid?: string } = {}): boolean {
    const deviceUid = options.deviceUid ?? this.devices[0];
    if (!deviceUid) return false;
    const active = this.acquiring.get(deviceUid);
    if (!active) return false;
    const quality = options.quality ?? 0;
    const png = options.png ?? fakePng(24);
    this.schedule(() => {
      this.notify(active.channel, ADC_NOTIFICATION.Quality, deviceUid, { Quality: quality });
      if (quality === 0) {
        this.notify(active.channel, ADC_NOTIFICATION.Completed, deviceUid, {
          SampleFormat: active.sampleFormat,
          Samples: JSON.stringify([bytesToB64Url(png)]),
        });
      }
    });
    return true;
  }

  /** Emite Completed con un payload arbitrario (para probar muestras vacías/corruptas). */
  emitRawSamples(samples: unknown, deviceUid = this.devices[0]): void {
    if (!deviceUid) return;
    const active = this.acquiring.get(deviceUid);
    if (!active) return;
    this.schedule(() =>
      this.notify(active.channel, ADC_NOTIFICATION.Completed, deviceUid, {
        SampleFormat: active.sampleFormat,
        Samples: samples,
      }),
    );
  }

  emitError(code: number, deviceUid = this.devices[0]): void {
    if (!deviceUid) return;
    const active = this.acquiring.get(deviceUid);
    if (!active) return;
    this.acquiring.delete(deviceUid);
    this.schedule(() =>
      this.notify(active.channel, ADC_NOTIFICATION.Error, deviceUid, { uError: code }),
    );
  }

  /** Desenchufa el USB: ADC avisa Disconnected a los canales que adquirían y el lector desaparece. */
  unplugDevice(deviceUid = this.devices[0]): void {
    if (!deviceUid) return;
    const active = this.acquiring.get(deviceUid);
    this.acquiring.delete(deviceUid);
    this.devices = this.devices.filter((d) => d !== deviceUid);
    for (const channel of this.channels) {
      if (!channel.connected) continue;
      if (active && active.channel !== channel) continue;
      this.schedule(() => this.notify(channel, ADC_NOTIFICATION.Disconnected, deviceUid, null));
    }
  }

  plugDevice(deviceUid = DEFAULT_DEVICE_UID): void {
    if (!this.devices.includes(deviceUid)) this.devices.push(deviceUid);
    for (const channel of this.channels) {
      if (!channel.connected) continue;
      this.schedule(() => this.notify(channel, ADC_NOTIFICATION.Connected, deviceUid, null));
    }
  }

  /** Cae el servicio ADC: los canales se cierran; nuevas conexiones fallan. */
  killService(): void {
    this.reachable = false;
    this.acquiring.clear();
    for (const channel of this.channels) {
      if (!channel.connected) continue;
      channel.connected = false;
      this.schedule(() => channel.onConnectionFailed?.());
    }
  }

  restoreService(): void {
    this.reachable = true;
  }
}

/**
 * Clase `WebChannelClient` ligada a un FakeAdc. Vive fuera de la clase para no
 * aliasar `this` dentro de un método (regla del repo: no-this-alias).
 */
function createWebChannelClientFor(adc: FakeAdc): {
  WebChannelClient: new (path: string, options?: unknown) => unknown;
} {
  class WebChannelClient implements ChannelHandle {
    onConnectionSucceed: (() => void) | null = null;
    onConnectionFailed: (() => void) | null = null;
    onDataReceivedTxt: ((data: string) => void) | null = null;
    onDataReceivedBin: ((data: unknown) => void) | null = null;
    connected = false;
    readonly path: string;
    constructor(path: string, _options?: unknown) {
      this.path = path;
      adc.channels.push(this);
    }
    connect(): void {
      adc.schedule(() => {
        if (!adc.reachable) {
          this.connected = false;
          this.onConnectionFailed?.();
          return;
        }
        this.connected = true;
        this.onConnectionSucceed?.();
      });
    }
    disconnect(): void {
      this.connected = false;
    }
    isConnected(): boolean {
      return this.connected;
    }
    sendDataTxt(data: string): void {
      adc.handleCommand(this, data);
    }
    sendDataBin(): void {
      /* no usado por fingerprint.sdk */
    }
    resetReconnectTimer(): void {
      /* no usado */
    }
  }
  return { WebChannelClient };
}

export function fakePng(bytes = 24): Uint8Array {
  const out = new Uint8Array(bytes);
  // Firma PNG real seguida de relleno determinístico: no es una huella.
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < bytes; i += 1) out[i] = i < 8 ? signature[i]! : (i * 31) % 251;
  return out;
}

let sdkSource: string | null = null;

/**
 * Lee el `fingerprint.sdk.js` oficial. Se busca primero en node_modules —la
 * fuente que `scripts/prepare-hid-websdk.mjs` copia a `public/vendor/hid`
 * durante el build— porque esa copia es un artefacto gitignoreado que no
 * existe cuando se corren sólo los tests (el job de CI no compila la web).
 *
 * No se usa `require.resolve` del subpath: el paquete declara `exports` y
 * bloquea `./dist/*`, así que se resuelve el directorio a mano igual que hace
 * el script de build.
 */
function readFingerprintSdk(): string {
  const candidates = [
    resolve(process.cwd(), 'node_modules/@digitalpersona/fingerprint/dist/fingerprint.sdk.js'),
    resolve(process.cwd(), '../../node_modules/@digitalpersona/fingerprint/dist/fingerprint.sdk.js'),
    resolve(process.cwd(), 'public/vendor/hid/fingerprint.sdk.js'),
  ];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      // Sigue con el próximo candidato.
    }
  }
  throw new Error(
    `No se encontró fingerprint.sdk.js. Buscado en:\n  ${candidates.join('\n  ')}\n` +
      'Instalá las dependencias (@digitalpersona/fingerprint) antes de correr los tests.',
  );
}

/**
 * Carga el `fingerprint.sdk.js` REAL (el mismo que sirve la web) en el `window`
 * de jsdom, enlazado al FakeAdc. Devuelve el ADC para manipularlo.
 */
export function installFakeAdc(options: FakeAdcOptions = {}): FakeAdc {
  const adc = new FakeAdc(options);
  const webSdk = adc.createWebSdk();
  sdkSource ??= readFingerprintSdk();
  // El SDK es un IIFE con `var Fingerprint` de nivel superior: en un <script>
  // queda en window; acá lo devolvemos explícitamente.
  const factory = new Function('window', 'WebSdk', `${sdkSource}\nreturn Fingerprint;`) as (
    w: Window,
    sdk: unknown,
  ) => NonNullable<Window['Fingerprint']>;
  (window as unknown as { WebSdk: unknown }).WebSdk = webSdk;
  window.Fingerprint = factory(window, webSdk);
  return adc;
}

export function uninstallFakeAdc(): void {
  delete window.Fingerprint;
  delete (window as unknown as { WebSdk?: unknown }).WebSdk;
}

/** Espera hasta que `predicate` sea true (polling corto) o falla por timeout. */
export async function waitUntil(
  predicate: () => boolean,
  { timeoutMs = 2_000, intervalMs = 5 } = {},
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitUntil: timeout');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
