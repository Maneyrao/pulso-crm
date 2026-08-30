'use client';

import {
  HID_FINGERPRINT_SDK_VERSION,
  HID_WEBSDK_VERSION,
  isWindowsBrowser,
  sdkAvailable,
} from './webapi';

/**
 * Bitácora diagnóstica del lector HID. Guarda sólo metadatos (códigos,
 * tamaños, tiempos, estados): nunca imágenes, plantillas ni muestras.
 */

export type HidDiagnosticLevel = 'info' | 'warn' | 'error';

export interface HidDiagnosticEntry {
  seq: number;
  at: string;
  level: HidDiagnosticLevel;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface HidDiagnosticEnvironment {
  webSdkVersion: string;
  fingerprintSdkVersion: string;
  sdkLoaded: boolean;
  userAgent: string;
  platform: string;
  windows: boolean;
  webSocket: boolean;
  webLocks: boolean;
  secureContext: boolean;
  pageFocused: boolean;
  visibility: string;
  origin: string;
}

export interface HidDiagnosticReport {
  generatedAt: string;
  environment: HidDiagnosticEnvironment;
  session?: unknown;
  entries: HidDiagnosticEntry[];
}

const FORBIDDEN_KEYS = new Set([
  'pngbase64',
  'png',
  'samples',
  'sample',
  'template',
  'templates',
  'image',
  'images',
  'probe',
  'data',
]);
const MAX_STRING = 200;

/** Elimina cualquier dato biométrico o blob largo antes de registrarlo. */
export function sanitizeDiagnosticData(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `[string de ${value.length} caracteres omitido]` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (depth > 4) return '[profundidad omitida]';
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitizeDiagnosticData(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = FORBIDDEN_KEYS.has(key.toLowerCase())
        ? '[omitido]'
        : sanitizeDiagnosticData(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function snapshotEnvironment(): HidDiagnosticEnvironment {
  const hasWindow = typeof window !== 'undefined';
  return {
    webSdkVersion: HID_WEBSDK_VERSION,
    fingerprintSdkVersion: HID_FINGERPRINT_SDK_VERSION,
    sdkLoaded: sdkAvailable(),
    userAgent: hasWindow ? navigator.userAgent : 'server',
    platform: hasWindow ? navigator.platform : 'server',
    windows: isWindowsBrowser(),
    webSocket: typeof WebSocket !== 'undefined',
    webLocks: hasWindow && typeof navigator.locks !== 'undefined',
    secureContext: hasWindow ? window.isSecureContext : false,
    pageFocused: hasWindow ? document.hasFocus() : false,
    visibility: hasWindow ? document.visibilityState : 'unknown',
    origin: hasWindow ? window.location.origin : '',
  };
}

export class HidDiagnostics {
  private readonly limit: number;
  private readonly buffer: HidDiagnosticEntry[] = [];
  private readonly listeners = new Set<(entry: HidDiagnosticEntry) => void>();
  private seq = 0;

  constructor(options: { limit?: number } = {}) {
    this.limit = options.limit ?? 300;
  }

  record(
    level: HidDiagnosticLevel,
    type: string,
    message: string,
    data?: Record<string, unknown>,
  ): HidDiagnosticEntry {
    this.seq += 1;
    const entry: HidDiagnosticEntry = {
      seq: this.seq,
      at: new Date().toISOString(),
      level,
      type,
      message,
      ...(data ? { data: sanitizeDiagnosticData(data) as Record<string, unknown> } : {}),
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.limit) this.buffer.splice(0, this.buffer.length - this.limit);
    for (const listener of this.listeners) listener(entry);
    return entry;
  }

  info(type: string, message: string, data?: Record<string, unknown>) {
    return this.record('info', type, message, data);
  }

  warn(type: string, message: string, data?: Record<string, unknown>) {
    return this.record('warn', type, message, data);
  }

  error(type: string, message: string, data?: Record<string, unknown>) {
    return this.record('error', type, message, data);
  }

  entries(): HidDiagnosticEntry[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer.length = 0;
  }

  subscribe(listener: (entry: HidDiagnosticEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  buildReport(extra: { session?: unknown } = {}): HidDiagnosticReport {
    return {
      generatedAt: new Date().toISOString(),
      environment: snapshotEnvironment(),
      ...(extra.session !== undefined ? { session: sanitizeDiagnosticData(extra.session) } : {}),
      entries: this.entries(),
    };
  }

  toText(extra: { session?: unknown } = {}): string {
    const report = this.buildReport(extra);
    const lines = [
      `Informe diagnóstico HID — ${report.generatedAt}`,
      '',
      'Entorno:',
      ...Object.entries(report.environment).map(([key, value]) => `  ${key}: ${String(value)}`),
      '',
    ];
    if (report.session !== undefined) {
      lines.push('Sesión:', `  ${JSON.stringify(report.session)}`, '');
    }
    lines.push('Eventos:');
    for (const entry of report.entries) {
      const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
      lines.push(`  ${entry.at} [${entry.level}] ${entry.type} — ${entry.message}${data}`);
    }
    return lines.join('\n');
  }
}

let shared: HidDiagnostics | null = null;

export function getHidDiagnostics(): HidDiagnostics {
  shared ??= new HidDiagnostics();
  return shared;
}
