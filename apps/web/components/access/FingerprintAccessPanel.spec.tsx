import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import {
  ADC_ERROR,
  fakePng,
  installFakeAdc,
  uninstallFakeAdc,
  waitUntil,
  type FakeAdc,
} from '@/lib/hid/test/fake-adc';
import { resetReaderLockForTests } from '@/lib/hid/locks';
import { getHidCaptureSession, resetHidCaptureSessionForTests } from '@/lib/hid/session';
import { resetHidWebApiForTests } from '@/lib/hid/webapi';

const identifyHid = vi.fn();
const recordHidCaptureEvents = vi.fn();

vi.mock('@/lib/api/biometrics', () => ({
  identifyHid: (...args: unknown[]) => identifyHid(...args),
  recordHidCaptureEvents: (...args: unknown[]) => recordHidCaptureEvents(...args),
}));

import { FingerprintAccessPanel } from './FingerprintAccessPanel';

const BRANCH_ID = '00000000-0000-4000-8000-000000000040';

const ALLOWED: AccessCheckResponse = {
  decision: 'ALLOWED',
  reasonCode: 'OK',
  member: {
    id: '00000000-0000-4000-8000-000000000010',
    firstName: 'Ada',
    lastName: 'Lovelace',
    birthDate: '1990-01-15',
    joinedAt: '2026-01-10T12:00:00.000Z',
    photoUrl: null,
    status: 'ACTIVE',
  },
  membership: { planName: 'Mensual', endDate: '2026-09-30', classesRemaining: null },
  attendanceRegistered: true,
  accessAttemptId: '00000000-0000-4000-8000-000000000020',
};

const DENIED: AccessCheckResponse = {
  ...ALLOWED,
  decision: 'DENIED',
  reasonCode: 'BIOMETRIC_NO_MATCH',
  member: null,
  membership: null,
  attendanceRegistered: false,
};

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
let adc: FakeAdc;

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    key: () => null,
    length: 0,
  };
}

beforeEach(() => {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() });
  vi.clearAllMocks();
  resetHidWebApiForTests();
  resetHidCaptureSessionForTests();
  // El lock del lector es estado de módulo (modela "otra pestaña lo tiene"):
  // sin resetearlo, un test que termina con la sesión viva bloquea al siguiente.
  resetReaderLockForTests();
  adc = installFakeAdc();
  identifyHid.mockResolvedValue(ALLOWED);
  recordHidCaptureEvents.mockResolvedValue({ accepted: 1 });
});

afterEach(async () => {
  await getHidCaptureSession().stop();
  resetHidCaptureSessionForTests();
  uninstallFakeAdc();
  window.sessionStorage.clear();
  if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
});

