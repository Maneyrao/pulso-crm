import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Entrenamientos (demo). Sin backend: puntajes desde
 * `lib/mock/data/members-demo.ts`, ordenados de mayor a menor puntaje.
 */

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

describe('WorkoutsPage', () => {
  it('render feliz: socio con mayor puntaje aparece primero, con estado de rutina e instructor', async () => {
    await primeSession();
    const { default: WorkoutsPage } = await import('./page');
    render(<WorkoutsPage />);

    await screen.findByText('Julieta Romero');
    const rows = screen.getAllByRole('row');
    // rows[0] es el header; rows[1] es el socio con mayor puntaje.
    expect(rows[1]).toHaveTextContent('Julieta Romero');
    expect(rows[1]).toHaveTextContent('39456123');
    expect(rows[1]).toHaveTextContent('99');
    expect(rows[1]).toHaveTextContent('Prof. Carla Núñez');
    expect(rows[1]).toHaveTextContent('Con rutina');
  });

  it('un socio sin rutina muestra "Sin rutina" e instructor "—"', async () => {
    await primeSession();
    const { default: WorkoutsPage } = await import('./page');
    render(<WorkoutsPage />);

    await screen.findByText('Sofía Gómez');
    const row = screen.getByText('Sofía Gómez').closest('tr');
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent('Sin rutina');
    expect(row).toHaveTextContent('—');
  });

  it('la búsqueda filtra por nombre o DNI', async () => {
    await primeSession();
    const { default: WorkoutsPage } = await import('./page');
    render(<WorkoutsPage />);

    await screen.findByText('Julieta Romero');
    fireEvent.change(screen.getByLabelText('Buscar por nombre o DNI'), { target: { value: '39456123' } });

    await waitFor(() => {
      expect(screen.getByText('Julieta Romero')).toBeInTheDocument();
      expect(screen.queryByText('Matías Vega')).not.toBeInTheDocument();
    });
  });

  it('sin el permiso routine:read no se ve el contenido de la pantalla', async () => {
    await primeSession([]);
    const { default: WorkoutsPage } = await import('./page');
    render(<WorkoutsPage />);

    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
    expect(screen.queryByText('Entrenamientos')).not.toBeInTheDocument();
  });
});
