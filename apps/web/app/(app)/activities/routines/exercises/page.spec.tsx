import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Ejercicios — pantalla de demo sin backend (`routine:read`), datos de
 * `lib/mock/data/training-demo.ts` vía `useMockData`. Búsqueda y filtros de
 * categoría/origen corren en cliente.
 */

function withProviders(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['routine:read']): Promise<void> {
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

describe('ExercisesPage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: ExercisesPage } = await import('./page');
    render(withProviders(<ExercisesPage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: nombre, categoría, músculo, equipo, origen y video', async () => {
    await primeSession();
    const { default: ExercisesPage } = await import('./page');
    render(withProviders(<ExercisesPage />));

    await screen.findByText('Press de banca plano', {}, { timeout: 2000 });

    const row = screen.getByText('Press de banca plano').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Tren superior')).toBeInTheDocument();
    expect(within(row!).getByText('Pectorales')).toBeInTheDocument();
    expect(within(row!).getByText('Barra')).toBeInTheDocument();
    expect(within(row!).getByText('Catálogo')).toBeInTheDocument();
    // Tiene video: ícono, no guion.
    expect(row!.querySelector('svg')).toBeTruthy();

    const noVideoRow = screen.getByText('Bicicleta fija').closest('tr');
    expect(within(noVideoRow!).getByText('—')).toBeInTheDocument();
  });

  it('la búsqueda filtra por nombre', async () => {
    await primeSession();
    const { default: ExercisesPage } = await import('./page');
    render(withProviders(<ExercisesPage />));

    await screen.findByText('Sentadilla con barra', {}, { timeout: 2000 });

    fireEvent.change(screen.getByLabelText(/Buscar/i), { target: { value: 'sentadilla' } });

    expect(screen.getByText('Sentadilla con barra')).toBeInTheDocument();
    expect(screen.queryByText('Press de banca plano')).not.toBeInTheDocument();
  });

  it('el filtro por categoría muestra sólo esa categoría', async () => {
    await primeSession();
    const user = userEvent.setup();
    const { default: ExercisesPage } = await import('./page');
    render(withProviders(<ExercisesPage />));

    await screen.findByText('Plancha abdominal', {}, { timeout: 2000 });

    await user.click(screen.getByLabelText(/Categoría/i));
    await user.click(await screen.findByRole('option', { name: 'Core' }));

    expect(screen.getByText('Plancha abdominal')).toBeInTheDocument();
    expect(screen.queryByText('Press de banca plano')).not.toBeInTheDocument();
  });

  it('el filtro por origen muestra sólo ese origen', async () => {
    await primeSession();
    const user = userEvent.setup();
    const { default: ExercisesPage } = await import('./page');
    render(withProviders(<ExercisesPage />));

    await screen.findByText('Flexiones de brazos', {}, { timeout: 2000 });

    await user.click(screen.getByLabelText(/Origen/i));
    await user.click(await screen.findByRole('option', { name: 'Propio' }));

    expect(screen.getByText('Flexiones de brazos')).toBeInTheDocument();
    expect(screen.queryByText('Press de banca plano')).not.toBeInTheDocument();
  });

  it('"Nuevo ejercicio" abre el modal y "Guardar" muestra el toast demo', async () => {
    await primeSession();
    const { default: ExercisesPage } = await import('./page');
    render(withProviders(<ExercisesPage />));

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo ejercicio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo ejercicio' });

    // "Categoría" también rotula el filtro de la tabla: se escopea al modal.
    fireEvent.change(within(dialog).getByLabelText(/Nombre/i), { target: { value: 'Ejercicio de prueba' } });
    fireEvent.change(within(dialog).getByLabelText(/Categoría/i), { target: { value: 'Core' } });
    fireEvent.change(within(dialog).getByLabelText(/Músculo/i), { target: { value: 'Core' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });
});
