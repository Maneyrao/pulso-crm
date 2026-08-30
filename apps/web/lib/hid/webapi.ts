'use client';

import webPackage from '../../package.json';

/**
 * Acceso ÚNICO al SDK oficial de HID (`Fingerprint.WebApi`, cargado por
 * `<script>` en `app/layout.tsx`). Toda la app comparte una sola instancia por
 * pestaña: cada instancia abre su propio canal WebSocket contra ADC y varias
 * instancias compiten por las notificaciones del lector.
 */

/**
 * Versiones declaradas (exactas, sin `^`) en apps/web/package.json. El script
 * `scripts/prepare-hid-websdk.mjs` verifica en cada build que los archivos
 * copiados a public/vendor/hid provengan de esas mismas versiones.
 */
export const HID_WEBSDK_VERSION: string = webPackage.dependencies['@digitalpersona/websdk'];
export const HID_FINGERPRINT_SDK_VERSION: string =
  webPackage.dependencies['@digitalpersona/fingerprint'];

/** Claves que `websdk.client.ui.js` guarda en sessionStorage (puerto + credenciales SRP del ADC). */
export const WEBSDK_SESSION_KEYS = ['websdk', 'websdk.sessionId'] as const;

export interface HidSamplesAcquiredEvent {
  deviceUid?: string;
  sampleFormat?: number;
  samples: unknown;
}

export interface HidQualityReportedEvent {
  deviceUid?: string;
  quality: number;
}

export interface HidErrorOccurredEvent {
  deviceUid?: string;
  error: number;
}

export interface HidDeviceEvent {
  deviceUid?: string;
}

export interface HidDeviceInfo {
  DeviceID?: string;
  eUidType?: number;
  eDeviceModality?: number;
  eDeviceTech?: number;
}

type Handler<E> = (event: E) => void;

/** Superficie del `Fingerprint.WebApi` oficial que usa la app. */
export interface HidWebApi {
  enumerateDevices(): Promise<string[]>;
  getDeviceInfo(deviceUid: string): Promise<HidDeviceInfo>;
  startAcquisition(sampleFormat: number, deviceUid?: string): Promise<void>;
  stopAcquisition(deviceUid?: string): Promise<void>;
  on(event: string, handler: Handler<never>): unknown;
  off(event?: string, handler?: Handler<never>): unknown;
  onSamplesAcquired?: Handler<HidSamplesAcquiredEvent>;
  onQualityReported?: Handler<HidQualityReportedEvent>;
  onAcquisitionStarted?: Handler<HidDeviceEvent>;
  onAcquisitionStopped?: Handler<HidDeviceEvent>;
  onDeviceConnected?: Handler<HidDeviceEvent>;
  onDeviceDisconnected?: Handler<HidDeviceEvent>;
  onErrorOccurred?: Handler<HidErrorOccurredEvent>;
  onCommunicationFailed?: Handler<unknown>;
}

interface HidSdkGlobal {
  WebApi: new (options?: { debug?: boolean }) => HidWebApi;
  SampleFormat: { Raw: number; Intermediate: number; Compressed: number; PngImage: number };
  QualityCode?: Record<string, number | string>;
  b64UrlTo64(value: string): string;
}

declare global {
  interface Window {
    Fingerprint?: HidSdkGlobal;
  }
}

export const CLIENT_MISSING_MESSAGE =
  'No se detectó HID Authentication Device Client. Instalalo junto con el driver HID Legacy del DigitalPersona 4500.';

export function isWindowsBrowser(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Windows/i.test(navigator.userAgent);
}

export function browserSupported(): boolean {
  return isWindowsBrowser() && typeof WebSocket !== 'undefined';
}

export function sdkAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.Fingerprint?.WebApi === 'function';
}

export function hidSampleFormat(): { PngImage: number } {
  return window.Fingerprint?.SampleFormat ?? { PngImage: 5 };
}

let instance: HidWebApi | null = null;

/** Instancia única de `Fingerprint.WebApi` por pestaña. Lanza si el SDK no cargó. */
export function getHidWebApi(): HidWebApi {
  if (!sdkAvailable()) throw new Error(CLIENT_MISSING_MESSAGE);
  instance ??= new window.Fingerprint!.WebApi({ debug: false });
  return instance;
}

