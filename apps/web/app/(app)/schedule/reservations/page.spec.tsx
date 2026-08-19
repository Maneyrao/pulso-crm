import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { addMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Cronograma › Calendario de reservas (demo, `reservation:read`). Cubre
 * acceso, navegación de mes y el panel "Reservas del día" al seleccionar una
 * celda con y sin reservas. Los datos son deterministas por día-del-mes (ver
 * `lib/mock/data/schedule-demo.ts`), así que el test no asume un mes fijo.
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

describe('ScheduleReservationsPage', () => {
  it('sin el permiso reservation:read muestra "Sin acceso"', async () => {
    await primeSession([]);
    const { default: ScheduleReservationsPage } = await import('./page');
    render(<ScheduleReservationsPage />);
    expect(screen.getByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: título, badge Demo y calendario del mes actual', async () => {
    await primeSession();
    const { default: ScheduleReservationsPage } = await import('./page');
    render(<ScheduleReservationsPage />);

    expect(screen.getByRole('heading', { name: /Calendario de reservas/i })).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();

    const currentMonthLabel = format(new Date(), 'MMMM yyyy', { locale: es });
    await waitFor(() => expect(screen.getByText(currentMonthLabel)).toBeInTheDocument(), {
      timeout: 2000,
    });
  });

  it('sin selección muestra el mensaje "Elegí un día"', async () => {
    await primeSession();
    const { default: ScheduleReservationsPage } = await import('./page');
    render(<ScheduleReservationsPage />);

    await waitFor(() => expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(0), {
      timeout: 2000,
    });
    expect(screen.getByText('Elegí un día')).toBeInTheDocument();
  });

  it('seleccionar un día con reservas muestra la lista con hora, actividad, socio y estado', async () => {
    await primeSession();
    const { default: ScheduleReservationsPage } = await import('./page');
    render(<ScheduleReservationsPage />);

    await waitFor(() => expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(0), {
      timeout: 2000,
    });

    const cells = screen.getAllByRole('gridcell');
    const cellWithReservations = cells.find((cell) => /reservas?/i.test(cell.getAttribute('aria-label') ?? ''));
    expect(cellWithReservations).toBeDefined();

    fireEvent.click(cellWithReservations!);

    await waitFor(() => expect(screen.queryByText('Elegí un día')).not.toBeInTheDocument());
    expect(screen.getAllByText(/Confirmada|Cancelada/).length).toBeGreaterThan(0);
  });

  it('seleccionar un día sin reservas muestra el EmptyState "Sin reservas"', async () => {
    await primeSession();
    const { default: ScheduleReservationsPage } = await import('./page');
    render(<ScheduleReservationsPage />);

    await waitFor(() => expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(0), {
      timeout: 2000,
    });

    const cells = screen.getAllByRole('gridcell');
    const cellWithoutReservations = cells.find((cell) => {
      const label = cell.getAttribute('aria-label') ?? '';
      return !/reservas?/i.test(label);
    });
    expect(cellWithoutReservations).toBeDefined();

    fireEvent.click(cellWithoutReservations!);

    await waitFor(() => expect(screen.getByText('Sin reservas')).toBeInTheDocument());
  });

  it('navegar al mes siguiente actualiza el título', async () => {
    await primeSession();
    const { default: ScheduleReservationsPage } = await import('./page');
    render(<ScheduleReservationsPage />);

    await waitFor(() => expect(screen.getAllByRole('gridcell').length).toBeGreaterThan(0), {
      timeout: 2000,
    });

    const nextMonthLabel = format(addMonths(new Date(), 1), 'MMMM yyyy', { locale: es });
    fireEvent.click(screen.getByRole('button', { name: /Mes siguiente/i }));

    expect(screen.getByText(nextMonthLabel)).toBeInTheDocument();
  });
});
