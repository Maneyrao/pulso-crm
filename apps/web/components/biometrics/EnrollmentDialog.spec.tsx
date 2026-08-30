import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADC_ERROR,
  fakePng,
  installFakeAdc,
  uninstallFakeAdc,
  type FakeAdc,
} from '@/lib/hid/test/fake-adc';
import { resetReaderLockForTests } from '@/lib/hid/locks';
import { getHidCaptureSession, resetHidCaptureSessionForTests } from '@/lib/hid/session';
import { resetHidWebApiForTests } from '@/lib/hid/webapi';

const startHidEnrollment = vi.fn();
const completeHidEnrollment = vi.fn();
const recordHidCaptureEvents = vi.fn();

vi.mock('@/lib/api/biometrics', () => ({
  startHidEnrollment: (...args: unknown[]) => startHidEnrollment(...args),
  completeHidEnrollment: (...args: unknown[]) => completeHidEnrollment(...args),
  recordHidCaptureEvents: (...args: unknown[]) => recordHidCaptureEvents(...args),
}));

import { EnrollmentDialog } from './EnrollmentDialog';

const MEMBER_ID = '00000000-0000-4000-8000-000000000010';
const BRANCH_ID = '00000000-0000-4000-8000-000000000030';
const ENROLLMENT_ID = '00000000-0000-4000-8000-000000000020';

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
let adc: FakeAdc;

function renderDialog(props: Partial<React.ComponentProps<typeof EnrollmentDialog>> = {}) {
  return render(
    <EnrollmentDialog
      open={true}
      onOpenChange={vi.fn()}
      memberId={MEMBER_ID}
      memberName="Ada Lovelace"
      branchId={BRANCH_ID}
      {...props}
    />,
  );
}

beforeEach(() => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',
  });
  vi.clearAllMocks();
  resetHidWebApiForTests();
  resetHidCaptureSessionForTests();
  resetReaderLockForTests();
  adc = installFakeAdc();
  startHidEnrollment.mockResolvedValue({
    enrollmentId: ENROLLMENT_ID,
    samplesRequired: 2,
    minQuality: 60,
  });
  completeHidEnrollment.mockResolvedValue({
    ok: true,
    credential: { id: 'cred-1', quality: 78, samplesUsed: 2, consistencyScore: 64 },
  });
  recordHidCaptureEvents.mockResolvedValue({ accepted: 1 });
});

afterEach(async () => {
  await getHidCaptureSession().stop();
  resetHidCaptureSessionForTests();
  uninstallFakeAdc();
  window.sessionStorage.clear();
  if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
});

