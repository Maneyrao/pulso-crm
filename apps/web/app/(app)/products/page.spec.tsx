import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Productos (POS) — pantalla de demo sin backend (`product:read`), datos de
 * `lib/mock/data/commerce-demo.ts` vía `useMockData`.
 */

function withProviders(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['product:read']): Promise<void> {
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

describe('ProductsPage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: ProductsPage } = await import('./page');
    render(withProviders(<ProductsPage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: lista productos, categoría, precio, KPIs y stock bajo', async () => {
    await primeSession();
    const { default: ProductsPage } = await import('./page');
    render(withProviders(<ProductsPage />));

    await waitFor(() => expect(screen.getByText('Agua mineral 500ml')).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getAllByText('Bebidas').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$/).length).toBeGreaterThan(0);

    // KPIs: 14 productos activos (14 de 15, sólo "Guantes de entrenamiento" está inactivo)
    // y 1 sin stock (mismo producto, stock 0).
    expect(screen.getByText('Productos activos').nextSibling?.textContent).toBe('14');
    expect(screen.getByText('Sin stock').nextSibling?.textContent).toBe('1');

    // Stock bajo (< 5): "BCAA 200 cápsulas" tiene stock 2 y muestra el ícono de alerta.
    const bcaaRow = screen.getByText('BCAA 200 cápsulas').closest('tr');
    expect(bcaaRow).not.toBeNull();
    expect(bcaaRow?.querySelector('svg')).toBeTruthy();
  });

  it('la búsqueda filtra por nombre', async () => {
    await primeSession();
    const { default: ProductsPage } = await import('./page');
    render(withProviders(<ProductsPage />));

    await waitFor(() => expect(screen.getByText('Toalla deportiva')).toBeInTheDocument(), {
      timeout: 2000,
    });

    fireEvent.change(screen.getByLabelText(/Buscar/i), { target: { value: 'toalla' } });

    expect(screen.getByText('Toalla deportiva')).toBeInTheDocument();
    expect(screen.queryByText('Agua mineral 500ml')).not.toBeInTheDocument();
  });

  it('el filtro por categoría muestra sólo esa categoría', async () => {
    await primeSession();
    const user = userEvent.setup();
    const { default: ProductsPage } = await import('./page');
    render(withProviders(<ProductsPage />));

    await waitFor(() => expect(screen.getByText('Remera Pulso Gym')).toBeInTheDocument(), {
      timeout: 2000,
    });

    await user.click(screen.getByLabelText(/Categoría/i));
    await user.click(await screen.findByRole('option', { name: 'Indumentaria' }));

    expect(screen.getByText('Remera Pulso Gym')).toBeInTheDocument();
    expect(screen.queryByText('Agua mineral 500ml')).not.toBeInTheDocument();
  });

  it('"Vender" muestra el toast de demo', async () => {
    await primeSession();
    const { default: ProductsPage } = await import('./page');
    render(withProviders(<ProductsPage />));

    await waitFor(() => expect(screen.getByText('Agua mineral 500ml')).toBeInTheDocument(), {
      timeout: 2000,
    });

    fireEvent.click(screen.getAllByRole('button', { name: 'Vender' })[0]!);
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });

  it('"Nuevo producto" abre el modal demo y "Guardar" muestra el toast', async () => {
    await primeSession();
    const { default: ProductsPage } = await import('./page');
    render(withProviders(<ProductsPage />));

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo producto' }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo producto' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });
});
