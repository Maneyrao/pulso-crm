'use client';

import * as React from 'react';
import { Fingerprint, Square, Stethoscope } from 'lucide-react';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { Button, StatusBadge, cn } from '@pulso/ui';
import { identifyHid } from '@/lib/api/biometrics';
import { ApiError } from '@/lib/api/errors';
import { HidDiagnosticsPanel } from '@/components/biometrics/HidDiagnosticsPanel';
import { getHidCaptureSession } from '@/lib/hid/session';
import type { HidSample, HidSampleOutcome, HidSessionState } from '@/lib/hid/session';
import { useHidCaptureReporter, useHidSessionSnapshot } from '@/lib/hid/useHidSession';

/**
 * Terminal de acceso por huella. Al entrar a la pantalla el lector queda
 * armado en modo continuo: cada dedo que se apoya dispara una identificación y
 * el panel vuelve solo a "Esperando huella". No hay botón "Capturar" por
 * lectura, no se abre ninguna ventana externa y todo el estado —incluido el
 * diagnóstico— se ve acá adentro.
 */

const PHASE_LABEL: Record<HidSessionState, string> = {
  DISCONNECTED: 'Modo huella detenido',
  CONNECTING: 'Conectando con el lector',
  READY: 'Lector listo',
  ACQUIRING: 'Esperando huella',
  FINGER_DETECTED: 'Dedo detectado',
  SAMPLE_RECEIVED: 'Huella leída',
  IDENTIFYING: 'Validando acceso',
  ACCESS_GRANTED: 'Acceso permitido',
  ACCESS_DENIED: 'Acceso rechazado',
  RECOVERING: 'Reconectando el lector',
  PAUSED: 'Lectura pausada',
  ERROR: 'Lectura interrumpida',
};

const ERROR_LABEL: Record<string, string> = {
  TEMPLATE_QUALITY_TOO_LOW: 'Calidad insuficiente. Limpiá el lector y volvé a apoyar el dedo.',
  BIOMETRIC_MATCHER_UNAVAILABLE:
    'El servicio biométrico no responde. Se reintenta en la próxima lectura.',
};

const MODE_STORAGE_KEY = 'el-templo:fingerprint-mode';
/** Estados en los que el lector está operativo esperando o procesando un dedo. */
const LIVE_STATES = new Set<HidSessionState>([
  'ACQUIRING',
  'FINGER_DETECTED',
  'SAMPLE_RECEIVED',
  'IDENTIFYING',
  'ACCESS_GRANTED',
  'ACCESS_DENIED',
]);

function readModePreference(): 'enabled' | 'disabled' | null {
  try {
    const value = window.localStorage.getItem(MODE_STORAGE_KEY);
    return value === 'enabled' || value === 'disabled' ? value : null;
  } catch {
    return null;
  }
}

function writeModePreference(value: 'enabled' | 'disabled'): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, value);
  } catch {
    // El modo sigue funcionando durante la sesión aunque storage esté bloqueado.
  }
}