describe('EnrollmentDialog', () => {
  it('pide las muestras que exige el backend, muestra el progreso y confirma la credencial', async () => {
    const onEnrolled = vi.fn();
    renderDialog({ onEnrolled });

    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));

    // Primera muestra.
    expect(await screen.findByText(/muestra 1 de 2/i)).toBeInTheDocument();
    await waitFor(() => expect(adc.acquiring.size).toBe(1));
    adc.placeFinger({ png: fakePng(32) });

    // Segunda muestra, sin re-armar el lector.
    expect(await screen.findByText(/muestra 2 de 2/i)).toBeInTheDocument();
    adc.placeFinger({ png: fakePng(40) });

    expect(await screen.findByText('Huella registrada correctamente')).toBeInTheDocument();
    expect(startHidEnrollment).toHaveBeenCalledWith(
      MEMBER_ID,
      { branchId: BRANCH_ID, fingerPosition: 'RIGHT_INDEX' },
      expect.any(String),
    );
    const [enrollmentId, payload] = completeHidEnrollment.mock.calls[0] as [
      string,
      {
        samples: Array<{ pngBase64: string; qualityCode: number | null }>;
        capture: Record<string, unknown>;
      },
    ];
    expect(enrollmentId).toBe(ENROLLMENT_ID);
    expect(payload.samples).toHaveLength(2);
    expect(payload.samples[0]!.pngBase64).toBe(Buffer.from(fakePng(32)).toString('base64'));
    expect(payload.samples[1]!.pngBase64).toBe(Buffer.from(fakePng(40)).toString('base64'));
    expect(payload.samples.every((s) => s.qualityCode === 0)).toBe(true);
    expect(payload.capture).toMatchObject({ deviceUid: expect.any(String) });

    // La calidad de la credencial creada se muestra al operador.
    expect(screen.getByText(/78/)).toBeInTheDocument();
    expect(onEnrolled).toHaveBeenCalledOnce();
    // Una sola adquisición para las dos muestras.
    expect(adc.startCount).toBe(1);
  });

  it('guía al operador cuando una muestra sale mal y no la cuenta como válida', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));
    await screen.findByText(/muestra 1 de 2/i);
    await waitFor(() => expect(adc.acquiring.size).toBe(1));

    adc.placeFinger({ quality: 3 });
    expect(await screen.findByText(/muy oscura/i)).toBeInTheDocument();
    expect(await screen.findByText(/muestra 1 de 2/i)).toBeInTheDocument();

    adc.placeFinger({ png: fakePng(20) });
    expect(await screen.findByText(/muestra 2 de 2/i)).toBeInTheDocument();
    adc.placeFinger({ png: fakePng(24) });
    expect(await screen.findByText('Huella registrada correctamente')).toBeInTheDocument();
  });

  it('un error del lector durante el enrolamiento se explica y deja reintentar', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));
    await screen.findByText(/muestra 1 de 2/i);
    await waitFor(() => expect(adc.acquiring.size).toBe(1));

    adc.emitError(ADC_ERROR.DEVICE_NOT_CONNECTED);

    expect(await screen.findByText(/0x8007048F/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    expect(completeHidEnrollment).not.toHaveBeenCalled();
  });

  it('un rechazo del backend por muestras inconsistentes se explica en castellano', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    completeHidEnrollment.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'ENROLLMENT_SAMPLES_INCONSISTENT',
        status: 422,
        title: 'no coinciden',
        detail: 'no coinciden',
      }),
    );
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));
    await screen.findByText(/muestra 1 de 2/i);
    await waitFor(() => expect(adc.acquiring.size).toBe(1));
    adc.placeFinger();
    await screen.findByText(/muestra 2 de 2/i);
    adc.placeFinger();

    expect(await screen.findByText(/no coinciden entre sí/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('cerrar el modal apaga el lector y libera la sesión de captura', async () => {
    const onOpenChange = vi.fn();
    const { rerender } = renderDialog({ onOpenChange });
    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));
    await screen.findByText(/muestra 1 de 2/i);
    await waitFor(() => expect(adc.acquiring.size).toBe(1));

    rerender(
      <EnrollmentDialog
        open={false}
        onOpenChange={onOpenChange}
        memberId={MEMBER_ID}
        branchId={BRANCH_ID}
      />,
    );

    await waitFor(() => expect(adc.acquiring.size).toBe(0));
    expect(getHidCaptureSession().isActive()).toBe(false);
  });

  it('el operador puede cancelar la espera: el modal no lo deja encerrado', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));
    await waitFor(() => expect(adc.startCount).toBe(1));

    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }));

    // Vuelve al inicio, no a un error, y suelta el lector.
    expect(await screen.findByRole('button', { name: /capturar huella/i })).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo enrolar/i)).not.toBeInTheDocument();
    await waitFor(() => expect(adc.acquiring.size).toBe(0));
  });

  it('avisa dentro del modal cuando el lector queda armado y mudo', async () => {
    await getHidCaptureSession().stop();
    resetHidCaptureSessionForTests({ silenceMs: 60 });
    adc.mutedFormats = [5];

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));
    await waitFor(() => expect(adc.startCount).toBe(1));
    adc.placeFinger();

    expect(
      await screen.findByText(/no llega ninguna señal del dedo/i, undefined, { timeout: 3_000 }),
    ).toBeInTheDocument();
    expect(completeHidEnrollment).not.toHaveBeenCalled();
  });

  it('no abre ninguna ventana externa durante el enrolamiento', async () => {
    const open = vi.spyOn(window, 'open');
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));
    await screen.findByText(/muestra 1 de 2/i);
    await waitFor(() => expect(adc.acquiring.size).toBe(1));
    adc.placeFinger();
    await screen.findByText(/muestra 2 de 2/i);
    adc.placeFinger();
    await screen.findByText('Huella registrada correctamente');

    expect(open).not.toHaveBeenCalled();
  });
});
