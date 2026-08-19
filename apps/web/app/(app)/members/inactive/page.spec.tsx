import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Baja de socios (demo). Sin backend: dos listas (cuota vencida / sin
 * asistencias) desde `lib/mock/data/members-demo.ts`. La acción "dar de
 * baja" no pega a ningún endpoint — sólo limpia selección y avisa por toast.
 */

function withToast(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['member:read']): Promise<void> {
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

describe('InactiveMembersPage', () => {
  it('render feliz: tab "Con cuota vencida" muestra socio, DNI, membresía, vencimiento y días de retraso', async () => {
    await primeSession();
    const { default: InactiveMembersPage } = await import('./page');
    render(withToast(<InactiveMembersPage />));

    await screen.findByText('Milagros Medina');
    expect(screen.getByText('12 socios')).toBeInTheDocument();
    expect(screen.getAllByText('CrossFit').length).toBeGreaterThan(0);
    expect(screen.getByText('01/06/2026')).toBeInTheDocument();
    expect(screen.getByText('79 días')).toBeInTheDocument();
  });

  it('la tab "Sin asistencias" muestra los socios sin asistir hace más de 30 días', async () => {
    await primeSession();
    const user = userEvent.setup();
    const { default: InactiveMembersPage } = await import('./page');
    render(withToast(<InactiveMembersPage />));

    await screen.findByText('Milagros Medina');
    await user.click(screen.getByRole('tab', { name: 'Sin asistencias' }));

    await waitFor(() => expect(screen.getByText('Bruno García')).toBeInTheDocument());
    expect(screen.getByText('49 días')).toBeInTheDocument();
  });

  it('seleccionar un socio muestra la barra de acción masiva y confirmar limpia la selección con un toast', async () => {
    await primeSession();
    const { default: InactiveMembersPage } = await import('./page');
    render(withToast(<InactiveMembersPage />));

    await screen.findByText('Milagros Medina');
    fireEvent.click(screen.getByLabelText('Seleccionar a Milagros Medina'));

    const bulkButton = await screen.findByRole('button', { name: 'Dar de baja 1 socios' });
    fireEvent.click(bulkButton);

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByText('Función disponible cuando el módulo tenga backend')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Dar de baja \d+ socios/ })).not.toBeInTheDocument(),
    );
  });

  it('el ícono de baja por fila abre la confirmación para ese socio', async () => {
    await primeSession();
    const { default: InactiveMembersPage } = await import('./page');
    render(withToast(<InactiveMembersPage />));

    await screen.findByText('Milagros Medina');
    fireEvent.click(screen.getByLabelText('Dar de baja a Santiago Herrera'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Dar de baja a este socio')).toBeInTheDocument();
  });

  it('sin el permiso member:read no se ve el contenido de la pantalla', async () => {
    await primeSession([]);
    const { default: InactiveMembersPage } = await import('./page');
    render(withToast(<InactiveMembersPage />));

    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
    expect(screen.queryByText('Baja de socios')).not.toBeInTheDocument();
  });
});
