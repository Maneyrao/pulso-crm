import type { AccessDevice, LocalAgent } from '@pulso/contracts/biometrics';
import { describe, expect, it } from 'vitest';
import { selectOnlineBiometricEndpoint } from './agent-selection';

const agent = (overrides: Partial<LocalAgent>): LocalAgent => ({
  id: crypto.randomUUID(),
  gymId: crypto.randomUUID(),
  branchId: '018f1e2a-0000-7000-8000-000000000001',
  name: 'Recepcion',
  installationId: crypto.randomUUID(),
  agentVersion: '1.0.0.0',
  osVersion: 'Windows 11',
  status: 'ACTIVE',
  lastSeenAt: '2026-08-28T21:39:00.000Z',
  approvedAt: '2026-08-28T20:00:00.000Z',
  revokedAt: null,
  revokeReason: null,
  createdAt: '2026-08-28T20:00:00.000Z',
  ...overrides,
});

const device = (localAgentId: string, overrides: Partial<AccessDevice>): AccessDevice => ({
  id: crypto.randomUUID(),
  branchId: '018f1e2a-0000-7000-8000-000000000001',
  localAgentId,
  kind: 'FINGERPRINT_READER',
  vendor: 'HID_DIGITALPERSONA',
  model: 'UAREU_4500',
  serialNumber: null,
  status: 'ONLINE',
  lastSeenAt: '2026-08-28T21:39:00.000Z',
  createdAt: '2026-08-28T20:00:00.000Z',
  ...overrides,
});

describe('selectOnlineBiometricEndpoint', () => {
  it('ignora un agente activo pero offline y elige el lector online', () => {
    const offline = agent({
      id: '018f1e2a-0000-7000-8000-000000000010',
      name: 'Registro viejo',
      lastSeenAt: null,
      createdAt: '2026-08-28T21:00:00.000Z',
    });
    const online = agent({
      id: '018f1e2a-0000-7000-8000-000000000020',
      name: 'PC con lector',
      createdAt: '2026-08-28T20:00:00.000Z',
    });

    const selected = selectOnlineBiometricEndpoint(
      [offline, online],
      [
        device(offline.id, { status: 'OFFLINE', lastSeenAt: null }),
        device(online.id, {}),
      ],
      online.branchId,
    );

    expect(selected).toEqual({ agent: online, device: expect.objectContaining({ localAgentId: online.id }) });
  });

  it('no usa lectores de otra sede', () => {
    const online = agent({ id: '018f1e2a-0000-7000-8000-000000000030' });
    const selected = selectOnlineBiometricEndpoint(
      [online],
      [device(online.id, { branchId: '018f1e2a-0000-7000-8000-000000000099' })],
      online.branchId,
    );

    expect(selected).toBeNull();
  });
});
