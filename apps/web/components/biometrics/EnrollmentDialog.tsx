'use client';

import * as React from 'react';
import { CheckCircle2, Fingerprint, XCircle } from 'lucide-react';
import { Alert, Button, Modal, Select, cn } from '@pulso/ui';
import { getAgentClient, useAgentStore, type AgentEvent } from '@/lib/agent';
import { startEnrollment } from '@/lib/api/biometrics';
import { ApiError } from '@/lib/api/errors';

const FINGERS = [
  { value: 'RIGHT_INDEX', label: 'Índice derecho' },
  { value: 'RIGHT_THUMB', label: 'Pulgar derecho' },
  { value: 'LEFT_INDEX', label: 'Índice izquierdo' },
  { value: 'LEFT_THUMB', label: 'Pulgar izquierdo' },
] as const;

const API_ERROR_LABEL: Record<string, string> = {
  NO_BIOMETRIC_CONSENT: 'El socio no tiene consentimiento biométrico vigente. Registralo primero.',
  FINGER_ALREADY_ENROLLED: 'Ese dedo ya tiene una credencial activa. Revocala antes de re-enrolar.',
  AGENT_OFFLINE: 'El agente local no reporta señales de vida en el backend.',
};

type Phase = 'idle' | 'capturing' | 'done' | 'cancelled' | 'failed';

interface Progress {
  captured: number;
  required: number;
  quality: number | null;
  warning?: string;
  prompt: string;
}

/**
 * Enrolamiento real (docs/biometrics/WEBSOCKET_PROTOCOL.md §9.1):
 * `POST /members/:id/biometrics/enrollments` emite un deviceToken de un solo
 * uso que va DIRECTO al agente por el WS local (`enroll.start`) — nunca se
 * guarda. El template viaja agente → backend; el navegador sólo ve progreso.
 * El nombre del socio es informativo: el agente jamás lo recibe.
 */