describe('FingerprintAccessPanel', () => {
  it('arma el lector al entrar a Accesos y queda esperando huella sin apretar nada', async () => {
    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);

    expect(await screen.findByText('Esperando huella')).toBeInTheDocument();
    expect(adc.startCount).toBe(1);
    expect(adc.channels).toHaveLength(1);
    expect(screen.getByRole('button', { name: /detener huella/i })).toBeInTheDocument();
  });

  it('apoyar el dedo identifica al socio, avisa al padre y vuelve solo a esperar la próxima huella', async () => {
    const onResult = vi.fn();
    const onAttemptRecorded = vi.fn();
    render(
      <FingerprintAccessPanel
        branchId={BRANCH_ID}
        onResult={onResult}
        onAttemptRecorded={onAttemptRecorded}
      />,
    );
    await screen.findByText('Esperando huella');

    adc.placeFinger({ png: fakePng(48) });

    await waitFor(() => expect(identifyHid).toHaveBeenCalledOnce());
    const [payload] = identifyHid.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toMatchObject({
      branchId: BRANCH_ID,
      pngBase64: Buffer.from(fakePng(48)).toString('base64'),
      qualityCode: 0,
    });
    // La traza acompaña la muestra para que el backend registre el intento.
    expect(payload['capture']).toMatchObject({
      deviceUid: expect.any(String),
      readerModel: expect.any(String),
      sampleBytes: 48,
    });
    expect(onResult).toHaveBeenCalledWith(ALLOWED);
    expect(onAttemptRecorded).toHaveBeenCalledOnce();

    // El resultado se sostiene unos segundos y después vuelve solo a esperar,
    // sin re-armar la adquisición.
    expect(await screen.findByText('Acceso permitido')).toBeInTheDocument();
    expect(
      await screen.findByText('Esperando huella', undefined, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(adc.startCount).toBe(1);
  });

  // Cada lectura sostiene el resultado unos segundos antes de volver a
  // esperar: tres lecturas seguidas no entran en el timeout por defecto.
  it('lee varias huellas seguidas con una sola adquisición', { timeout: 20_000 }, async () => {
    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);
    await screen.findByText('Esperando huella');

    for (let i = 0; i < 3; i += 1) {
      adc.placeFinger({ png: fakePng(16 + i) });
      await waitFor(() => expect(identifyHid).toHaveBeenCalledTimes(i + 1));
      await screen.findByText('Esperando huella', undefined, { timeout: 5_000 });
    }

    expect(adc.startCount).toBe(1);
    expect(adc.stopCount).toBe(0);
  });

  it('muestra el motivo cuando la calidad no alcanza y sigue esperando', async () => {
    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);
    await screen.findByText('Esperando huella');

    adc.placeFinger({ quality: 7 });

    expect(await screen.findByText(/centrá el dedo/i)).toBeInTheDocument();
    expect(identifyHid).not.toHaveBeenCalled();
    expect(
      await screen.findByText('Esperando huella', undefined, { timeout: 5_000 }),
    ).toBeInTheDocument();
  });

  it('un rechazo del backend se muestra y no corta la lectura continua', async () => {
    identifyHid.mockResolvedValueOnce(DENIED);
    const onResult = vi.fn();
    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={onResult} />);
    await screen.findByText('Esperando huella');

    adc.placeFinger();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(DENIED));

    expect(await screen.findByText('Acceso rechazado')).toBeInTheDocument();
    expect(
      await screen.findByText('Esperando huella', undefined, { timeout: 5_000 }),
    ).toBeInTheDocument();
    identifyHid.mockResolvedValueOnce(ALLOWED);
    adc.placeFinger();
    await waitFor(() => expect(identifyHid).toHaveBeenCalledTimes(2));
  });

  it('un error de HID queda visible con su código y el lector se recupera solo', async () => {
    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);
    await screen.findByText('Esperando huella');

    adc.emitError(ADC_ERROR.ACCESS_DENIED);

    expect(await screen.findByText(/0x80070005/)).toBeInTheDocument();
    await screen.findByText('Esperando huella', undefined, { timeout: 4_000 });
    expect(adc.startCount).toBe(2);
  });

  it('detener apaga el lector y recuerda la decisión; activar vuelve a armarlo', async () => {
    const { unmount } = render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);
    await screen.findByText('Esperando huella');

    fireEvent.click(screen.getByRole('button', { name: /detener huella/i }));

    await waitFor(() => expect(adc.acquiring.size).toBe(0));
    expect(await screen.findByRole('button', { name: /activar huella/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('el-templo:fingerprint-mode')).toBe('disabled');

    unmount();
    resetHidCaptureSessionForTests();
    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);
    // La preferencia guardada evita que se arme solo al volver a la pantalla.
    expect(await screen.findByRole('button', { name: /activar huella/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /activar huella/i }));
    expect(await screen.findByText('Esperando huella')).toBeInTheDocument();
    expect(window.localStorage.getItem('el-templo:fingerprint-mode')).toBe('enabled');
  });

  it('sin ADC instalado explica qué falta y no deja la pantalla colgada', async () => {
    uninstallFakeAdc();
    resetHidWebApiForTests();
    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);

    expect(await screen.findByText(/Authentication Device Client/i)).toBeInTheDocument();
  });

  it('salir de la pantalla detiene la adquisición y libera el lector', async () => {
    const { unmount } = render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);
    await screen.findByText('Esperando huella');

    unmount();

    await waitUntil(() => adc.acquiring.size === 0, { timeoutMs: 2_000 });
    expect(adc.stopCount).toBeGreaterThanOrEqual(1);
  });

  it('nunca abre una ventana ni una pestaña externa', async () => {
    const open = vi.spyOn(window, 'open');
    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);
    await screen.findByText('Esperando huella');
    adc.placeFinger();
    await waitFor(() => expect(identifyHid).toHaveBeenCalledOnce());

    expect(open).not.toHaveBeenCalled();
  });

  it('avisa que el lector quedó armado y mudo, y dice qué revisar en la PC', async () => {
    // Reproduce el caso real: ADC acepta StartAcquisition con PngImage y no
    // emite ninguna notificación mientras el operador apoya el dedo.
    await getHidCaptureSession().stop();
    resetHidCaptureSessionForTests({ silenceMs: 60 });
    adc.mutedFormats = [5];

    render(<FingerprintAccessPanel branchId={BRANCH_ID} onResult={vi.fn()} />);
    await screen.findByText('Esperando huella');
    adc.placeFinger();

    expect(
      await screen.findByText(/no llega ninguna señal del dedo/i, undefined, { timeout: 3_000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Windows Hello/)).toBeInTheDocument();
    expect(screen.getByText(/Legacy/)).toBeInTheDocument();
    // No lo declara error del CRM ni corta la lectura.
    expect(identifyHid).not.toHaveBeenCalled();
    expect(screen.getByText('Esperando huella')).toBeInTheDocument();
  });

  it('sin sede seleccionada no arma el lector', async () => {
    render(<FingerprintAccessPanel branchId={null} onResult={vi.fn()} />);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(adc.startCount).toBe(0);
    expect(screen.getByRole('button', { name: /activar huella/i })).toBeDisabled();
  });
});
