import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Cronograma › Franjas horarias (demo, `reservation:read`). Cubre acceso,
 * render feliz de la grilla semanal y el filtro por actividad.
 */

async function primeSession(permissions: string[] = ['reservation:read']): Promise<void> {
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

describe('SchedulePage', () => {
  it('sin el permiso reservation:read muestra "Sin acceso"', async () => {
    await primeSession([]);
    const { default: SchedulePage } = await import('./page');
    render(<SchedulePage />);
    expect(screen.getByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: título, badge Demo y franjas con hora/actividad/ocupación', async () => {
    await primeSession();
    const { default: SchedulePage } = await import('./page');
    render(<SchedulePage />);

    expect(screen.getByRole('heading', { name: /Cronograma/i })).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();

    await waitFor(() => expect(screen.getAllByText('08:00').length).toBeGreaterThan(0), {
      timeout: 2000,
    });
    expect(screen.getAllByText('CrossFit').length).toBeGreaterThan(0);
    expect(screen.getByText('12/15')).toBeInTheDocument();
    // Franja llena (booked === capacity) queda marcada con el mismo formato.
    expect(screen.getAllByText('12/12').length).toBeGreaterThan(0);
  });

  it('filtrar por actividad deja sólo las franjas de esa actividad', async () => {
    await primeSession();
    const user = userEvent.setup();
    const { default: SchedulePage } = await import('./page');
    render(<SchedulePage />);

    await waitFor(() => expect(screen.getAllByText('CrossFit').length).toBeGreaterThan(0), {
      timeout: 2000,
    });

    await user.click(screen.getByRole('combobox', { name: /Actividad/i }));
    await user.click(await screen.findByRole('option', { name: 'Pilates' }));

    await waitFor(() => expect(screen.queryByText('CrossFit')).not.toBeInTheDocument());
    expect(screen.getAllByText('Pilates').length).toBeGreaterThan(0);
  });
});
