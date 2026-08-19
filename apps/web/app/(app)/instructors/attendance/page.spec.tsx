import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Instructores › Asistencias — pantalla de demo sin backend
 * (`instructor:attendance`), datos de `lib/mock/data/training-demo.ts` vía
 * `useMockData`. Filtro por instructor y rango de fechas corren en cliente;
 * el resumen de horas se recalcula sobre el subconjunto filtrado.
 */

function withProviders(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['instructor:attendance']): Promise<void> {
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

describe('InstructorAttendancePage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: AttendancePage } = await import('./page');
    render(withProviders(<AttendancePage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: fecha, instructor, entrada, salida y total de horas del período', async () => {
    await primeSession();
    const { default: AttendancePage } = await import('./page');
    render(withProviders(<AttendancePage />));

    await screen.findAllByText('2026-08-03', {}, { timeout: 2000 });
    expect(screen.getAllByText('Martín Sosa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('08:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('16:00').length).toBeGreaterThan(0);

    // Total sin filtros: suma de las 55 fichadas del dataset (380 hs).
    expect(screen.getByText('380.00 hs')).toBeInTheDocument();
  });

  it('el filtro por instructor muestra sólo sus fichadas y recalcula el total', async () => {
    await primeSession();
    const user = userEvent.setup();
    const { default: AttendancePage } = await import('./page');
    render(withProviders(<AttendancePage />));

    await screen.findAllByText('2026-08-03', {}, { timeout: 2000 });

    await user.click(screen.getByLabelText(/^Instructor$/i));
    await user.click(await screen.findByRole('option', { name: 'Camila Torres' }));

    expect(screen.getByText('40.00 hs')).toBeInTheDocument();
    expect(screen.queryByText('Martín Sosa')).not.toBeInTheDocument();
  });

  it('el filtro "Desde" oculta fichadas anteriores y recalcula el total', async () => {
    await primeSession();
    const { default: AttendancePage } = await import('./page');
    render(withProviders(<AttendancePage />));

    await screen.findAllByText('2026-08-03', {}, { timeout: 2000 });

    fireEvent.change(screen.getByLabelText(/Desde/i), { target: { value: '2026-08-10' } });

    expect(screen.queryAllByText('2026-08-03')).toHaveLength(0);
    expect(screen.getByText('170.00 hs')).toBeInTheDocument();
  });
});
