'use client';

import * as React from 'react';
import { CheckCircle2, Fingerprint, LoaderCircle, RotateCcw, Stethoscope } from 'lucide-react';
import { Alert, Button, Modal, Select, cn } from '@pulso/ui';
import { completeHidEnrollment, startHidEnrollment } from '@/lib/api/biometrics';
import { ApiError } from '@/lib/api/errors';
import { getHidCaptureSession } from '@/lib/hid/session';
import type { HidSample } from '@/lib/hid/session';
import { useHidCaptureReporter, useHidSessionSnapshot } from '@/lib/hid/useHidSession';
import { HidDiagnosticsPanel } from './HidDiagnosticsPanel';

/**
 * Enrolamiento de una huella desde el CRM. El backend decide cuántas muestras
 * exige (`samplesRequired`) y las cruza entre sí antes de crear la credencial:
 * una sola imagen no garantiza que después reconozca al socio. Todo ocurre
 * dentro de este modal — no se abre ninguna ventana del agente.
 */

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
  ENROLLMENT_SAMPLES_INCONSISTENT:
    'Las muestras no coinciden entre sí. Apoyá siempre el mismo dedo, centrado y quieto, y repetí.',
  BIOMETRIC_MATCHER_UNAVAILABLE:
    'El servicio biométrico no está disponible en este momento. Reintentá en unos segundos.',
  CONFLICT: 'Esa huella ya está enrolada.',
};

type Phase = 'idle' | 'preparing' | 'capturing' | 'saving' | 'done' | 'failed';

interface CredentialSummary {
  quality: number;
  samplesUsed: number;
  consistencyScore: number | null;
}

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
  const session = React.useMemo(() => getHidCaptureSession(), []);
  const snapshot = useHidSessionSnapshot(session);
  useHidCaptureReporter(branchId, session);

  const [finger, setFinger] = React.useState<string>('RIGHT_INDEX');
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<{ captured: number; required: number } | null>(
    null,
  );
  const [credential, setCredential] = React.useState<CredentialSummary | null>(null);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const busy = phase === 'preparing' || phase === 'capturing' || phase === 'saving';

  const reset = React.useCallback(() => {
    setPhase('idle');
    setError(null);
    setProgress(null);
    setCredential(null);
  }, []);

  React.useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  // El lector nunca queda tomado por un modal cerrado.
  React.useEffect(() => {
    if (open) return undefined;
    void session.stop();
    return undefined;
  }, [open, session]);

  React.useEffect(
    () => () => {
      void session.stop();
    },
    [session],
  );

  const handleClose = (next: boolean) => {
    if (!next && busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const capture = async () => {
    setError(null);
    setCredential(null);
    setPhase('preparing');
    try {
      const enrollment = await startHidEnrollment(
        memberId,
        { branchId, fingerPosition: finger as 'RIGHT_INDEX' },
        crypto.randomUUID(),
      );
      const required = enrollment.samplesRequired;
      setProgress({ captured: 0, required });

      await session.start({ mode: 'manual' });
      setPhase('capturing');

      const samples: HidSample[] = [];
      while (samples.length < required) {
        const sample = await session.nextSample(60_000);
        samples.push(sample);
        setProgress({ captured: samples.length, required });
      }

      setPhase('saving');
      const current = session.getSnapshot();
      const result = await completeHidEnrollment(enrollment.enrollmentId, {
        samples: samples.map((sample) => ({
          pngBase64: sample.pngBase64,
          qualityCode: sample.qualityCode,
        })),
        capture: {
          sessionId: samples[0]!.sessionId,
          deviceUid: samples[0]!.deviceUid,
          readerModel: current.reader?.model ?? 'HID DigitalPersona',
          acquisitionStartedAt: current.acquisitionStartedAt,
          acquiredAt: samples[samples.length - 1]!.acquiredAt,
          sampleBytes: samples.reduce((total, sample) => total + sample.byteLength, 0),
        },
      });

      setCredential({
        quality: result.credential.quality,
        samplesUsed: result.credential.samplesUsed,
        consistencyScore: result.credential.consistencyScore,
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
    } finally {
      await session.stop();
    }
  };

  const captureHint =
    phase === 'capturing'
      ? ((snapshot.state === 'FINGER_DETECTED' ? snapshot.lastQuality?.message : null) ??
        'Apoyá el dedo y mantenelo quieto…')
      : phase === 'preparing'
        ? 'Preparando el lector…'
        : 'Protegiendo y guardando la huella…';

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
            Se piden varias lecturas del mismo dedo y se comparan entre sí antes de guardar la
            credencial. Cuando el lector se ilumine, apoyá el dedo hasta recibir la confirmación.
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
          {progress && phase === 'capturing' ? (
            <p className="text-(--text-sm) font-semibold text-(--color-primary)">
              Muestra {Math.min(progress.captured + 1, progress.required)} de {progress.required}
            </p>
          ) : null}
          <p className="text-center text-(--text-base) font-medium text-(--color-text)">
            {captureHint}
          </p>
        </div>
      ) : null}

      {phase === 'done' ? (
        <div className="flex flex-col items-center gap-3 py-5" role="status">
          <CheckCircle2 className="h-12 w-12 text-(--color-success)" aria-hidden={true} />
          <p className="text-(--text-base) font-medium text-(--color-text)">
            Huella registrada correctamente
          </p>
          <p className="text-center text-(--text-sm) text-(--color-muted)">
            {FINGERS.find((item) => item.value === finger)?.label} quedó disponible para registrar
            ingresos.
          </p>
          {credential ? (
            <p className="text-center text-(--text-sm) text-(--color-muted)">
              Calidad {credential.quality}/100 · {credential.samplesUsed} muestra
              {credential.samplesUsed === 1 ? '' : 's'}
              {credential.consistencyScore !== null
                ? ` · coincidencia entre muestras ${credential.consistencyScore}`
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {phase === 'failed' && error ? (
        <Alert tone="danger" title="No se pudo enrolar">
          {error}
        </Alert>
      ) : null}

      {showDiagnostics ? (
        <div className="mt-4">
          <HidDiagnosticsPanel session={session} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={showDiagnostics}
          onClick={() => setShowDiagnostics((value) => !value)}
        >
          <Stethoscope className="h-4 w-4" aria-hidden={true} /> Diagnóstico
        </Button>
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
