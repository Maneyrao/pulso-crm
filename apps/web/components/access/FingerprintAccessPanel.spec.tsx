import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessCheckResponse } from '@pulso/contracts/access';

const identifyHid = vi.fn();
const check = vi.fn();
const captureSample = vi.fn();
const cancelCapture = vi.fn();

vi.mock('@/lib/api/biometrics', () => ({
  identifyHid: (...args: unknown[]) => identifyHid(...args),
}));

vi.mock('@/lib/hid/client', () => ({
  getHidFingerprintClient: () => ({ check, captureSample, cancelCapture }),
}));

import { FingerprintAccessPanel } from './FingerprintAccessPanel';

const RESULT: AccessCheckResponse = {
  decision: 'ALLOWED',
  reasonCode: 'OK',
  member: {
    id: '00000000-0000-0000-0000-000000000010',
    firstName: 'Ada',
    lastName: 'Lovelace',
    photoUrl: null,
    status: 'ACTIVE',
  },
  membership: { planName: 'Mensual', endDate: '2026-09-30', classesRemaining: null },
  attendanceRegistered: true,
  accessAttemptId: '00000000-0000-0000-0000-000000000020',
};

describe('FingerprintAccessPanel HID', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    vi.clearAllMocks();
    window.localStorage.clear();
    check.mockResolvedValue({
      state: 'ready',
      reader: { id: 'hid-4500', model: 'HID DigitalPersona 4500' },
      message: 'Lector listo',
    });
    captureSample.mockResolvedValue({
      reader: { id: 'hid-4500', model: 'HID DigitalPersona 4500' },
      pngBase64: 'iVBORw0KGgo=',
      qualityCode: 0,
    });
    identifyHid.mockResolvedValue(RESULT);
  });

  it('lee por HID dentro de la web y entrega inmediatamente el resultado de acceso', async () => {
    const onResult = vi.fn();
    const onAttemptRecorded = vi.fn();
    render(
      <FingerprintAccessPanel
        branchId="00000000-0000-0000-0000-000000000040"
        onResult={onResult}
        onAttemptRecorded={onAttemptRecorded}
      />,
    );

    await waitFor(() => expect(identifyHid).toHaveBeenCalledOnce());
    expect(identifyHid).toHaveBeenCalledWith(
      {
        branchId: '00000000-0000-0000-0000-000000000040',
        pngBase64: 'iVBORw0KGgo=',
        qualityCode: 0,
      },
      expect.any(String),
    );
    expect(onResult).toHaveBeenCalledWith(RESULT);
    expect(onAttemptRecorded).toHaveBeenCalledOnce();
  });

  it('apaga el lector al detener el modo huella', async () => {
    captureSample.mockImplementation(() => new Promise(() => undefined));
    render(
      <FingerprintAccessPanel branchId="00000000-0000-0000-0000-000000000040" onResult={vi.fn()} />,
    );
    await screen.findByText('Esperando huella');

    fireEvent.click(screen.getByRole('button', { name: /detener huella/i }));

    expect(cancelCapture).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('el-templo:fingerprint-mode')).toBe('disabled');
  });

  it('respeta el modo detenido y recuerda una reactivación manual', async () => {
    window.localStorage.setItem('el-templo:fingerprint-mode', 'disabled');
    render(
      <FingerprintAccessPanel branchId="00000000-0000-0000-0000-000000000040" onResult={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /activar huella/i })).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /activar huella/i }));
    await waitFor(() => expect(check).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem('el-templo:fingerprint-mode')).toBe('enabled');
  });
});