export function FingerprintAccessPanel({
  branchId,
  onResult,
  onAttemptRecorded,
}: {
  branchId: string | null;
  onResult: (result: AccessCheckResponse) => void;
  onAttemptRecorded?: () => void;
}) {
  const session = React.useMemo(() => getHidCaptureSession(), []);
  const snapshot = useHidSessionSnapshot(session);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);

  const branchRef = React.useRef(branchId);
  const onResultRef = React.useRef(onResult);
  const onAttemptRecordedRef = React.useRef(onAttemptRecorded);
  React.useEffect(() => {
    branchRef.current = branchId;
    onResultRef.current = onResult;
    onAttemptRecordedRef.current = onAttemptRecorded;
  }, [branchId, onAttemptRecorded, onResult]);

  useHidCaptureReporter(branchId, session);

  /** Envía la muestra a la API y traduce el resultado a un estado del lector. */
  const handleSample = React.useCallback(
    async (sample: HidSample): Promise<HidSampleOutcome> => {
      const activeBranch = branchRef.current;
      if (!activeBranch) return { kind: 'error' };
      try {
        setApiError(null);
        const result = await identifyHid(
          {
            branchId: activeBranch,
            pngBase64: sample.pngBase64,
            qualityCode: sample.qualityCode,
            capture: {
              sessionId: sample.sessionId,
              deviceUid: sample.deviceUid,
              readerModel: session.getSnapshot().reader?.model ?? 'HID DigitalPersona',
              acquisitionStartedAt: session.getSnapshot().acquisitionStartedAt,
              acquiredAt: sample.acquiredAt,
              sampleBytes: sample.byteLength,
            },
          },
          crypto.randomUUID(),
        );
        onResultRef.current(result);
        onAttemptRecordedRef.current?.();
        return { kind: result.decision === 'ALLOWED' ? 'granted' : 'denied' };
      } catch (reason) {
        setApiError(
          reason instanceof ApiError
            ? (ERROR_LABEL[reason.code] ?? reason.message)
            : reason instanceof Error
              ? reason.message
              : 'No se pudo validar la huella.',
        );
        return { kind: 'error' };
      }
    },
    [session],
  );

  const start = React.useCallback(
    (remember: boolean) => {
      if (!branchRef.current || session.isActive()) return;
      if (remember) writeModePreference('enabled');
      setApiError(null);
      setRunning(true);
      void session
        .start({ mode: 'continuous', onSample: handleSample })
        .catch(() => setRunning(false));
    },
    [handleSample, session],
  );

  const stop = React.useCallback(() => {
    writeModePreference('disabled');
    setRunning(false);
    void session.stop();
  }, [session]);

  // Arranque automático al entrar con una sede activa. Cambiar de sede
  // reinicia la sesión para que la traza y el padrón sean los correctos.
  React.useEffect(() => {
    if (!branchId) return undefined;
    if (readModePreference() === 'disabled') return undefined;
    start(false);
    return () => {
      setRunning(false);
      void session.stop();
    };
  }, [branchId, session, start]);

  const live = LIVE_STATES.has(snapshot.state);
  const active = running || session.isActive();
  const statusTone = live
    ? 'success'
    : snapshot.state === 'ERROR'
      ? 'danger'
      : snapshot.state === 'RECOVERING' || snapshot.state === 'PAUSED'
        ? 'warning'
        : 'neutral';

  const hint =
    apiError ??
    snapshot.lastError ??
    (snapshot.state === 'FINGER_DETECTED' ? snapshot.lastQuality?.message : null) ??
    (snapshot.reader ? `Lector: ${snapshot.reader.model}` : 'HID DigitalPersona desde esta web');
  const isProblem = Boolean(apiError ?? snapshot.lastError);

  return (
    <section className="grid gap-4 border-2 border-(--color-border) bg-(--color-surface) p-4">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <span
          aria-hidden={true}
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-(--radius-full) border-2',
            live
              ? 'border-(--color-primary) text-(--color-primary)'
              : 'border-(--color-border-strong) text-(--color-muted)',
            snapshot.state === 'ACQUIRING' || snapshot.state === 'FINGER_DETECTED'
              ? 'animate-pulse'
              : '',
          )}
        >
          <Fingerprint className="h-7 w-7" />
        </span>

        <div className="min-w-0" aria-live="polite">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-(--text-base) font-bold text-(--color-text)">Ingreso por huella</h2>
            <StatusBadge tone={statusTone} label={PHASE_LABEL[snapshot.state]} />
          </div>
          <p
            className={cn(
              'text-(--text-sm)',
              isProblem ? 'text-(--color-danger)' : 'text-(--color-muted)',
            )}
          >
            {hint}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={showDiagnostics}
            onClick={() => setShowDiagnostics((value) => !value)}
          >
            <Stethoscope className="h-4 w-4" aria-hidden={true} /> Diagnóstico
          </Button>
          {active ? (
            <Button type="button" variant="outline" onClick={stop}>
              <Square className="h-4 w-4" aria-hidden={true} /> Detener huella
            </Button>
          ) : (
            <Button type="button" onClick={() => start(true)} disabled={!branchId}>
              <Fingerprint className="h-4 w-4" aria-hidden={true} /> Activar huella
            </Button>
          )}
        </div>
      </div>

      {snapshot.state === 'ERROR' ? (
        <div className="flex flex-wrap items-center gap-3 border-2 border-(--color-danger) p-3">
          <p className="flex-1 text-(--text-sm) text-(--color-text)">
            El lector no respondió después de varios reintentos. Revisá el cable USB y que HID
            Authentication Device Client esté corriendo.
          </p>
          <Button type="button" size="sm" onClick={() => session.retry()}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {showDiagnostics ? <HidDiagnosticsPanel session={session} /> : null}
    </section>
  );
}