export function EnrollmentDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  localAgentId,
  deviceId,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName?: string;
  localAgentId: string;
  deviceId: string;
  onEnrolled?: () => void;
}) {
  const agentStatus = useAgentStore((s) => s.status);
  const [finger, setFinger] = React.useState<string>('RIGHT_INDEX');
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [finalQuality, setFinalQuality] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const opIdRef = React.useRef<string | null>(null);
  const startingRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;
    const unsubscribe = getAgentClient().subscribe((event: AgentEvent) => {
      if (event.type === 'enroll.progress' && event.payload.opId === opIdRef.current) {
        setProgress(event.payload);
      } else if (event.type === 'enroll.completed' && event.payload.opId === opIdRef.current) {
        setFinalQuality(event.payload.finalQuality);
        setPhase('done');
        opIdRef.current = null;
        onEnrolled?.();
      } else if (event.type === 'enroll.failed' && event.payload.opId === opIdRef.current) {
        setError(`La captura falló (${event.payload.code}).`);
        setPhase('failed');
        opIdRef.current = null;
      } else if (event.type === 'operation.cancelled' && event.payload.opId === opIdRef.current) {
        setPhase('cancelled');
        opIdRef.current = null;
      }
    });
    return unsubscribe;
  }, [open, onEnrolled]);

  const reset = React.useCallback(() => {
    setPhase('idle');
    setProgress(null);
    setFinalQuality(null);
    setError(null);
  }, []);

  const handleClose = (next: boolean) => {
    if (!next && opIdRef.current) {
      getAgentClient().cancel(opIdRef.current);
    }
    if (!next) reset();
    onOpenChange(next);
  };

  const start = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const session = await startEnrollment(
        memberId,
        { localAgentId, deviceId, fingerPosition: finger as 'RIGHT_INDEX' },
        crypto.randomUUID(),
      );
      const opId = getAgentClient().enrollStart({
        enrollmentId: session.enrollmentId,
        deviceToken: session.deviceToken,
        deviceId,
        samplesRequired: session.samplesRequired,
        minQuality: session.minQuality,
        fingerPosition: finger,
      });
      if (!opId) {
        setError('No se pudo iniciar la captura en el agente local.');
        setPhase('failed');
        return;
      }
      opIdRef.current = opId;
      setPhase('capturing');
      setProgress(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (API_ERROR_LABEL[err.code] ?? err.message)
          : 'No se pudo iniciar el enrolamiento.',
      );
      setPhase('failed');
    } finally {
      startingRef.current = false;
    }
  };

  const agentReady = agentStatus === 'ready' || agentStatus === 'busy';

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="Enrolar huella digital"
      description={memberName ? `Socio: ${memberName}` : undefined}
      size="md"
    >
      {!agentReady && phase === 'idle' ? (
        <Alert tone="warning" title="Agente local no conectado">
          El lector se opera a través del Pulso Agent instalado en esta PC. Verificá en Configuración → Dispositivos
          que el agente esté conectado y aprobado.
        </Alert>
      ) : null}

      {phase === 'idle' && agentReady ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label id="enroll-finger-label" className="text-(--text-sm) font-medium text-(--color-text)">
              Dedo a enrolar
            </label>
            <Select
              aria-labelledby="enroll-finger-label"
              value={finger}
              onValueChange={setFinger}
              options={FINGERS.map((f) => ({ value: f.value, label: f.label }))}
            />
          </div>
          <p className="text-(--text-sm) text-(--color-muted)">
            Se capturan varias muestras. Pedile al socio que apoye el dedo firme, lo levante y lo vuelva a apoyar en
            cada paso.
          </p>
        </div>
      ) : null}

      {phase === 'capturing' ? (
        <div className="flex flex-col items-center gap-4 py-2" aria-live="polite">
          <span
            className={cn(
              'flex h-20 w-20 items-center justify-center rounded-full border-2',
              progress?.warning
                ? 'border-(--color-warning) text-(--color-warning)'
                : 'animate-pulse border-(--color-primary) text-(--color-primary)',
            )}
          >
            <Fingerprint className="h-10 w-10" aria-hidden={true} />
          </span>
          <p className="text-center text-(--text-base) font-medium text-(--color-text)">
            {progress?.prompt ?? 'Iniciando captura…'}
          </p>
          <div className="flex items-center gap-2" aria-label={`${progress?.captured ?? 0} de ${progress?.required ?? 4} muestras`}>
            {Array.from({ length: progress?.required ?? 4 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-2.5 w-8 rounded-(--radius-full) transition-colors',
                  i < (progress?.captured ?? 0) ? 'bg-(--color-success)' : 'bg-(--color-muted-subtle)',
                )}
              />
            ))}
          </div>
          {progress?.quality != null ? (
            <p className={cn('text-(--text-sm)', progress.warning ? 'text-(--color-warning)' : 'text-(--color-muted)')}>
              Calidad de la última muestra: {progress.quality}/100
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === 'done' ? (
        <div className="flex flex-col items-center gap-3 py-4" role="status">
          <CheckCircle2 className="h-12 w-12 text-(--color-success)" aria-hidden={true} />
          <p className="text-(--text-base) font-medium text-(--color-text)">Huella enrolada correctamente</p>
          <p className="text-(--text-sm) text-(--color-muted)">
            Calidad del template: {finalQuality}/100 · {FINGERS.find((f) => f.value === finger)?.label}
          </p>
        </div>
      ) : null}

      {phase === 'cancelled' ? (
        <div className="flex flex-col items-center gap-3 py-4" role="status">
          <XCircle className="h-10 w-10 text-(--color-muted)" aria-hidden={true} />
          <p className="text-(--text-sm) text-(--color-muted)">Operación cancelada.</p>
        </div>
      ) : null}

      {phase === 'failed' && error ? (
        <Alert tone="danger" title="No se pudo enrolar">
          {error}
        </Alert>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        {phase === 'capturing' ? (
          <Button variant="outline" onClick={() => opIdRef.current && getAgentClient().cancel(opIdRef.current)}>
            Cancelar captura
          </Button>
        ) : (
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cerrar
          </Button>
        )}
        {phase === 'idle' && agentReady ? <Button onClick={() => void start()}>Iniciar captura</Button> : null}
        {phase === 'done' || phase === 'cancelled' || phase === 'failed' ? (
          <Button onClick={reset}>Enrolar otra</Button>
        ) : null}
      </div>
    </Modal>
  );
}
