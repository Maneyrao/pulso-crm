import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Mi cuenta: datos de la sesión activa (todo ya vive en `useSessionStore`,
 * sin query nueva) + botón de logout real (`POST /auth/logout`).
 *
 * No hay endpoint de "cambiar mi contraseña" en `lib/api/auth.ts` ni en
 * `lib/api/iam.ts` (sólo `resetUserPassword(id)`, acción administrativa
 * sobre OTRO usuario), ni un campo de rol resuelto en `AuthUser` — sólo
 * `permissions: Permission[]` — así que la pantalla no tiene esas secciones.
 */

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/account',
  useSearchParams: () => new URLSearchParams(),
}));

const logoutMock = vi.fn();
vi.mock('@/lib/api/auth', () => ({
  logout: (...args: unknown[]) => logoutMock(...args),
}));

function withProviders(children: ReactNode): ReactNode {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function primeSession(): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u1', firstName: 'Ana', lastName: 'García', email: 'ana@demo.com' },
    gym: { id: 'g1', slug: 'demo', name: 'Gimnasio Demo', currency: 'ARS', features: [] },
    branches: [
      { id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' },
      { id: 'b2', name: 'Norte', timezone: 'America/Argentina/Buenos_Aires' },
    ],
    activeBranchId: 'b1',
    permissions: ['member:read', 'cash:read'],
    status: 'authenticated',
  } as never);
}

beforeEach(async () => {
  pushMock.mockReset();
  logoutMock.mockReset();
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

describe('AccountPage', () => {
  it('muestra nombre, email, iniciales, gimnasio, sede activa, sedes con acceso y permisos', async () => {
    await primeSession();

    const { default: AccountPage } = await import('./page');
    render(withProviders(<AccountPage />));

    expect(screen.getByText('Mi cuenta')).toBeInTheDocument();
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.getByText('ana@demo.com')).toBeInTheDocument();
    expect(screen.getByText('AG')).toBeInTheDocument();
    expect(screen.getByText('Gimnasio Demo')).toBeInTheDocument();
    expect(screen.getAllByText('Centro').length).toBeGreaterThan(0);
    expect(screen.getByText('Norte')).toBeInTheDocument();

    // Permisos reales de la sesión, sin inventar un "rol".
    expect(screen.getByText(/Permisos \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('cash:read')).toBeInTheDocument();
    expect(screen.getByText('member:read')).toBeInTheDocument();
    expect(screen.queryByText(/doble factor/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rol/i)).not.toBeInTheDocument();
  });

  it('sin sesión no renderiza contenido', async () => {
    const { default: AccountPage } = await import('./page');
    const { container } = render(withProviders(<AccountPage />));

    expect(container).toBeEmptyDOMElement();
  });

  it('cerrar sesión: llama a logout, limpia el store y navega a /login', async () => {
    await primeSession();
    logoutMock.mockResolvedValueOnce(undefined);

    const { default: AccountPage } = await import('./page');
    render(withProviders(<AccountPage />));

    fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/i }));

    await waitFor(() => expect(logoutMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));

    const { useSessionStore } = await import('@/lib/stores/session');
    expect(useSessionStore.getState().status).toBe('unauthenticated');
    expect(useSessionStore.getState().user).toBeNull();
  });
});
