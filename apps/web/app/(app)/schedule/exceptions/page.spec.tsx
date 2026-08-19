import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Cronograma › Excepciones y feriados (demo, `reservation:read`). Cubre
 * acceso, render feliz de la tabla y el flujo "Nueva excepción" (demo, sin
 * persistencia real: sólo dispara el toast de aviso).
 */

function withToast(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

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

describe('ScheduleExceptionsPage', () => {
  it('sin el permiso reservation:read muestra "Sin acceso"', async () => {
    await primeSession([]);
    const { default: ScheduleExceptionsPage } = await import('./page');
    render(withToast(<ScheduleExceptionsPage />));
    expect(screen.getByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('loading pinta la tabla en estado busy', async () => {
    await primeSession();
    const { default: ScheduleExceptionsPage } = await import('./page');
    render(withToast(<ScheduleExceptionsPage />));
    const table = await screen.findByRole('table');
    expect(table).toHaveAttribute('aria-busy', 'true');
  });

  it('render feliz: fecha dd/MM/yyyy, badge de tipo, motivo y sede', async () => {
    await primeSession();
    const { default: ScheduleExceptionsPage } = await import('./page');
    render(withToast(<ScheduleExceptionsPage />));

    await waitFor(() => expect(screen.getByText('01/01/2026')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Año Nuevo')).toBeInTheDocument();
    expect(screen.getAllByText('Feriado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Especial').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sede Centro').length).toBeGreaterThan(0);
  });

  it('nueva excepción (demo): completa el form y muestra el toast de aviso', async () => {
    await primeSession();
    const { default: ScheduleExceptionsPage } = await import('./page');
    render(withToast(<ScheduleExceptionsPage />));

    await waitFor(() => expect(screen.getByText('01/01/2026')).toBeInTheDocument(), { timeout: 2000 });

    fireEvent.click(screen.getByRole('button', { name: /Nueva excepción/i }));

    fireEvent.change(screen.getByLabelText(/Fecha/i), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: 'Corte de agua' } });

    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));

    await waitFor(() => expect(screen.getByText('Demo: disponible con backend')).toBeInTheDocument());
    expect(screen.queryByLabelText(/Motivo/i)).not.toBeInTheDocument();
  });

  it('nueva excepción sin motivo muestra el error de validación', async () => {
    await primeSession();
    const { default: ScheduleExceptionsPage } = await import('./page');
    render(withToast(<ScheduleExceptionsPage />));

    await waitFor(() => expect(screen.getByText('01/01/2026')).toBeInTheDocument(), { timeout: 2000 });

    fireEvent.click(screen.getByRole('button', { name: /Nueva excepción/i }));
    fireEvent.change(screen.getByLabelText(/Fecha/i), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Ingresá un motivo/i);
  });
});
