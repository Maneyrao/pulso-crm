import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * BranchSelector (FRONTEND_PLAN §4): "oculto si el usuario tiene una sola
 * sede". Regla anti-ruido: una sesión con 1 sede no ve un dropdown de 1
 * opción — el usuario nunca elige, sólo confunde. Con 2+ sedes SÍ debe
 * aparecer, con la sede activa marcada.
 *
 * useSwitchBranch usa el store de sesión + apiFetch; se mockea para que este
 * test se centre en el switch visual, no en la mutación completa (que es
 * responsabilidad de un test aparte).
 */

vi.mock('@/lib/hooks/useSwitchBranch', () => ({
  useSwitchBranch: () => ({ mutate: vi.fn(), isPending: false }),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: null,
    gym: null,
    branches: [],
    activeBranchId: null,
    permissions: [],
    status: 'idle',
  } as never);
});

async function setBranches(
  branches: Array<{ id: string; name: string; timezone: string }>,
  activeBranchId: string | null,
): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u', firstName: 'X', lastName: 'Y', email: 'x@y.com', mustChangePassword: false },
    gym: { id: 'g', name: 'Demo', slug: 'demo', country: 'AR', currency: 'ARS', features: [] },
    branches,
    activeBranchId,
    permissions: [],
    status: 'authenticated',
  } as never);
}

describe('BranchSelector', () => {
  it('con una sola sede, no renderiza nada (evita dropdown de una opción)', async () => {
    await setBranches(
      [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
      'b1',
    );
    const { BranchSelector } = await import('./BranchSelector');
    const { container } = render(withQuery(<BranchSelector />));
    expect(container.textContent).toBe('');
  });

  it('con dos sedes, aparece el select con label accesible', async () => {
    await setBranches(
      [
        { id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' },
        { id: 'b2', name: 'Norte', timezone: 'America/Argentina/Buenos_Aires' },
      ],
      'b1',
    );
    const { BranchSelector } = await import('./BranchSelector');
    render(withQuery(<BranchSelector />));
    // El label sr-only sigue estando en el DOM; getByLabelText lo encuentra.
    expect(screen.getByLabelText(/Sede activa/i)).toBeInTheDocument();
  });
});
