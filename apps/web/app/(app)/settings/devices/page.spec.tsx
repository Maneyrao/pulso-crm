import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@pulso/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /settings/devices real: gate por `device:manage`, agentes y lectores desde
 * la API (§10) y alta de agente con secreto de pareo mostrado UNA vez.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/devices',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const listAgentsMock = vi.fn();
const listDevicesMock = vi.fn();
const createAgentMock = vi.fn();
vi.mock('@/lib/api/biometrics', () => ({
  listAgents: (...args: unknown[]) => listAgentsMock(...args),
  listDevices: (...args: unknown[]) => listDevicesMock(...args),
  createAgent: (...args: unknown[]) => createAgentMock(...args),
  approveAgent: vi.fn(),
  revokeAgent: vi.fn(),
}));

const AGENT = {
  id: '00000000-0000-7000-8000-0000000000a1',
  gymId: 'g1',
  branchId: 'b1',
  name: 'Recepción PC-01',
  installationId: '00000000-0000-7000-8000-0000000000i1',
  agentVersion: '1.0.0',
  osVersion: 'Windows 11',
  status: 'PENDING_APPROVAL',
  lastSeenAt: null,
  approvedAt: null,
  revokedAt: null,
  revokeReason: null,
  createdAt: '2026-08-21T12:00:00.000Z',
};

function withProviders(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const setSession = async (permissions: string[]): Promise<void> => {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u1', firstName: 'X', lastName: 'Y', email: 'x@y.com', mustChangePassword: false },
    gym: { id: 'g1', name: 'Demo', slug: 'demo', country: 'AR', currency: 'ARS', features: [] },
    branches: [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions,
    status: 'authenticated',
  } as never);
};

beforeEach(async () => {
  vi.clearAllMocks();
  listAgentsMock.mockResolvedValue({ data: [AGENT] });
  listDevicesMock.mockResolvedValue({ data: [] });
  const { useAgentStore } = await import('@/lib/agent/store');
  useAgentStore.setState({ status: 'no-agent', deviceName: null });
});

describe('DevicesPage', () => {
  it('sin device:manage no revela nada', async () => {
    await setSession([]);
    const { default: Page } = await import('./page');
    render(withProviders(<Page />));
    expect(screen.queryByText(/Dispositivos/)).not.toBeInTheDocument();
  });

  it('con device:manage lista los agentes reales con su estado', async () => {
    await setSession(['device:manage']);
    const { default: Page } = await import('./page');
    render(withProviders(<Page />));
    expect(await screen.findByText('Recepción PC-01')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de aprobación')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aprobar/ })).toBeInTheDocument();
    expect(screen.getByText('Sin agente')).toBeInTheDocument();
  });

  it('ofrece instalar el conector biometrico para usar el CRM web', async () => {
    await setSession(['device:manage']);
    const { default: Page } = await import('./page');
    render(withProviders(<Page />));

    const download = screen.getByRole('link', { name: /Instalar lector en esta PC/i });
    expect(download).toHaveAttribute(
      'href',
      'https://github.com/Maneyrao/pulso-crm/releases/latest/download/ElTemploHuella-Setup.exe',
    );
  });

  it('crear un agente muestra el secreto de pareo una sola vez', async () => {
    createAgentMock.mockResolvedValue({
      agent: { ...AGENT, id: 'nuevo', installationId: 'inst-nueva' },
      pairingSecret: 'pps_secreto-unico',
    });
    await setSession(['device:manage']);
    const { default: Page } = await import('./page');
    render(withProviders(<Page />));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Nuevo agente/ }));
    await user.type(screen.getByPlaceholderText('Recepción principal'), 'Recepción PC-02');
    await user.click(screen.getByRole('button', { name: /Crear agente/ }));

    expect(await screen.findByDisplayValue('pps_secreto-unico')).toBeInTheDocument();
    expect(createAgentMock).toHaveBeenCalledWith({ branchId: 'b1', name: 'Recepción PC-02' });

    // Cerrar el diálogo descarta el secreto: no queda en la página.
    await user.click(screen.getByRole('button', { name: /Listo/ }));
    expect(screen.queryByDisplayValue('pps_secreto-unico')).not.toBeInTheDocument();
  });
});
