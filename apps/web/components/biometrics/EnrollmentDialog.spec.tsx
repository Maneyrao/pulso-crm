import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startHidEnrollment = vi.fn();
const completeHidEnrollment = vi.fn();
const check = vi.fn();
const captureSample = vi.fn();

vi.mock('@/lib/api/biometrics', () => ({
  startHidEnrollment: (...args: unknown[]) => startHidEnrollment(...args),
  completeHidEnrollment: (...args: unknown[]) => completeHidEnrollment(...args),
}));

vi.mock('@/lib/hid/client', () => ({
  getHidFingerprintClient: () => ({ check, captureSample }),
}));

import { EnrollmentDialog } from './EnrollmentDialog';

describe('EnrollmentDialog HID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    check.mockResolvedValue({
      state: 'ready',
      reader: { id: 'hid-4500', model: 'HID DigitalPersona 4500' },
      message: 'Lector listo',
    });
    startHidEnrollment.mockResolvedValue({
      enrollmentId: '00000000-0000-0000-0000-000000000020',
      samplesRequired: 1,
      minQuality: 60,
    });
    captureSample.mockResolvedValue({
      reader: { id: 'hid-4500', model: 'HID DigitalPersona 4500' },
      pngBase64: 'iVBORw0KGgo=',
      qualityCode: 0,
    });
    completeHidEnrollment.mockResolvedValue({ ok: true });
  });

  it('captures and confirms enrollment entirely inside the CRM modal', async () => {
    const onEnrolled = vi.fn();
    render(
      <EnrollmentDialog
        open={true}
        onOpenChange={vi.fn()}
        memberId="00000000-0000-0000-0000-000000000010"
        memberName="Ada Lovelace"
        branchId="00000000-0000-0000-0000-000000000030"
        onEnrolled={onEnrolled}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /capturar huella/i }));

    expect(await screen.findByText('Huella enrolada correctamente')).toBeInTheDocument();
    expect(startHidEnrollment).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000010',
      {
        branchId: '00000000-0000-0000-0000-000000000030',
        fingerPosition: 'RIGHT_INDEX',
      },
      expect.any(String),
    );
    expect(completeHidEnrollment).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000020', {
      pngBase64: 'iVBORw0KGgo=',
      qualityCode: 0,
    });
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledOnce());
    expect(screen.queryByText(/ventana local/i)).not.toBeInTheDocument();
  });
});