/** Sólo para tests: descarta la instancia compartida. */
export function resetHidWebApiForTests(): void {
  instance = null;
}

/**
 * Limpia el caché de sesión del WebSdk. Tras reiniciar ADC cambian el puerto y
 * las credenciales SRP; el WebSdk relee sessionStorage y, con datos viejos,
 * reintenta cada 5 s contra un endpoint que ya no existe (loop infinito).
 */
export function resetWebSdkSessionCache(): void {
  try {
    for (const key of WEBSDK_SESSION_KEYS) window.sessionStorage.removeItem(key);
  } catch {
    // sessionStorage bloqueado: no hay caché que limpiar.
  }
}

/** Convierte base64url (formato de las muestras ADC) a base64 estándar. */
export function base64UrlToBase64(value: string): string {
  const fromSdk = window.Fingerprint?.b64UrlTo64;
  if (fromSdk) return fromSdk(value);
  let out = value.replace(/-/g, '+').replace(/_/g, '/');
  if (out.length % 4 === 2) out += '==';
  else if (out.length % 4 === 3) out += '=';
  return out;
}

export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Códigos `Fingerprint.QualityCode` del SDK oficial. */
export const HID_QUALITY_LABELS: Record<number, string> = {
  0: 'Good',
  1: 'NoImage',
  2: 'TooLight',
  3: 'TooDark',
  4: 'TooNoisy',
  5: 'LowContrast',
  6: 'NotEnoughFeatures',
  7: 'NotCentered',
  8: 'NotAFinger',
  9: 'TooHigh',
  10: 'TooLow',
  11: 'TooLeft',
  12: 'TooRight',
  13: 'TooStrange',
  14: 'TooFast',
  15: 'TooSkewed',
  16: 'TooShort',
  17: 'TooSlow',
  18: 'ReverseMotion',
  19: 'PressureTooHard',
  20: 'PressureTooLight',
  21: 'WetFinger',
  22: 'FakeFinger',
  23: 'TooSmall',
  24: 'RotatedTooMuch',
};

export const HID_QUALITY_MESSAGES: Record<number, string> = {
  0: 'Dedo detectado. Procesando la muestra...',
  1: 'No se detectó una imagen. Volvé a apoyar el dedo.',
  2: 'La lectura quedó muy clara. Apoyá el dedo de forma pareja.',
  3: 'La lectura quedó muy oscura. Reducí la presión.',
  4: 'La lectura tuvo ruido. Limpiá el lector y reintentá.',
  5: 'La huella tiene poco contraste. Apoyá todo el dedo.',
  6: 'No se detectaron suficientes detalles. Reubicá el dedo.',
  7: 'Centrá el dedo sobre el lector.',
  8: 'El lector no detectó un dedo.',
  9: 'Bajá un poco el dedo sobre el lector.',
  10: 'Subí un poco el dedo sobre el lector.',
  11: 'Movéte un poco a la derecha.',
  12: 'Movéte un poco a la izquierda.',
  13: 'Lectura extraña. Volvé a apoyar el dedo.',
  14: 'Movimiento demasiado rápido. Mantené el dedo quieto.',
  15: 'El dedo quedó torcido. Apoyalo derecho.',
  16: 'Lectura demasiado corta. Mantené el dedo apoyado.',
  17: 'Movimiento demasiado lento.',
  18: 'Movimiento inverso. Volvé a intentar.',
  19: 'Estás presionando demasiado fuerte.',
  20: 'Presioná un poco más el dedo.',
  21: 'El dedo o el lector están húmedos. Secalos y reintentá.',
  22: 'El lector no reconoció un dedo real.',
  23: 'Apoyá una superficie mayor del dedo.',
  24: 'Mantené el dedo derecho y quieto.',
};

export function describeQuality(code: number): { label: string; message: string } {
  return {
    label: HID_QUALITY_LABELS[code] ?? `Unknown(${code})`,
    message:
      HID_QUALITY_MESSAGES[code] ??
      `El lector rechazó la muestra por calidad (código ${code}). Reubicá el dedo.`,
  };
}

/** HRESULT/uint32 → "0x8007048F". ADC entrega `uError` como entero sin signo. */
export function formatHidErrorCode(code: number): string {
  return `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
