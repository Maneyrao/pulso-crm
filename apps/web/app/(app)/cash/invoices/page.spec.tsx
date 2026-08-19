import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Caja › Factura electrónica — pantalla de demo sin backend (`billing:read`),
 * datos de `lib/mock/data/commerce-demo.ts` vía `useMockData`.
 */

function withProviders(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['billing:read']): Promise<void> {
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

describe('CashInvoicesPage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: CashInvoicesPage } = await import('./page');
    render(withProviders(<CashInvoicesPage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('muestra el alert de ARCA y lista los comprobantes con estado', async () => {
    await primeSession();
    const { default: CashInvoicesPage } = await import('./page');
    render(withProviders(<CashInvoicesPage />));

    expect(
      screen.getByText(/La integración con ARCA se configura en una etapa posterior\./i),
    ).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('B-0001-00001234')).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getByText('García, Bruno')).toBeInTheDocument();
    expect(screen.getAllByText('Cuota mensual').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Emitida').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pendiente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rechazada').length).toBeGreaterThan(0);

    const rows = screen.getAllByRole('row');
    // 12 comprobantes + 1 fila de encabezado.
    expect(rows.length).toBe(13);
  });
});
