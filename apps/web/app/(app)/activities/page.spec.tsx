import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { Activity } from '@pulso/contracts/catalog';

/**
 * Catálogo › Actividades (T-M4-1). Cubre feliz, empty, loading, error+retry,
 * toggle y creación.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/activities',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const listActivitiesMock = vi.fn();
const createActivityMock = vi.fn();
const updateActivityMock = vi.fn();

vi.mock('@/lib/api/catalog', () => ({
  listActivities: (...args: unknown[]) => listActivitiesMock(...args),
  createActivity: (...args: unknown[]) => createActivityMock(...args),
  updateActivity: (...args: unknown[]) => updateActivityMock(...args),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

async function primeSession(
  permissions: string[] = ['plan:read', 'plan:write'],
): Promise<void> {
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

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    gymId: 'g1',
    name: 'Musculación',
    description: 'Sala de máquinas y peso libre',
    color: '#3b82f6',
    isActive: true,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  listActivitiesMock.mockReset();
  createActivityMock.mockReset();
  updateActivityMock.mockReset();
  await primeSession();
});

describe('ActivitiesPage', () => {
  it('render feliz muestra las actividades con nombre, color y estado', async () => {
    listActivitiesMock.mockResolvedValueOnce({
      data: [
        makeActivity(),
        makeActivity({
          id: '00000000-0000-0000-0000-000000000002',
          name: 'Funcional',
          color: '#f59e0b',
          isActive: false,
        }),
      ],
    });
    const { default: ActivitiesPage } = await import('./page');
    render(withQuery(<ActivitiesPage />));

    await waitFor(() => expect(screen.getByText('Musculación')).toBeInTheDocument());
    expect(screen.getByText('Funcional')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
    expect(screen.getByText('#3b82f6')).toBeInTheDocument();
  });

  it('empty muestra el mensaje inicial', async () => {
    listActivitiesMock.mockResolvedValueOnce({ data: [] });
    const { default: ActivitiesPage } = await import('./page');
    render(withQuery(<ActivitiesPage />));
    await waitFor(() =>
      expect(screen.getByText(/Todavía no hay actividades/i)).toBeInTheDocument(),
    );
  });

  it('loading mantiene la tabla con aria-busy mientras la query está en vuelo', async () => {
    listActivitiesMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: ActivitiesPage } = await import('./page');
    render(withQuery(<ActivitiesPage />));
    const table = await screen.findByRole('table');
    expect(table).toHaveAttribute('aria-busy', 'true');
  });

  it('ante error muestra alert con reintento', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    listActivitiesMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'INTERNAL_ERROR',
        title: 'Error',
        status: 500,
        detail: 'La base explotó',
      }),
    );
    const { default: ActivitiesPage } = await import('./page');
    render(withQuery(<ActivitiesPage />));
    expect(await screen.findByText(/La base explotó/)).toBeInTheDocument();

    listActivitiesMock.mockResolvedValueOnce({ data: [] });
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    await waitFor(() => expect(listActivitiesMock).toHaveBeenCalledTimes(2));
  });

  it('toggle activo llama a updateActivity con isActive invertido', async () => {
    listActivitiesMock.mockResolvedValueOnce({ data: [makeActivity()] });
    updateActivityMock.mockResolvedValueOnce(makeActivity({ isActive: false }));
    const { default: ActivitiesPage } = await import('./page');
    render(withQuery(<ActivitiesPage />));

    await waitFor(() => expect(screen.getByText('Musculación')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Desactivar/i }));

    await waitFor(() => expect(updateActivityMock).toHaveBeenCalledTimes(1));
    expect(updateActivityMock).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
      { isActive: false },
    );
  });

  it('crear actividad: envía nombre + descripción + color y una Idempotency-Key uuid', async () => {
    listActivitiesMock.mockResolvedValue({ data: [] });
    createActivityMock.mockResolvedValueOnce(makeActivity());
    const { default: ActivitiesPage } = await import('./page');
    render(withQuery(<ActivitiesPage />));

    await waitFor(() =>
      expect(screen.getByText(/Todavía no hay actividades/i)).toBeInTheDocument(),
    );
    // Hay dos botones "Nueva actividad" (header + empty state); alcanza con el primero.
    fireEvent.click(screen.getAllByRole('button', { name: /Nueva actividad/i })[0]!);

    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Yoga' } });
    fireEvent.change(screen.getByLabelText(/Descripción/i), {
      target: { value: 'Clases de yoga para todo nivel.' },
    });
    fireEvent.change(screen.getByPlaceholderText(/#RRGGBB/i), { target: { value: '#22c55e' } });

    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));

    await waitFor(() => expect(createActivityMock).toHaveBeenCalledTimes(1));
    const [payload, idempotencyKey] = createActivityMock.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(payload).toEqual({
      name: 'Yoga',
      description: 'Clases de yoga para todo nivel.',
      color: '#22c55e',
    });
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
