import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * /settings/devices: gate por `device:manage`, tarjetas de agente local y
 * tabla de agentes vinculados; "Simular agente conectado" lleva el estado a
 * ready (vía FakeAgent) y habilita la prueba de enrolamiento.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/devices',
  useRouter: () => ({ push: vi.fn() }),
}));

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
  vi.resetModules();
  const { useAgentStore } = await import('@/lib/agent/store');
  useAgentStore.setState({ status: 'no-agent', deviceName: null });
});

describe('DevicesPage', () => {
  it('sin device:manage no revela nada', async () => {
    await setSession([]);
    const { default: Page } = await import('./page');
    render(<Page />);
    expect(screen.queryByText(/Dispositivos/)).not.toBeInTheDocument();
  });

  it('con device:manage muestra estado del agente, tabla y prueba deshabilitada', async () => {
    await setSession(['device:manage']);
    const { default: Page } = await import('./page');
    render(<Page />);
    expect(screen.getByRole('heading', { name: /Dispositivos/ })).toBeInTheDocument();
    expect(screen.getByText('Sin agente')).toBeInTheDocument();
    // Tabla demo de agentes vinculados
    expect(screen.getByText('Recepción PC-01')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de aprobación')).toBeInTheDocument();
    // Sin agente conectado, la prueba de enrolamiento está deshabilitada
    expect(screen.getByRole('button', { name: /Iniciar prueba/ })).toBeDisabled();
  });

  it('conectar el agente simulado habilita la prueba de enrolamiento', async () => {
    vi.useFakeTimers();
    try {
      await setSession(['device:manage']);
      const { default: Page } = await import('./page');
      render(<Page />);
      fireEvent.click(screen.getByRole('button', { name: /Simular agente conectado/ }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(800);
      });
      expect(screen.getByText('Conectado')).toBeInTheDocument();
      expect(screen.getByText('U.are.U 4500')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Iniciar prueba/ })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
