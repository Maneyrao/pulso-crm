import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Fidelización › Configuración de puntos — pantalla de demo sin backend
 * (`loyalty:config`), datos de `lib/mock/data/commerce-demo.ts` vía
 * `useMockData`. Los inputs son editables en memoria; "Guardar" no persiste.
 */

function withProviders(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['loyalty:config']): Promise<void> {
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

describe('LoyaltyConfigPage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: LoyaltyConfigPage } = await import('./page');
    render(withProviders(<LoyaltyConfigPage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('carga las reglas, el catálogo de canjes y permite editar y guardar', async () => {
    await primeSession();
    const { default: LoyaltyConfigPage } = await import('./page');
    render(withProviders(<LoyaltyConfigPage />));

    await waitFor(() => expect(screen.getByText('Canjes')).toBeInTheDocument(), { timeout: 2000 });

    const attendance = document.getElementById('attendance-points') as HTMLInputElement;
    const renewal = document.getElementById('renewal-points') as HTMLInputElement;
    expect(attendance.value).toBe('10');
    expect(renewal.value).toBe('100');

    expect(screen.getByText('Bebida isotónica 500ml')).toBeInTheDocument();
    expect(screen.getByText('Barrita proteica')).toBeInTheDocument();

    fireEvent.change(attendance, { target: { value: '20' } });
    expect(attendance.value).toBe('20');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });
});
