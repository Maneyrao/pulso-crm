import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Rutinas — pantalla de demo sin backend (`routine:read`), datos de
 * `lib/mock/data/training-demo.ts` vía `useMockData`.
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

/** Sube desde el título de la card (h3) hasta el contenedor `<Card>`. */
function getRoutineCard(title: string): HTMLElement {
  const heading = screen.getByText(title);
  const cardHeader = heading.closest('div');
  const card = cardHeader?.parentElement;
  if (!card) throw new Error(`No se encontró la card de "${title}"`);
  return card;
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

describe('RoutinesPage', () => {
  it('sin permiso muestra el fallback de acceso', async () => {
    await primeSession([]);
    const { default: RoutinesPage } = await import('./page');
    render(withProviders(<RoutinesPage />));
    expect(await screen.findByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: nombre, objetivo, badges de días/ejercicios, instructor y socios asignados', async () => {
    await primeSession();
    const { default: RoutinesPage } = await import('./page');
    render(withProviders(<RoutinesPage />));

    await screen.findByText('Quema grasa funcional', {}, { timeout: 2000 });

    const card = getRoutineCard('Quema grasa funcional');
    expect(within(card).getByText('Pérdida de grasa')).toBeInTheDocument();
    expect(within(card).getByText('3 días/semana')).toBeInTheDocument();
    expect(within(card).getByText('8 ejercicios')).toBeInTheDocument();
    expect(within(card).getByText('Rocío Fernández')).toBeInTheDocument();
    expect(within(card).getByText('41')).toBeInTheDocument();
    expect(within(card).getByText('Activa')).toBeInTheDocument();
  });

  it('una rutina sin instructor muestra "Sin asignar" y estado Borrador', async () => {
    await primeSession();
    const { default: RoutinesPage } = await import('./page');
    render(withProviders(<RoutinesPage />));

    await screen.findByText('Tonificación general', {}, { timeout: 2000 });
    const card = getRoutineCard('Tonificación general');
    expect(within(card).getByText('Sin asignar')).toBeInTheDocument();
    expect(within(card).getByText('Borrador')).toBeInTheDocument();
  });

  it('"Nueva rutina" abre el modal y "Guardar" muestra el toast demo', async () => {
    await primeSession();
    const { default: RoutinesPage } = await import('./page');
    render(withProviders(<RoutinesPage />));

    fireEvent.click(screen.getByRole('button', { name: 'Nueva rutina' }));
    expect(await screen.findByRole('dialog', { name: 'Nueva rutina' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Rutina de prueba' } });
    fireEvent.change(screen.getByLabelText(/Objetivo/i), { target: { value: 'Resistencia' } });
    fireEvent.change(screen.getByLabelText(/Días por semana/i), { target: { value: '3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });
});
