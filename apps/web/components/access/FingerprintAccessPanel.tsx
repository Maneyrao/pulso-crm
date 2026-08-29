'use client';

import * as React from 'react';
import { Fingerprint, Square } from 'lucide-react';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { Button, StatusBadge, cn } from '@pulso/ui';
import { identifyHid } from '@/lib/api/biometrics';
import { ApiError } from '@/lib/api/errors';
import { getHidFingerprintClient } from '@/lib/hid/client';

type Phase = 'idle' | 'arming' | 'waiting' | 'captured' | 'resolving' | 'error';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Modo huella detenido',
  arming: 'Preparando lector',
  waiting: 'Esperando huella',
  captured: 'Huella leída',
  resolving: 'Validando acceso',
  error: 'Lectura interrumpida',
};

const ERROR_LABEL: Record<string, string> = {
  TEMPLATE_QUALITY_TOO_LOW: 'Calidad insuficiente. Limpiá el lector y volvé a apoyar el dedo.',
};

const NEXT_SCAN_DELAY_MS = 900;
const MODE_STORAGE_KEY = 'el-templo:fingerprint-mode';

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
  const [enabled, setEnabled] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [readerName, setReaderName] = React.useState<string | null>(null);
  const [cycle, setCycle] = React.useState(0);
  const enabledRef = React.useRef(false);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = React.useRef(onResult);
  const onAttemptRecordedRef = React.useRef(onAttemptRecorded);

  React.useEffect(() => {
    onResultRef.current = onResult;
    onAttemptRecordedRef.current = onAttemptRecorded;
  }, [onAttemptRecorded, onResult]);

  const scheduleNext = React.useCallback((delay = NEXT_SCAN_DELAY_MS) => {
    if (!enabledRef.current) return;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setCycle((value) => value + 1);
    }, delay);
  }, []);

  const stop = React.useCallback((remember = true) => {
    enabledRef.current = false;
    setEnabled(false);
    setPhase('idle');
    setError(null);
    if (remember) writeModePreference('disabled');
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    void getHidFingerprintClient().cancelCapture();
  }, []);

  React.useEffect(() => {
    if (!branchId || readModePreference() === 'disabled') return;
    enabledRef.current = true;
    setEnabled(true);
    setCycle((value) => value + 1);
  }, [branchId]);

  React.useEffect(
    () => () => {
      enabledRef.current = false;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      void getHidFingerprintClient().cancelCapture();
    },
    [],
  );

  React.useEffect(() => {
    if (!enabled || !branchId) return;
    let cancelled = false;

    const run = async () => {
      setError(null);
      setPhase('arming');
      try {
        const client = getHidFingerprintClient();
        const status = await client.check();
        if (status.state !== 'ready' || !status.reader) throw new Error(status.message);
        if (cancelled || !enabledRef.current) return;
        setReaderName(status.reader.model);
        setPhase('waiting');

        const sample = await client.captureSample();
        if (cancelled || !enabledRef.current) return;
        setPhase('captured');
        setPhase('resolving');
        const result = await identifyHid(
          {
            branchId,
            pngBase64: sample.pngBase64,
            qualityCode: sample.qualityCode,
          },
          crypto.randomUUID(),
        );
        if (cancelled || !enabledRef.current) return;
        onResultRef.current(result);
        onAttemptRecordedRef.current?.();
        setPhase('waiting');
        scheduleNext();
      } catch (reason) {
        if (cancelled || !enabledRef.current) return;
        setError(
          reason instanceof ApiError
            ? (ERROR_LABEL[reason.code] ?? reason.message)
            : reason instanceof Error
              ? reason.message
              : 'No se pudo leer la huella.',
        );
        setPhase('error');
        scheduleNext(1_500);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [branchId, cycle, enabled, scheduleNext]);

  const start = () => {
    if (!branchId) return;
    enabledRef.current = true;
    setEnabled(true);
    writeModePreference('enabled');
    setError(null);
    setCycle((value) => value + 1);
  };

  const statusTone =
    enabled && phase !== 'error' ? 'success' : phase === 'error' ? 'warning' : 'neutral';

  return (
    <section className="grid gap-4 border-2 border-(--color-border) bg-(--color-surface) p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
      <span
        aria-hidden={true}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-(--radius-full) border-2',
          enabled && phase !== 'error'
            ? 'border-(--color-primary) text-(--color-primary)'
            : 'border-(--color-border-strong) text-(--color-muted)',
          phase === 'waiting' || phase === 'captured' ? 'animate-pulse' : '',
        )}
      >
        <Fingerprint className="h-7 w-7" />
      </span>

      <div className="min-w-0" aria-live="polite">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="text-(--text-base) font-bold text-(--color-text)">Ingreso por huella</h2>
          <StatusBadge tone={statusTone} label={PHASE_LABEL[phase]} />
        </div>
        <p
          className={cn(
            'text-(--text-sm)',
            error ? 'text-(--color-danger)' : 'text-(--color-muted)',
          )}
        >
          {error ?? (readerName ? `Lector: ${readerName}` : 'HID DigitalPersona desde esta web')}
        </p>
      </div>

      {enabled ? (
        <Button type="button" variant="outline" onClick={() => stop(true)}>
          <Square className="h-4 w-4" aria-hidden={true} /> Detener huella
        </Button>
      ) : (
        <Button type="button" onClick={start} disabled={!branchId}>
          <Fingerprint className="h-4 w-4" aria-hidden={true} /> Activar huella
        </Button>
      )}
    </section>
  );
}
