import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Instructores › Listado — pantalla de demo sin backend (`instructor:read`),
 * datos de `lib/mock/data/training-demo.ts` vía `useMockData`.
 */

function withProviders(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['instructor:read']): Promise<void> {
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

describe('InstructorsPage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: InstructorsPage } = await import('./page');
    render(withProviders(<InstructorsPage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: nombre, email, teléfono, especialidad, socios asignados y estado', async () => {
    await primeSession();
    const { default: InstructorsPage } = await import('./page');
    render(withProviders(<InstructorsPage />));

    await screen.findByText('martin.sosa@pulsogym.com', {}, { timeout: 2000 });

    const row = screen.getByText('martin.sosa@pulsogym.com').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Martín Sosa')).toBeInTheDocument();
    expect(within(row!).getByText('MS')).toBeInTheDocument();
    expect(within(row!).getByText('+54 9 11 4455-1200')).toBeInTheDocument();
    expect(within(row!).getByText('Musculación')).toBeInTheDocument();
    expect(within(row!).getByText('32')).toBeInTheDocument();
    expect(within(row!).getByText('Activo')).toBeInTheDocument();

    const inactiveRow = screen.getByText('nicolas.romero@pulsogym.com').closest('tr');
    expect(within(inactiveRow!).getByText('Inactivo')).toBeInTheDocument();
  });

  it('el ícono de "ver" muestra el toast demo', async () => {
    await primeSession();
    const { default: InstructorsPage } = await import('./page');
    render(withProviders(<InstructorsPage />));

    await screen.findByText('Martín Sosa', {}, { timeout: 2000 });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ver instructor' })[0]!);
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });

  it('"Nuevo instructor" abre el modal y "Guardar" muestra el toast demo', async () => {
    await primeSession();
    const { default: InstructorsPage } = await import('./page');
    render(withProviders(<InstructorsPage />));

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo instructor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo instructor' });

    fireEvent.change(within(dialog).getByLabelText(/Nombre/i), { target: { value: 'Lucas' } });
    fireEvent.change(within(dialog).getByLabelText(/Apellido/i), { target: { value: 'Pérez' } });
    fireEvent.change(within(dialog).getByLabelText(/Email/i), { target: { value: 'lucas@pulsogym.com' } });
    fireEvent.change(within(dialog).getByLabelText(/Especialidad/i), { target: { value: 'Natación' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });
});
