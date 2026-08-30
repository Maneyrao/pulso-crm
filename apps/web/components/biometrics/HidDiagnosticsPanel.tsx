'use client';

import * as React from 'react';
import { Download, LoaderCircle, Trash2, Waves } from 'lucide-react';
import { Button, StatusBadge, cn } from '@pulso/ui';
import {
  getHidDiagnostics,
  snapshotEnvironment,
  type HidDiagnostics,
  type HidDiagnosticEntry,
} from '@/lib/hid/diagnostics';
import {
  getHidCaptureSession,
  type HidCaptureSession,
  type HidFormatProbeResult,
} from '@/lib/hid/session';
import { useHidSessionSnapshot } from '@/lib/hid/useHidSession';

/**
 * Modo diagnóstico dentro del CRM: versiones del SDK, estado del cliente local,
 * datos del lector, cada evento HID con su código, y descarga de un informe
 * sanitizado. Sirve para separar un problema de código de uno de driver, ADC o
 * hardware sin abrir la consola del navegador.
 *
 * Nunca muestra ni exporta imágenes ni plantillas: `HidDiagnostics` sanea cada
 * entrada antes de guardarla.
 */

const LEVEL_TONE = {
  info: 'neutral',
  warn: 'warning',
  error: 'danger',
} as const;

function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleTimeString('es-AR', { hour12: false })}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

