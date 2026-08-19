import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Fidelización › Historial de puntos — pantalla de demo sin backend
 * (`loyalty:read`), datos de `lib/mock/data/commerce-demo.ts` vía
 * `useMockData`, ordenados por fecha descendente.
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

describe('LoyaltyHistoryPage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: LoyaltyHistoryPage } = await import('./page');
    render(withProviders(<LoyaltyHistoryPage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('ordena por fecha descendente y muestra el signo de los puntos', async () => {
    await primeSession();
    const { default: LoyaltyHistoryPage } = await import('./page');
    render(withProviders(<LoyaltyHistoryPage />));

    await waitFor(() => expect(screen.getAllByText('Asistencia').length).toBeGreaterThan(0), {
      timeout: 2000,
    });

    const rows = screen.getAllByRole('row');
    // rows[0] es el encabezado; rows[1] es el movimiento más reciente (2026-08-18).
    expect(within(rows[1]!).getByText('2026-08-18')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('+10')).toBeInTheDocument();

    const lastRow = rows[rows.length - 1]!;
    expect(within(lastRow).getByText('2026-08-01')).toBeInTheDocument();

    // Un canje (delta negativo) muestra el signo "-".
    expect(screen.getAllByText(/^-\d+$/).length).toBeGreaterThan(0);
  });
});
