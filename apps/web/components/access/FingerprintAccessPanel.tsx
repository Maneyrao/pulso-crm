'use client';

import * as React from 'react';
import { Fingerprint, Square } from 'lucide-react';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { Button, StatusBadge, cn } from '@pulso/ui';
import { getAgentClient, useAgentStore, type AgentEvent } from '@/lib/agent';
import { getAccessAttemptResult, listAccessAttempts } from '@/lib/api/access';
import { startIdentification } from '@/lib/api/biometrics';
import { ApiError } from '@/lib/api/errors';

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
  AGENT_OFFLINE: 'El agente o el lector no están online.',
  QUALITY_TOO_LOW: 'Calidad insuficiente. Volvé a apoyar el dedo.',
  DEVICE_DISCONNECTED: 'El lector se desconectó.',
  BACKEND_UNREACHABLE: 'El agente no puede alcanzar el backend.',
  INVALID_TOKEN: 'La sesión venció. Preparando una nueva lectura.',
};

const NEXT_SCAN_DELAY_MS = 900;
const RESULT_POLL_DELAY_MS = 250;
const RESULT_POLL_ATTEMPTS = 8;
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
    // El modo sigue funcionando durante la sesión aunque el navegador bloquee storage.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function resolveLatestFingerprint(
  branchId: string,
  from: string,
): Promise<AccessCheckResponse> {
  for (let attempt = 0; attempt < RESULT_POLL_ATTEMPTS; attempt += 1) {
    const response = await listAccessAttempts(branchId, 3, { method: 'FINGERPRINT', from });
    const latest = response.data[0];
    if (latest) return getAccessAttemptResult(latest.id);
    await sleep(RESULT_POLL_DELAY_MS);
  }
  throw new Error('El backend no publicó el resultado de la lectura a tiempo.');
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
  const agentStatus = useAgentStore((state) => state.status);
  const deviceName = useAgentStore((state) => state.deviceName);
  const [enabled, setEnabled] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [cycle, setCycle] = React.useState(0);
  const enabledRef = React.useRef(false);
  const opIdRef = React.useRef<string | null>(null);
  const cycleStartedAtRef = React.useRef<string | null>(null);
  const retryTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = React.useRef(false);
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
    if (remember) writeModePreference('disabled');
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    if (opIdRef.current) getAgentClient().identifyStop(opIdRef.current);
    opIdRef.current = null;
    cycleStartedAtRef.current = null;
    setPhase('idle');
    setError(null);
  }, []);

  React.useEffect(() => {
    getAgentClient().connect();
    return () => stop(false);
  }, [stop]);

  React.useEffect(() => {
    if (!branchId || readModePreference() === 'disabled') return;
    enabledRef.current = true;
    setEnabled(true);
    setCycle((value) => value + 1);
  }, [branchId]);

  React.useEffect(() => {
    const unsubscribe = getAgentClient().subscribe((event: AgentEvent) => {
      if ('opId' in event.payload && event.payload.opId !== opIdRef.current) return;

      if (event.type === 'identify.captured') {
        setPhase('captured');
        return;
      }

      if (event.type === 'identify.sent') {
        const startedAt = cycleStartedAtRef.current;
        opIdRef.current = null;
        setPhase('resolving');
        if (!branchId || !startedAt) {
          setError('No se pudo asociar la lectura con la sede activa.');
          setPhase('error');
          scheduleNext();
          return;
        }
        void resolveLatestFingerprint(branchId, startedAt)
          .then((result) => {
            if (!enabledRef.current) return;
            onResultRef.current(result);
            onAttemptRecordedRef.current?.();
            setError(null);
            setPhase('waiting');
            scheduleNext();
          })
          .catch((reason: unknown) => {
            if (!enabledRef.current) return;
            setError(reason instanceof Error ? reason.message : 'No se pudo obtener el resultado.');
            setPhase('error');
            scheduleNext(1_500);
          });
        return;
      }

      if (event.type === 'identify.failed') {
        opIdRef.current = null;
        setError(ERROR_LABEL[event.payload.code] ?? `La lectura falló (${event.payload.code}).`);
        setPhase('error');
        scheduleNext(1_200);
      } else if (
        event.type === 'error' &&
        (!event.payload.opId || event.payload.opId === opIdRef.current)
      ) {
        opIdRef.current = null;
        setError(ERROR_LABEL[event.payload.code] ?? `El agente informó ${event.payload.code}.`);
        setPhase('error');
        scheduleNext(1_500);
      }
    });
    return unsubscribe;
  }, [branchId, scheduleNext]);

  React.useEffect(() => {
    if (!enabled || !branchId || agentStatus !== 'ready' || startingRef.current || opIdRef.current)
      return;
    let cancelled = false;
    startingRef.current = true;
    setPhase('arming');
    setError(null);
    // Un segundo de tolerancia evita perder la fila por diferencias de precisión de reloj.
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    cycleStartedAtRef.current = startedAt;

    void startIdentification({ branchId }, crypto.randomUUID())
      .then((session) => {
        if (cancelled || !enabledRef.current) return;
        const opId = getAgentClient().identifyStart({
          deviceToken: session.deviceToken,
          deviceId: session.deviceId,
          branchId,
          minQuality: session.minQuality,
          continuous: false,
        });
        if (!opId) throw new Error('No se pudo iniciar la lectura en el agente local.');
        opIdRef.current = opId;
        setPhase('waiting');
      })
      .catch((reason: unknown) => {
        if (cancelled || !enabledRef.current) return;
        setError(
          reason instanceof ApiError
            ? (ERROR_LABEL[reason.code] ?? reason.message)
            : reason instanceof Error
              ? reason.message
              : 'No se pudo preparar la lectura.',
        );
        setPhase('error');
        scheduleNext(1_500);
      })
      .finally(() => {
        startingRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [agentStatus, branchId, cycle, enabled, scheduleNext]);

  const start = () => {
    if (!branchId) return;
    enabledRef.current = true;
    setEnabled(true);
    writeModePreference('enabled');
    setError(null);
    setCycle((value) => value + 1);
  };

  const ready = agentStatus === 'ready';
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
          phase === 'captured' ? 'animate-pulse' : '',
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
          {error ??
            (deviceName
              ? `Lector: ${deviceName}`
              : ready
                ? 'Lector conectado'
                : 'Agente local sin conexión')}
        </p>
      </div>

      {enabled ? (
        <Button type="button" variant="outline" onClick={() => stop(true)}>
          <Square className="h-4 w-4" aria-hidden={true} /> Detener huella
        </Button>
      ) : (
        <Button type="button" onClick={start} disabled={!branchId || !ready}>
          <Fingerprint className="h-4 w-4" aria-hidden={true} /> Activar huella
        </Button>
      )}
    </section>
  );
}
