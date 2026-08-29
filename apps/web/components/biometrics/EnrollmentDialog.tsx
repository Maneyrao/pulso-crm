'use client';

import * as React from 'react';
import { CheckCircle2, Fingerprint, LoaderCircle, RotateCcw } from 'lucide-react';
import { Alert, Button, Modal, Select, cn } from '@pulso/ui';
import { completeHidEnrollment, startHidEnrollment } from '@/lib/api/biometrics';
import { ApiError } from '@/lib/api/errors';
import { getHidFingerprintClient } from '@/lib/hid/client';

const FINGERS = [
  { value: 'RIGHT_INDEX', label: 'Índice derecho' },
  { value: 'RIGHT_THUMB', label: 'Pulgar derecho' },
  { value: 'LEFT_INDEX', label: 'Índice izquierdo' },
  { value: 'LEFT_THUMB', label: 'Pulgar izquierdo' },
] as const;

const API_ERROR_LABEL: Record<string, string> = {
  NO_BIOMETRIC_CONSENT: 'El socio no tiene consentimiento biométrico vigente. Registralo primero.',
  FINGER_ALREADY_ENROLLED: 'Ese dedo ya tiene una credencial activa. Revocala antes de re-enrolar.',
  TEMPLATE_QUALITY_TOO_LOW: 'La lectura no tuvo calidad suficiente. Limpiá el lector y reintentá.',
};

type Phase = 'idle' | 'checking' | 'capturing' | 'saving' | 'done' | 'failed';

const PHASE_COPY: Record<Exclude<Phase, 'idle' | 'done' | 'failed'>, string> = {
  checking: 'Comprobando el lector…',
  capturing: 'Apoyá el dedo y mantenelo quieto…',
  saving: 'Protegiendo y guardando la huella…',
};

export function EnrollmentDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  branchId,
  onEnrolled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName?: string;
  branchId: string;
  onEnrolled?: () => void;
}) {
  const [finger, setFinger] = React.useState<string>('RIGHT_INDEX');
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [captureMessage, setCaptureMessage] = React.useState<string | null>(null);
  const busy = phase === 'checking' || phase === 'capturing' || phase === 'saving';

  const reset = React.useCallback(() => {
    setPhase('idle');
    setError(null);
    setCaptureMessage(null);
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleClose = (next: boolean) => {
    if (!next && busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const capture = async () => {
    setError(null);
    setPhase('checking');
    try {
      const client = getHidFingerprintClient();
      const status = await client.check();
      if (status.state !== 'ready') throw new Error(status.message);

      const session = await startHidEnrollment(
        memberId,
        { branchId, fingerPosition: finger as 'RIGHT_INDEX' },
        crypto.randomUUID(),
      );

      setPhase('capturing');
      setCaptureMessage('Preparando el lector...');
      const sample = await client.captureSample(30_000, (progress) => {
        setCaptureMessage(progress.message);
      });
      setPhase('saving');
      await completeHidEnrollment(session.enrollmentId, {
        pngBase64: sample.pngBase64,
        qualityCode: sample.qualityCode,
      });

      setPhase('done');
      onEnrolled?.();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? (API_ERROR_LABEL[reason.code] ?? reason.message)
          : reason instanceof Error
            ? reason.message
            : 'No se pudo enrolar la huella.',
      );
      setPhase('failed');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="Enrolar huella digital"
      description={memberName ? `Socio: ${memberName}` : undefined}
      size="md"
    >
      {phase === 'idle' ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label
              id="enroll-finger-label"
              className="text-(--text-sm) font-medium text-(--color-text)"
            >
              Dedo a enrolar
            </label>
            <Select
              aria-labelledby="enroll-finger-label"
              value={finger}
              onValueChange={setFinger}
              options={FINGERS.map((item) => ({ value: item.value, label: item.label }))}
            />
          </div>
          <p className="text-(--text-sm) text-(--color-muted)">
            La captura ocurre acá mismo. Cuando el lector se ilumine, apoyá el dedo hasta recibir la
            confirmación.
          </p>
        </div>
      ) : null}

      {busy ? (
        <div className="flex flex-col items-center gap-4 py-5" aria-live="polite">
          <span
            className={cn(
              'flex h-20 w-20 items-center justify-center rounded-(--radius-full) border-2 border-(--color-primary) text-(--color-primary)',
              phase === 'capturing' ? 'animate-pulse' : '',
            )}
          >
            {phase === 'capturing' ? (
              <Fingerprint className="h-10 w-10" aria-hidden={true} />
            ) : (
              <LoaderCircle className="h-9 w-9 animate-spin" aria-hidden={true} />
            )}
          </span>
          <p className="text-center text-(--text-base) font-medium text-(--color-text)">
            {phase === 'capturing' && captureMessage ? captureMessage : PHASE_COPY[phase]}
          </p>
        </div>
      ) : null}

      {phase === 'done' ? (
        <div className="flex flex-col items-center gap-3 py-5" role="status">
          <CheckCircle2 className="h-12 w-12 text-(--color-success)" aria-hidden={true} />
          <p className="text-(--text-base) font-medium text-(--color-text)">
            Huella enrolada correctamente
          </p>
          <p className="text-(--text-sm) text-(--color-muted)">
            {FINGERS.find((item) => item.value === finger)?.label} quedó disponible para registrar
            ingresos.
          </p>
        </div>
      ) : null}

      {phase === 'failed' && error ? (
        <Alert tone="danger" title="No se pudo enrolar">
          {error}
        </Alert>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        {!busy ? (
          <Button variant="outline" onClick={() => handleClose(false)}>
            {phase === 'done' ? 'Listo' : 'Cerrar'}
          </Button>
        ) : null}
        {phase === 'idle' ? (
          <Button onClick={() => void capture()}>
            <Fingerprint className="h-4 w-4" aria-hidden={true} /> Capturar huella
          </Button>
        ) : null}
        {phase === 'failed' ? (
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden={true} /> Reintentar
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
