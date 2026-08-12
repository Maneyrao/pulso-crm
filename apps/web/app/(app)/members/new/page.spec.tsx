import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';

/**
 * Alta de socio (T-M3-2). El foco de estos tests es la disciplina de la
 * mutación: doble click, idempotencia (misma clave para el mismo intento) y
 * navegación al detalle recién creado.
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/members/new',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const createMemberMock = vi.fn();
vi.mock('@/lib/api/members', () => ({
  createMember: (...args: unknown[]) => createMemberMock(...args),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

async function primeSession(permissions: string[] = ['member:write', 'member:read']): Promise<void> {
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

async function fillIdentity(): Promise<void> {
  fireEvent.change(screen.getByLabelText(/Número de documento/i), { target: { value: '20123456' } });
  fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Lucía' } });
  fireEvent.change(screen.getByLabelText(/Apellido/i), { target: { value: 'Pérez' } });
}

async function advanceToReview(): Promise<void> {
  await fillIdentity();
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
  await waitFor(() =>
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Crear socio/i })).toBeInTheDocument(),
  );
}

beforeEach(async () => {
  routerPush.mockReset();
  createMemberMock.mockReset();
  try {
    window.sessionStorage.clear();
  } catch {
    /* ignore */
  }
  await primeSession();
});

describe('NewMemberPage', () => {
  it('render feliz avanza los tres pasos y muestra la revisión', async () => {
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    expect(screen.getByRole('heading', { name: /Nuevo socio/i })).toBeInTheDocument();
    await advanceToReview();

    // La revisión muestra lo que se va a mandar.
    expect(screen.getByText(/Lucía Pérez/)).toBeInTheDocument();
    expect(screen.getByText(/DNI 20123456/)).toBeInTheDocument();
  });

  it('vacío en el paso 1 muestra empty descriptivo (validación bloquea avanzar)', async () => {
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/i }));
    // Los mensajes de FormField salen con role="alert".
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    // Seguimos en el paso Identidad.
    expect(screen.getByLabelText(/Número de documento/i)).toBeInTheDocument();
  });

  it('loading: mientras la mutation está pendiente, el botón muestra estado busy', async () => {
    createMemberMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await advanceToReview();
    const submit = screen.getByRole('button', { name: /Crear socio/i });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toHaveAttribute('aria-busy', 'true'));
  });

  it('ante error del backend muestra el detail en un alert live', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    createMemberMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'DUPLICATE_DOCUMENT',
        title: 'Conflicto',
        status: 409,
        detail: 'Ya existe un socio con ese documento.',
      }),
    );
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await advanceToReview();
    fireEvent.click(screen.getByRole('button', { name: /Crear socio/i }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Ya existe un socio con ese documento\./i)).toBeInTheDocument();
    // No se redirige tras un error.
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('doble submit no dispara dos mutations — protección de idempotencia', async () => {
    // La mutación queda pendiente para simular una latencia real.
    createMemberMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await advanceToReview();
    const submit = screen.getByRole('button', { name: /Crear socio/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    // Sólo una llamada, aunque haya tres clicks.
    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    // Y el segundo argumento (la Idempotency-Key) es un UUID string.
    const [, idempotencyKey] = createMemberMock.mock.calls[0] as [unknown, string];
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
