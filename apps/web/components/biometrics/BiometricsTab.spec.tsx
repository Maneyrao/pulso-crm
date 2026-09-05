import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const grantConsent = vi.fn();
const listMemberCredentials = vi.fn();
const revokeConsent = vi.fn();
const revokeCredential = vi.fn();

vi.mock('@/lib/api/biometrics', () => ({
  grantConsent: (...args: unknown[]) => grantConsent(...args),
  listMemberCredentials: (...args: unknown[]) => listMemberCredentials(...args),
  revokeConsent: (...args: unknown[]) => revokeConsent(...args),
  revokeCredential: (...args: unknown[]) => revokeCredential(...args),
}));

vi.mock('@/lib/auth/permissions', () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/lib/stores/session', () => ({
  useSessionStore: (selector: (state: { activeBranchId: string }) => unknown) =>
    selector({ activeBranchId: '00000000-0000-4000-8000-000000000030' }),
}));

vi.mock('./EnrollmentDialog', () => ({
  EnrollmentDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Enrolar huella digital" /> : null,
}));

vi.mock('./HidDiagnosticsPanel', () => ({
  HidDiagnosticsPanel: () => <div>Diagnóstico HID</div>,
}));

import { BiometricsTab } from './BiometricsTab';

function withProviders(children: ReactNode): ReactNode {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMemberCredentials.mockResolvedValue({ data: [] });
  grantConsent.mockResolvedValue({ consent: { id: 'consent-1' } });
});

describe('BiometricsTab', () => {
  it('enrola desde una sola acción sin pedir consentimiento en otro diálogo', async () => {
    render(
      withProviders(
        <BiometricsTab memberId="00000000-0000-4000-8000-000000000010" memberName="Ada Lovelace" />,
      ),
    );

    expect(
      screen.queryByRole('button', { name: /Registrar consentimiento/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Enrolar huella/i }));

    await waitFor(() =>
      expect(grantConsent).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000010', {
        version: 'v1',
        grantedMethod: 'IN_PERSON_SIGNED',
      }),
    );
    expect(
      await screen.findByRole('dialog', { name: 'Enrolar huella digital' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /consentimiento/i })).not.toBeInTheDocument();
  });
});
