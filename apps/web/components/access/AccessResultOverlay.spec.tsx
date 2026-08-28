import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessCheckResponse } from '@pulso/contracts/access';

const playAccessToneMock = vi.fn();

vi.mock('./access-feedback', () => ({
  playAccessTone: (...args: unknown[]) => playAccessToneMock(...args),
}));

vi.mock('@/lib/auth/permissions', () => ({
  usePermission: () => true,
}));

import { AccessResultOverlay } from './AccessResultOverlay';

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
  membership: { planName: 'Mensual', endDate: '2026-09-30', classesRemaining: 8 },
  attendanceRegistered: true,
  accessAttemptId: '00000000-0000-0000-0000-000000000020',
};

describe('AccessResultOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    playAccessToneMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra un resultado dominante, reproduce feedback y protege la privacidad con autocierre', () => {
    const onDismiss = vi.fn();
    render(<AccessResultOverlay result={RESULT} onDismiss={onDismiss} />);

    expect(screen.getByRole('dialog', { name: 'Acceso permitido' })).toBeInTheDocument();
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText(/8 clases restantes/i)).toBeInTheDocument();
    expect(screen.getByText('Asistencia registrada')).toBeInTheDocument();
    expect(playAccessToneMock).toHaveBeenCalledWith('ALLOWED');

    act(() => vi.advanceTimersByTime(4_500));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('permite cerrar el resultado inmediatamente', () => {
    const onDismiss = vi.fn();
    render(<AccessResultOverlay result={RESULT} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar resultado' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
