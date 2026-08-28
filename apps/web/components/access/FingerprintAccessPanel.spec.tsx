import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import type { AgentEvent } from '@/lib/agent';

const startIdentificationMock = vi.fn();
const listAccessAttemptsMock = vi.fn();
const getAccessAttemptResultMock = vi.fn();
let agentListener: ((event: AgentEvent) => void) | null = null;

const agent = {
  connected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
  enrollStart: vi.fn(),
  identifyStart: vi.fn(() => 'op-identify-1'),
  identifyStop: vi.fn(),
  cancel: vi.fn(),
  subscribe: vi.fn((listener: (event: AgentEvent) => void) => {
    agentListener = listener;
    return () => {
      agentListener = null;
    };
  }),
};

vi.mock('@/lib/agent', () => ({
  getAgentClient: () => agent,
  useAgentStore: (selector: (state: { status: string; deviceName: string }) => unknown) =>
    selector({ status: 'ready', deviceName: 'Lector simulado' }),
}));

vi.mock('@/lib/api/biometrics', () => ({
  startIdentification: (...args: unknown[]) => startIdentificationMock(...args),
}));

vi.mock('@/lib/api/access', () => ({
  listAccessAttempts: (...args: unknown[]) => listAccessAttemptsMock(...args),
  getAccessAttemptResult: (...args: unknown[]) => getAccessAttemptResultMock(...args),
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

describe('FingerprintAccessPanel', () => {
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
    agentListener = null;
    agent.identifyStart.mockReturnValue('op-identify-1');
    startIdentificationMock.mockResolvedValue({
      deviceToken: 'pdt_identify',
      deviceId: '00000000-0000-0000-0000-000000000030',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
      minQuality: 60,
    });
    listAccessAttemptsMock.mockResolvedValue({
      data: [
        {
          id: RESULT.accessAttemptId,
          branchId: '00000000-0000-0000-0000-000000000040',
          memberId: RESULT.member!.id,
          method: 'FINGERPRINT',
          rawInputMasked: null,
          decision: 'ALLOWED',
          reasonCode: 'OK',
          detail: null,
          matchScore: 100,
          attendanceId: '00000000-0000-0000-0000-000000000050',
          occurredAt: new Date().toISOString(),
        },
      ],
      pageInfo: { page: 1, limit: 3, total: 1, hasMore: false },
    });
    getAccessAttemptResultMock.mockResolvedValue(RESULT);
  });

  it('emite una sesión, procesa la lectura sin PII en el agente y entrega el resultado del CRM', async () => {
    const onResult = vi.fn();
    const onAttemptRecorded = vi.fn();
    render(
      <FingerprintAccessPanel
        branchId="00000000-0000-0000-0000-000000000040"
        onResult={onResult}
        onAttemptRecorded={onAttemptRecorded}
      />,
    );

    await waitFor(() => expect(startIdentificationMock).toHaveBeenCalledOnce());
    expect(agent.identifyStart).toHaveBeenCalledWith({
      deviceToken: 'pdt_identify',
      deviceId: '00000000-0000-0000-0000-000000000030',
      branchId: '00000000-0000-0000-0000-000000000040',
      minQuality: 60,
      continuous: false,
    });

    act(() => {
      agentListener?.({
        type: 'identify.captured',
        payload: { opId: 'op-identify-1', quality: 84 },
      });
    });
    expect(await screen.findByText('Huella leída')).toBeInTheDocument();

    act(() => {
      agentListener?.({ type: 'identify.sent', payload: { opId: 'op-identify-1' } });
    });
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(RESULT));
    expect(listAccessAttemptsMock).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000040',
      3,
      expect.objectContaining({ method: 'FINGERPRINT' }),
    );
    expect(getAccessAttemptResultMock).toHaveBeenCalledWith(RESULT.accessAttemptId);
    expect(onAttemptRecorded).toHaveBeenCalledOnce();
  });

  it('detiene la operación activa al apagar el modo huella', async () => {
    render(
      <FingerprintAccessPanel branchId="00000000-0000-0000-0000-000000000040" onResult={vi.fn()} />,
    );
    await waitFor(() => expect(agent.identifyStart).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /detener huella/i }));
    expect(agent.identifyStop).toHaveBeenCalledWith('op-identify-1');
    expect(window.localStorage.getItem('el-templo:fingerprint-mode')).toBe('disabled');
  });

  it('respeta el modo detenido y recuerda una reactivación manual', async () => {
    window.localStorage.setItem('el-templo:fingerprint-mode', 'disabled');
    render(
      <FingerprintAccessPanel branchId="00000000-0000-0000-0000-000000000040" onResult={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /activar huella/i })).toBeInTheDocument();
    expect(startIdentificationMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /activar huella/i }));
    await waitFor(() => expect(startIdentificationMock).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem('el-templo:fingerprint-mode')).toBe('enabled');
  });
});
