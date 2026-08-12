import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * LoginForm (FRONTEND_PLAN §6.1 — cinco estados).
 *
 * El backend ya cubre el timing y la no-distinción entre email inexistente
 * y password mala (test/auth.spec.ts). Este test cierra la mitad UI:
 *  - Renderiza los campos y el botón, con foco inicial en el email para no
 *    romper el flujo de teclado en recepción.
 *  - Muestra el error INLINE genérico ("Email o contraseña incorrectos") ante
 *    ApiError con code INVALID_CREDENTIALS, sin revelar cuál campo falló.
 *  - Un error genérico distinto (network) tampoco distingue email vs password.
 *  - Los mensajes de otros branches (ACCOUNT_LOCKED, GYM_SUSPENDED) se
 *    diferencian sólo cuando el servidor lo dice explícitamente — el
 *    default cubre todo lo demás.
 */

const routerPush = vi.fn();
const searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => searchParams,
}));

const loginMock = vi.fn();
const resolveActiveBranchIdMock = vi.fn();
vi.mock('@/lib/api/auth', () => ({
  login: (...args: unknown[]) => loginMock(...args),
  resolveActiveBranchId: (...args: unknown[]) => resolveActiveBranchIdMock(...args),
}));

function withQuery(children: ReactNode): ReactNode {
  // Cada test estrena un QueryClient para que el estado de useMutation
  // no se filtre entre casos (react-query lo memoriza por clave).
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  routerPush.mockReset();
  loginMock.mockReset();
  resolveActiveBranchIdMock.mockReset();
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

async function submit(email: string, password: string): Promise<void> {
  fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: password } });
  fireEvent.submit(screen.getByRole('button', { name: /Iniciar sesión/i }).closest('form')!);
}

describe('LoginForm', () => {
  it('renderiza email, password, botón; foco inicial en email', async () => {
    const { LoginForm } = await import('./LoginForm');
    render(withQuery(<LoginForm />));
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar sesión/i })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/Email/i)));
  });

  it('ante credenciales inválidas muestra el mensaje genérico, no revela cuál campo falló', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    loginMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: 'INVALID_CREDENTIALS',
        detail: 'Server-side puede decir lo que quiera; el UI muestra genérico.',
        requestId: 'req-x',
      }),
    );
    const { LoginForm } = await import('./LoginForm');
    render(withQuery(<LoginForm />));
    await submit('alguien@demo.local', 'wrongpassword');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email o contraseña incorrectos.');
    // Comprobación negativa: NO hay pistas sobre email o password puntualmente.
    expect(alert.textContent?.toLowerCase()).not.toContain('email no existe');
    expect(alert.textContent?.toLowerCase()).not.toContain('contraseña incorrecta');
  });

  it('ante ACCOUNT_LOCKED muestra el mensaje que envía el server (branch específico)', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    loginMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: 'ACCOUNT_LOCKED',
        detail: 'Bloqueada hasta las 12:15.',
        requestId: 'req-y',
      }),
    );
    const { LoginForm } = await import('./LoginForm');
    render(withQuery(<LoginForm />));
    await submit('alguien@demo.local', 'anyvalidpwd');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Bloqueada hasta las 12:15.');
  });

  it('sin activeBranchId en la sesión devuelta muestra aviso y no navega', async () => {
    loginMock.mockResolvedValueOnce({
      user: { id: 'u', firstName: 'A', lastName: 'B', email: 'a@b.com', mustChangePassword: false },
      gym: { id: 'g', name: 'X', slug: 'x', country: 'AR', currency: 'ARS', features: [] },
      branches: [],
      permissions: [],
      activeBranchId: undefined,
    });
    resolveActiveBranchIdMock.mockReturnValueOnce(null);
    const { LoginForm } = await import('./LoginForm');
    render(withQuery(<LoginForm />));
    await submit('a@b.com', 'validpassword');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/sedes asignadas/i);
    expect(routerPush).not.toHaveBeenCalled();
  });
});
