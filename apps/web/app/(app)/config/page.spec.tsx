import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { Branch, Gym } from '@pulso/contracts/tenancy';

/**
 * Configuración (`GET/PATCH /gym`, `GET /branches`). Sólo dos tabs con datos
 * reales: "Gimnasio" (editable con `config:write`) y "Sedes" (listado con
 * link a `/settings/branches`, sin CRUD duplicado acá).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/config',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const getGymMock = vi.fn();
const updateGymMock = vi.fn();
const listBranchesMock = vi.fn();
vi.mock('@/lib/api/tenancy', () => ({
  getGym: (...args: unknown[]) => getGymMock(...args),
  updateGym: (...args: unknown[]) => updateGymMock(...args),
  listBranches: (...args: unknown[]) => listBranchesMock(...args),
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
  deactivateBranch: vi.fn(),
}));

function withProviders(children: ReactNode): ReactNode {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function makeGym(overrides: Partial<Gym> = {}): Gym {
  return {
    id: 'g1',
    slug: 'demo',
    name: 'Gimnasio Demo',
    legalName: null,
    taxId: null,
    country: 'AR',
    currency: 'ARS',
    locale: 'es-AR',
    status: 'ACTIVE',
    suspendedAt: null,
    suspendedReason: null,
    saasPlanId: '00000000-0000-0000-0000-0000000000f1',
    logoKey: null,
    primaryColor: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'b1',
    gymId: 'g1',
    name: 'Sede Centro',
    timezone: 'America/Argentina/Buenos_Aires',
    address: null,
    phone: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function primeSession(permissions: string[] = ['config:read']): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u1', firstName: 'Ana', lastName: 'T', email: 'a@t.com' },
    gym: { id: 'g1', slug: 'demo', name: 'Gimnasio Demo', currency: 'ARS', features: [] },
    branches: [{ id: 'b1', name: 'Sede Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions,
    status: 'authenticated',
  } as never);
}

beforeEach(async () => {
  getGymMock.mockReset();
  updateGymMock.mockReset();
  listBranchesMock.mockReset();
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
  it('sin permiso config:read muestra el fallback de sin acceso', async () => {
    await primeSession([]);

    const { default: ConfigPage } = await import('./page');
    render(withProviders(<ConfigPage />));

    expect(screen.getByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('tab Gimnasio: pinta los datos reales de GET /gym sin secciones demo', async () => {
    await primeSession(['config:read']);
    getGymMock.mockResolvedValue(makeGym());
    listBranchesMock.mockResolvedValue({ data: [makeBranch()] });

    const { default: ConfigPage } = await import('./page');
    render(withProviders(<ConfigPage />));

    expect(screen.getByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue('Gimnasio Demo')).toBeInTheDocument());
    expect(screen.getByDisplayValue('AR')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ARS')).toBeInTheDocument();

    // Sin los tabs demo que no persisten (facturación, app móvil, control de acceso).
    expect(screen.queryByRole('tab', { name: /Facturación/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /App móvil/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Control de acceso/i)).not.toBeInTheDocument();
  });

  it('sin config:write: los campos están deshabilitados y no hay botón "Guardar cambios"', async () => {
    await primeSession(['config:read']);
    getGymMock.mockResolvedValue(makeGym());
    listBranchesMock.mockResolvedValue({ data: [] });

    const { default: ConfigPage } = await import('./page');
    render(withProviders(<ConfigPage />));

    await waitFor(() => expect(screen.getByDisplayValue('Gimnasio Demo')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Gimnasio Demo')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Guardar cambios/i })).not.toBeInTheDocument();
  });

  it('con config:write: edita el nombre y envía PATCH /gym con los campos reales', async () => {
    await primeSession(['config:read', 'config:write']);
    getGymMock.mockResolvedValue(makeGym());
    listBranchesMock.mockResolvedValue({ data: [] });
    updateGymMock.mockResolvedValueOnce(makeGym({ name: 'Gimnasio Actualizado' }));

    const { default: ConfigPage } = await import('./page');
    render(withProviders(<ConfigPage />));

    const nameInput = await screen.findByDisplayValue('Gimnasio Demo');
    fireEvent.change(nameInput, { target: { value: 'Gimnasio Actualizado' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/i }));

    await waitFor(() => expect(updateGymMock).toHaveBeenCalledTimes(1));
    const [payload] = updateGymMock.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toMatchObject({ name: 'Gimnasio Actualizado', country: 'AR', currency: 'ARS' });
  });

  it('tab Sedes: lista las sedes reales de GET /branches con link a /settings/branches', async () => {
    await primeSession(['config:read']);
    getGymMock.mockResolvedValue(makeGym());
    listBranchesMock.mockResolvedValue({
      data: [makeBranch(), makeBranch({ id: 'b2', name: 'Sede Norte', isActive: false })],
    });

    const { default: ConfigPage } = await import('./page');
    render(withProviders(<ConfigPage />));

    // Radix Tabs activa con eventos de pointer reales: fireEvent.click no cambia de tab en jsdom.
    const user = (await import('@testing-library/user-event')).default.setup();
    await user.click(screen.getByRole('tab', { name: 'Sedes' }));

    await waitFor(() => expect(screen.getByText('Sede Centro')).toBeInTheDocument());
    expect(screen.getByText('Sede Norte')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Gestionar sedes/i });
    expect(link).toHaveAttribute('href', '/settings/branches');
  });
});
