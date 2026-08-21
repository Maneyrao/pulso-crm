import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { Plan } from '@pulso/contracts/catalog';

/**
 * Alta de plan (`/plans/new`, Fase 2 del plan LeoDarrosaFIT): wizard de 3
 * pasos sobre `POST /plans`. Foco: validación por paso (nombre, CLASS_PACK
 * exige duración, precio), payload con Idempotency-Key, y que el doble click
 * no duplique la mutación.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/plans/new',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const createPlanMock = vi.fn();
const listActivitiesMock = vi.fn();
vi.mock('@/lib/api/catalog', () => ({
  createPlan: (...args: unknown[]) => createPlanMock(...args),
  listActivities: (...args: unknown[]) => listActivitiesMock(...args),
}));

const listBranchesMock = vi.fn();
vi.mock('@/lib/api/tenancy', () => ({
  listBranches: (...args: unknown[]) => listBranchesMock(...args),
}));

function withProviders(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

async function primeSession(permissions: string[] = ['plan:write', 'plan:read']): Promise<void> {
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

function createdPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p-new',
    gymId: 'g1',
    name: 'Funcional 3x',
    description: null,
    price: '24000.00',
    billingCycle: 'MONTHLY',
    durationDays: null,
    classesIncluded: null,
    weeklyAccessLimit: null,
    isActive: true,
    activityIds: [],
    branchIds: [],
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  createPlanMock.mockReset();
  listActivitiesMock.mockReset();
  listBranchesMock.mockReset();

  listActivitiesMock.mockResolvedValue({
    data: [
      { id: 'a1', gymId: 'g1', name: 'Funcional', description: null, isActive: true, createdAt: '', updatedAt: '' },
      { id: 'a2', gymId: 'g1', name: 'Spinning (baja)', description: null, isActive: false, createdAt: '', updatedAt: '' },
    ],
  });
  listBranchesMock.mockResolvedValue({
    data: [{ id: 'b1', gymId: 'g1', name: 'Centro', timezone: 'tz', address: null, phone: null, isActive: true, createdAt: '', updatedAt: '' }],
  });

  await primeSession();
});

async function fillDatosAndAdvance(): Promise<void> {
  fireEvent.change(await screen.findByLabelText(/^Nombre\b/i), { target: { value: 'Funcional 3x' } });
  fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));
  await screen.findByLabelText(/Ciclo de facturación/i);
}

describe('NewPlanPage', () => {
  it('sin permiso plan:write muestra el empty state', async () => {
    await primeSession(['plan:read']);
    const { default: NewPlanPage } = await import('./page');
    render(withProviders(<NewPlanPage />));

    expect(screen.getByText('Sin acceso')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Siguiente/i })).not.toBeInTheDocument();
  });

  it('paso 1 sin nombre no avanza y muestra el error', async () => {
    const { default: NewPlanPage } = await import('./page');
    render(withProviders(<NewPlanPage />));

    fireEvent.click(await screen.findByRole('button', { name: /^Siguiente$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Ingresá un nombre/i);
    expect(screen.queryByLabelText(/Ciclo de facturación/i)).not.toBeInTheDocument();
  });

  it('sólo lista actividades activas en el paso 1', async () => {
    const { default: NewPlanPage } = await import('./page');
    render(withProviders(<NewPlanPage />));

    expect(await screen.findByText('Funcional')).toBeInTheDocument();
    expect(screen.queryByText('Spinning (baja)')).not.toBeInTheDocument();
  });

  it('CLASS_PACK sin duración no pasa del paso 2', async () => {
    const { default: NewPlanPage } = await import('./page');
    render(withProviders(<NewPlanPage />));

    await fillDatosAndAdvance();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/Ciclo de facturación/i));
    await user.click(await screen.findByRole('option', { name: /Pack de clases/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/duración en días/i);
    expect(screen.queryByRole('button', { name: /Crear plan/i })).not.toBeInTheDocument();
  });

  it('flujo completo: crea el plan con Idempotency-Key y muestra el cierre', async () => {
    createPlanMock.mockResolvedValueOnce(createdPlan());
    const { default: NewPlanPage } = await import('./page');
    render(withProviders(<NewPlanPage />));

    // Paso 1: nombre + actividad + sede.
    fireEvent.change(await screen.findByLabelText(/^Nombre\b/i), { target: { value: 'Funcional 3x' } });
    fireEvent.click(await screen.findByText('Funcional'));
    fireEvent.click(screen.getByText('Centro'));
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));

    // Paso 2: defaults (Mensual) + clases incluidas.
    fireEvent.change(await screen.findByLabelText(/Clases incluidas/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));

    // Paso 3: precio y crear.
    fireEvent.change(await screen.findByLabelText(/^Precio\b/i), { target: { value: '24000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear plan/i }));

    await waitFor(() => expect(createPlanMock).toHaveBeenCalledTimes(1));
    const [payload, idempotencyKey] = createPlanMock.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toMatchObject({
      name: 'Funcional 3x',
      billingCycle: 'MONTHLY',
      classesIncluded: 12,
      activityIds: ['a1'],
      branchIds: ['b1'],
    });
    expect(payload).not.toHaveProperty('durationDays');
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);

    await waitFor(() => expect(screen.getByText('El plan quedó disponible')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Ver planes/i })).toHaveAttribute('href', '/plans');
  });

  it('sin precio no crea y muestra el error', async () => {
    const { default: NewPlanPage } = await import('./page');
    render(withProviders(<NewPlanPage />));

    await fillDatosAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));

    fireEvent.click(await screen.findByRole('button', { name: /Crear plan/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Ingresá un precio/i);
    expect(createPlanMock).not.toHaveBeenCalled();
  });

  it('doble click en "Crear plan" no dispara dos mutations', async () => {
    createPlanMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: NewPlanPage } = await import('./page');
    render(withProviders(<NewPlanPage />));

    await fillDatosAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));

    fireEvent.change(await screen.findByLabelText(/^Precio\b/i), { target: { value: '24000.00' } });
    const create = screen.getByRole('button', { name: /Crear plan/i });
    fireEvent.click(create);
    fireEvent.click(create);
    fireEvent.click(create);

    await waitFor(() => expect(createPlanMock).toHaveBeenCalledTimes(1));
  });

  it('ante error del backend muestra el detail y permite reintentar', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    createPlanMock.mockRejectedValueOnce(
      new ApiError({ type: 'about:blank', code: 'CONFLICT', title: 'Conflicto', status: 409, detail: 'Ya existe un plan con ese nombre.' }),
    );
    const { default: NewPlanPage } = await import('./page');
    render(withProviders(<NewPlanPage />));

    await fillDatosAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));
    fireEvent.change(await screen.findByLabelText(/^Precio\b/i), { target: { value: '24000.00' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear plan/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Ya existe un plan con ese nombre\./i);

    createPlanMock.mockResolvedValueOnce(createdPlan());
    fireEvent.click(screen.getByRole('button', { name: /Crear plan/i }));
    await waitFor(() => expect(screen.getByText('El plan quedó disponible')).toBeInTheDocument());
    expect(createPlanMock).toHaveBeenCalledTimes(2);
  });
});
