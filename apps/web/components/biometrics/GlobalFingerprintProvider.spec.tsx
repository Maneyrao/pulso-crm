import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { fakePng, installFakeAdc, uninstallFakeAdc, type FakeAdc } from '@/lib/hid/test/fake-adc';
import { resetReaderLockForTests } from '@/lib/hid/locks';
import { getHidCaptureSession, resetHidCaptureSessionForTests } from '@/lib/hid/session';
import { resetHidWebApiForTests } from '@/lib/hid/webapi';

const identifyHid = vi.fn();
const recordHidCaptureEvents = vi.fn();
const playAccessTone = vi.fn();

vi.mock('@/lib/api/biometrics', () => ({
  identifyHid: (...args: unknown[]) => identifyHid(...args),
  recordHidCaptureEvents: (...args: unknown[]) => recordHidCaptureEvents(...args),
}));

vi.mock('@/lib/auth/permissions', () => ({
  usePermission: () => true,
}));

vi.mock('@/lib/stores/session', () => ({
  useSessionStore: (selector: (state: { activeBranchId: string }) => unknown) =>
    selector({ activeBranchId: '00000000-0000-4000-8000-000000000040' }),
}));

vi.mock('@/components/access/access-feedback', () => ({
  installAccessAudioUnlock: () => () => undefined,
  playAccessTone: (...args: unknown[]) => playAccessTone(...args),
}));

import { GlobalFingerprintProvider } from './GlobalFingerprintProvider';

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
  membership: { planName: 'Pase Libre', endDate: '2026-09-30', classesRemaining: null },
  attendanceRegistered: true,
  accessAttemptId: '00000000-0000-4000-8000-000000000020',
};

const UNKNOWN: AccessCheckResponse = {
  ...ALLOWED,
  decision: 'DENIED',
  reasonCode: 'BIOMETRIC_NO_MATCH',
  member: null,
  membership: null,
  attendanceRegistered: false,
};

const EXPIRED: AccessCheckResponse = {
  ...ALLOWED,
  decision: 'DENIED',
  reasonCode: 'MEMBERSHIP_EXPIRED',
  membership: { planName: 'Pase Libre', endDate: '2026-08-20', classesRemaining: null },
  attendanceRegistered: false,
};

let adc: FakeAdc;
const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');

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
  resetReaderLockForTests();
  adc = installFakeAdc();
  recordHidCaptureEvents.mockResolvedValue({ accepted: 1 });
  identifyHid.mockResolvedValue(ALLOWED);
});

afterEach(async () => {
  await getHidCaptureSession().stop();
  resetHidCaptureSessionForTests();
  uninstallFakeAdc();
  if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
});

describe('GlobalFingerprintProvider', () => {
  it('arma el lector sin UI y muestra los datos del socio al reconocer una huella', async () => {
    render(
      <GlobalFingerprintProvider>
        <main>CRM listo</main>
      </GlobalFingerprintProvider>,
    );

    expect(screen.getByText('CRM listo')).toBeInTheDocument();
    await waitFor(() => expect(adc.startCount).toBe(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    adc.placeFinger({ png: fakePng(32) });

    await waitFor(() => expect(identifyHid).toHaveBeenCalledOnce());
    expect(await screen.findByRole('dialog', { name: 'Acceso permitido' })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('15/01/1990')).toBeInTheDocument();
    expect(screen.getByText('10/01/2026')).toBeInTheDocument();
    expect(screen.getByText('Asistencia registrada')).toBeInTheDocument();
  });

  it('ignora visualmente una huella desconocida y continúa escuchando', async () => {
    identifyHid.mockResolvedValueOnce(UNKNOWN);
    render(
      <GlobalFingerprintProvider>
        <main>CRM listo</main>
      </GlobalFingerprintProvider>,
    );
    await waitFor(() => expect(adc.startCount).toBe(1));

    adc.placeFinger();

    await waitFor(() => expect(identifyHid).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(adc.startCount).toBe(1);
  });

  it('cuota vencida muestra la denegación y reproduce la alarma fuerte', async () => {
    identifyHid.mockResolvedValueOnce(EXPIRED);
    render(
      <GlobalFingerprintProvider>
        <main>CRM listo</main>
      </GlobalFingerprintProvider>,
    );
    await waitFor(() => expect(adc.startCount).toBe(1));

    adc.placeFinger();

    expect(await screen.findByRole('dialog', { name: 'Membresía vencida' })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(playAccessTone).toHaveBeenCalledOnce();
    expect(playAccessTone).toHaveBeenCalledWith('DENIED');
  });
});
