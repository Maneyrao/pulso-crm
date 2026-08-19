import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Configuración general (demo, sin backend). Cubre gate de permiso, tabs,
 * acordeones (Caja / Control de acceso / Sede / Parámetros) y el toast de
 * "Guardar cambios" en cada tab.
 */

function withToast(children: ReactNode): ReactNode {
  return <ToastProvider>{children}</ToastProvider>;
}

async function primeSession(permissions: string[] = ['config:read']): Promise<void> {
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

describe('ConfigPage', () => {
  it('sin permiso config:read muestra el mensaje de sin acceso', async () => {
    await primeSession([]);
    const { default: ConfigPage } = await import('./page');
    render(withToast(<ConfigPage />));
    expect(screen.getByText('Sin acceso')).toBeInTheDocument();
  });

  it('con permiso muestra las tres tabs y la sección "Caja" abierta por defecto', async () => {
    await primeSession();
    const { default: ConfigPage } = await import('./page');
    render(withToast(<ConfigPage />));

    expect(screen.getByRole('tab', { name: 'Gimnasio' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Facturación electrónica' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'App móvil' })).toBeInTheDocument();

    expect(screen.getByLabelText('Permitir operar caja a no cajeros')).toBeVisible();
  });

  it('abrir el acordeón "Control de acceso" muestra sus tres toggles y togglear cambia el estado', async () => {
    await primeSession();
    const { default: ConfigPage } = await import('./page');
    render(withToast(<ConfigPage />));

    fireEvent.click(screen.getByText('Control de acceso'));

    const blockOnDebt = screen.getByLabelText('Bloquear ingreso con deuda');
    const duplicateWindow = screen.getByLabelText('Ventana de duplicados');
    const sounds = screen.getByLabelText('Sonidos');

    expect(blockOnDebt).toBeChecked();
    expect(duplicateWindow).toBeChecked();
    expect(sounds).toBeChecked();

    fireEvent.click(sounds);
    expect(sounds).not.toBeChecked();
  });

  it('la sección "Sede" permite editar nombre visible y zona horaria', async () => {
    const user = userEvent.setup();
    await primeSession();
    const { default: ConfigPage } = await import('./page');
    render(withToast(<ConfigPage />));

    fireEvent.click(screen.getByText('Sede'));

    const nameInput = screen.getByLabelText('Nombre visible') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Sede Norte' } });
    expect(nameInput).toHaveValue('Sede Norte');

    await user.click(screen.getByLabelText('Zona horaria'));
    await user.click(screen.getByRole('option', { name: 'Córdoba (GMT-3)' }));
    expect(screen.getByLabelText('Zona horaria')).toHaveTextContent('Córdoba (GMT-3)');
  });

  it('la sección "Parámetros" tiene capacidad máxima y días de gracia', async () => {
    await primeSession();
    const { default: ConfigPage } = await import('./page');
    render(withToast(<ConfigPage />));

    fireEvent.click(screen.getByText('Parámetros'));

    expect(screen.getByLabelText('Capacidad máxima de socios')).toHaveValue(150);
    expect(screen.getByLabelText('Días de gracia')).toHaveValue(3);
  });

  it('guardar cambios en Gimnasio muestra el toast de demo', async () => {
    await primeSession();
    const { default: ConfigPage } = await import('./page');
    render(withToast(<ConfigPage />));

    fireEvent.click(screen.getAllByRole('button', { name: 'Guardar cambios' })[0]!);
    expect(await screen.findByText('Demo: disponible con backend')).toBeInTheDocument();
  });

  it('la tab "Facturación electrónica" muestra el alert de ARCA y campos deshabilitados', async () => {
    const user = userEvent.setup();
    await primeSession();
    const { default: ConfigPage } = await import('./page');
    render(withToast(<ConfigPage />));

    await user.click(screen.getByRole('tab', { name: 'Facturación electrónica' }));

    expect(screen.getByText('Integración ARCA en etapa posterior')).toBeInTheDocument();
    expect(screen.getByLabelText('CUIT')).toBeDisabled();
    expect(screen.getByLabelText('Punto de venta')).toBeDisabled();
  });

  it('la tab "App móvil" muestra el alert de próximamente y el toggle de reservas', async () => {
    const user = userEvent.setup();
    await primeSession();
    const { default: ConfigPage } = await import('./page');
    render(withToast(<ConfigPage />));

    await user.click(screen.getByRole('tab', { name: 'App móvil' }));

    expect(screen.getByText('La app de socios llega después del MVP.', { exact: false })).toBeInTheDocument();
    const bookingToggle = screen.getByLabelText('Permitir reservas desde la app');
    expect(bookingToggle).not.toBeChecked();
    fireEvent.click(bookingToggle);
    expect(bookingToggle).toBeChecked();
  });
});
