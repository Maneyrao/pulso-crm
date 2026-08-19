import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Fidelización › Puntos por socio — pantalla de demo sin backend
 * (`loyalty:read`), datos de `lib/mock/data/commerce-demo.ts` vía
 * `useMockData`. "Ajustar" queda gateado por `loyalty:config`.
 */

function withProviders(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['loyalty:read']): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u', firstName: 'Ana', lastName: 'Test', email: 'a@t.com', mustChangePassword: false },
    gym: { id: 'g1', name: 'Demo', slug: 'demo', country: 'AR', currency: 'ARS', features: [] },
    branches: [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions,
    status: 'authenticated',
  } as never);
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

describe('LoyaltyMembersPage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: LoyaltyMembersPage } = await import('./page');
    render(withProviders(<LoyaltyMembersPage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: socio, iniciales, nivel y puntos; sin loyalty:config no hay "Ajustar"', async () => {
    await primeSession(['loyalty:read']);
    const { default: LoyaltyMembersPage } = await import('./page');
    render(withProviders(<LoyaltyMembersPage />));

    await waitFor(() => expect(screen.getByText('García, Bruno')).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getByText('GB')).toBeInTheDocument();
    expect(screen.getAllByText('Oro').length).toBeGreaterThan(0);
    expect(screen.getByText('2500')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajustar' })).not.toBeInTheDocument();
  });

  it('con loyalty:config muestra "Ajustar" y dispara el toast demo', async () => {
    await primeSession(['loyalty:read', 'loyalty:config']);
    const { default: LoyaltyMembersPage } = await import('./page');
    render(withProviders(<LoyaltyMembersPage />));

    await waitFor(() => expect(screen.getByText('García, Bruno')).toBeInTheDocument(), {
      timeout: 2000,
    });

    const adjustButtons = screen.getAllByRole('button', { name: 'Ajustar' });
    expect(adjustButtons.length).toBeGreaterThan(0);
    fireEvent.click(adjustButtons[0]!);
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });

  it('la búsqueda filtra por socio', async () => {
    await primeSession(['loyalty:read']);
    const { default: LoyaltyMembersPage } = await import('./page');
    render(withProviders(<LoyaltyMembersPage />));

    await waitFor(() => expect(screen.getByText('García, Bruno')).toBeInTheDocument(), {
      timeout: 2000,
    });

    fireEvent.change(screen.getByLabelText(/Buscar/i), { target: { value: 'García' } });

    expect(screen.getByText('García, Bruno')).toBeInTheDocument();
    expect(screen.queryByText('Fernández, Lucía')).not.toBeInTheDocument();
  });
});
