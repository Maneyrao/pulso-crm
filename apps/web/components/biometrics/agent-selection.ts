import type { AccessDevice, LocalAgent } from '@pulso/contracts/biometrics';

export interface OnlineBiometricEndpoint {
  agent: LocalAgent;
  device: AccessDevice;
}

export function selectOnlineBiometricEndpoint(
  agents: readonly LocalAgent[],
  devices: readonly AccessDevice[],
  activeBranchId: string | null,
): OnlineBiometricEndpoint | null {
  if (!activeBranchId) return null;

  const onlineDevices = devices
    .filter(
      (device) =>
        device.branchId === activeBranchId &&
        device.kind === 'FINGERPRINT_READER' &&
        device.status === 'ONLINE',
    )
    .sort((left, right) => {
      const leftSeen = left.lastSeenAt ? Date.parse(left.lastSeenAt) : 0;
      const rightSeen = right.lastSeenAt ? Date.parse(right.lastSeenAt) : 0;
      return rightSeen - leftSeen;
    });

  for (const device of onlineDevices) {
    const agent = agents.find(
      (candidate) =>
        candidate.id === device.localAgentId &&
        candidate.branchId === activeBranchId &&
        candidate.status === 'ACTIVE' &&
        candidate.lastSeenAt !== null,
    );
    if (agent) return { agent, device };
  }

  return null;
}