export function HidDiagnosticsPanel({
  session = getHidCaptureSession(),
  diagnostics = getHidDiagnostics(),
  probeMsPerFormat,
}: {
  session?: HidCaptureSession;
  diagnostics?: HidDiagnostics;
  /** Segundos por formato en el sondeo. Sólo se ajusta en tests. */
  probeMsPerFormat?: number;
}) {
  const snapshot = useHidSessionSnapshot(session);
  const [entries, setEntries] = React.useState<HidDiagnosticEntry[]>(() => diagnostics.entries());
  const [probing, setProbing] = React.useState(false);
  const [probe, setProbe] = React.useState<HidFormatProbeResult[] | null>(null);
  const [probeError, setProbeError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEntries(diagnostics.entries());
    return diagnostics.subscribe(() => setEntries(diagnostics.entries()));
  }, [diagnostics]);

  const environment = React.useMemo(() => snapshotEnvironment(), []);

  /**
   * Prueba cada formato contra el lector real. Es lo que permite afirmar, con
   * evidencia y no por descarte, si el sensor no entrega frames a esta PC o si
   * el único formato que falla es el que usa el CRM.
   */
  const runProbe = async () => {
    setProbing(true);
    setProbeError(null);
    setProbe(null);
    try {
      setProbe(
        await session.probeSampleFormats(probeMsPerFormat ? { perFormatMs: probeMsPerFormat } : {}),
      );
    } catch (reason) {
      setProbeError(reason instanceof Error ? reason.message : 'No se pudo sondear el lector.');
    } finally {
      setProbing(false);
    }
  };

  const download = () => {
    const report = diagnostics.buildReport({ session: { ...snapshot, formatProbe: probe } });
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `diagnostico-huella-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const facts: Array<{ label: string; value: string }> = [
    { label: 'WebSDK', value: environment.webSdkVersion },
    { label: 'Fingerprint SDK', value: environment.fingerprintSdkVersion },
    { label: 'SDK cargado', value: environment.sdkLoaded ? 'sí' : 'no' },
    { label: 'Sistema', value: environment.windows ? 'Windows' : environment.platform },
    { label: 'Contexto seguro', value: environment.secureContext ? 'sí' : 'no' },
    { label: 'Web Locks', value: environment.webLocks ? 'disponible' : 'no disponible' },
    { label: 'Estado', value: snapshot.state },
    { label: 'Propiedad del lector', value: snapshot.ownership },
    { label: 'Lector', value: snapshot.reader?.model ?? '—' },
    { label: 'Device UID', value: snapshot.reader?.id ?? '—' },
    { label: 'Lectores enumerados', value: String(snapshot.readers.length) },
    { label: 'Sesión', value: snapshot.sessionId ?? '—' },
    { label: 'Adquisición iniciada', value: snapshot.acquisitionStartedAt ?? '—' },
    { label: 'Muestras recibidas', value: String(snapshot.samplesReceived) },
    { label: 'Muestras descartadas', value: String(snapshot.samplesDropped) },
    {
      label: 'Última calidad',
      value: snapshot.lastQuality
        ? `${snapshot.lastQuality.code} (${snapshot.lastQuality.label})`
        : '—',
    },
    { label: 'Última señal de HID', value: snapshot.lastHidEventAt ?? 'ninguna' },
    { label: 'Adquisición muda', value: snapshot.silent ? 'sí' : 'no' },
    { label: 'Reintentos', value: String(snapshot.recoveryAttempt) },
    { label: 'Foco de la pestaña', value: snapshot.pageFocused ? 'con foco' : 'sin foco' },
  ];

  return (
    <div className="grid gap-3 border-2 border-(--color-border-strong) p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-(--text-sm) font-bold text-(--color-text)">Diagnóstico del lector</h3>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={probing || !snapshot.reader}
            onClick={() => void runProbe()}
          >
            {probing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden={true} />
            ) : (
              <Waves className="h-4 w-4" aria-hidden={true} />
            )}{' '}
            Sondear formatos
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={download}>
            <Download className="h-4 w-4" aria-hidden={true} /> Descargar informe
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              diagnostics.clear();
              setEntries([]);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden={true} /> Limpiar
          </Button>
        </div>
      </div>

      {!snapshot.pageFocused ? (
        <p className="text-(--text-sm) text-(--color-warning)">
          La pestaña está sin foco. HID entrega las muestras a la ventana activa: si el operador
          trabaja en otra ventana, el lector puede no responder.
        </p>
      ) : null}

      {probing ? (
        <p className="text-(--text-sm) text-(--color-muted)" role="status">
          Sondeando cada formato contra el lector. Mantené el dedo apoyado hasta que termine.
        </p>
      ) : null}

      {probeError ? <p className="text-(--text-sm) text-(--color-danger)">{probeError}</p> : null}

      {probe ? (
        <div className="grid gap-2 border-2 border-(--color-border) p-3">
          <p className="text-(--text-sm) font-bold text-(--color-text)">Sondeo de formatos</p>
          <ul className="grid gap-1 text-(--text-sm)">
            {probe.map((result) => (
              <li key={result.format} className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-(--text-xs) text-(--color-muted)">
                  {result.formatLabel} ({result.format})
                </span>
                <span className="text-(--color-text)">
                  {result.sampleCount} muestra(s) · {result.qualityReports} calidad(es)
                  {result.errorCodeHex ? ` · error ${result.errorCodeHex}` : ''}
                  {result.startError ? ` · ${result.startError}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-(--text-sm) text-(--color-muted)">
            {probe.every((result) => result.sampleCount === 0 && result.qualityReports === 0)
              ? 'Ningún formato produjo señal: el sensor no está entregando imágenes al cliente HID de esta PC. Es un problema de driver, de otro programa que tomó el lector o del hardware, no del CRM.'
              : probe.find((result) => result.format === 5)?.sampleCount === 0
                ? 'El lector entrega muestras en otro formato pero no en PngImage: el problema es el formato, no el dispositivo. Pasá este resultado al equipo para cambiar el formato de captura.'
                : 'El lector entregó muestras en PngImage: la captura funciona a nivel dispositivo.'}
          </p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-(--text-sm) sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex min-w-0 flex-col">
            <dt className="text-(--color-muted)">{fact.label}</dt>
            <dd className="truncate font-medium text-(--color-text)" title={fact.value}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="max-h-72 overflow-y-auto border-2 border-(--color-border)">
        {entries.length === 0 ? (
          <p className="p-3 text-(--text-sm) text-(--color-muted)">
            Todavía no se registraron eventos del lector en esta pestaña.
          </p>
        ) : (
          <ul className="divide-y divide-(--color-border)">
            {[...entries].reverse().map((entry) => (
              <li key={entry.seq} className="flex flex-wrap items-baseline gap-2 p-2">
                <span className="font-mono text-(--text-xs) text-(--color-muted)">
                  {formatTime(entry.at)}
                </span>
                <StatusBadge tone={LEVEL_TONE[entry.level]} label={entry.level} />
                <span className="font-mono text-(--text-xs) font-medium text-(--color-text)">
                  {entry.type}
                </span>
                <span className="text-(--text-sm) text-(--color-text)">{entry.message}</span>
                {entry.data ? (
                  <code
                    className={cn(
                      'w-full break-all font-mono text-(--text-xs) text-(--color-muted)',
                    )}
                  >
                    {JSON.stringify(entry.data)}
                  </code>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
