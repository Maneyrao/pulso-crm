import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { Activity, Plan } from '@pulso/contracts/catalog';
import type { Branch } from '@pulso/contracts/tenancy';

/**
 * Catálogo › Planes (T-M4-2). Cubre render feliz con billingCycle traducido,
 * creación con selección de actividades/sedes, y el 409 PLAN_IN_USE del soft
 * delete.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/plans',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const listPlansMock = vi.fn();
const createPlanMock = vi.fn();
const updatePlanMock = vi.fn();
const deletePlanMock = vi.fn();
const listActivitiesMock = vi.fn();

vi.mock('@/lib/api/catalog', () => ({
  listPlans: (...args: unknown[]) => listPlansMock(...args),
  createPlan: (...args: unknown[]) => createPlanMock(...args),
  updatePlan: (...args: unknown[]) => updatePlanMock(...args),
  deletePlan: (...args: unknown[]) => deletePlanMock(...args),
  listActivities: (...args: unknown[]) => listActivitiesMock(...args),
  createActivity: vi.fn(),
  updateActivity: vi.fn(),
}));

const listBranchesMock = vi.fn();
vi.mock('@/lib/api/tenancy', () => ({
  listBranches: (...args: unknown[]) => listBranchesMock(...args),
  getGym: vi.fn(),
  updateGym: vi.fn(),
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
  deactivateBranch: vi.fn(),
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
  permissions: string[] = ['plan:read', 'plan:write', 'config:read'],
): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: {
      id: 'u',
      firstName: 'Ana',
      lastName: 'Test',
      email: 'a@t.com',
      mustChangePassword: false,
    },
    gym: { id: 'g1', name: 'Demo', slug: 'demo', country: 'AR', currency: 'ARS', features: [] },
    branches: [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions,
    status: 'authenticated',
  } as never);
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: '00000000-0000-0000-0000-000000000101',
    gymId: 'g1',
    name: 'Mensual full',
    description: 'Todas las actividades.',
    price: '25000.00',
    billingCycle: 'MONTHLY',
    durationDays: null,
    classesIncluded: null,
    weeklyAccessLimit: null,
    isActive: true,
    activityIds: [],
    branchIds: [],
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: '00000000-0000-0000-0000-0000000000a1',
    gymId: 'g1',
    name: 'Musculación',
    description: null,
    color: null,
    isActive: true,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'b1',
    gymId: 'g1',
    name: 'Centro',
    timezone: 'America/Argentina/Buenos_Aires',
    address: null,
    phone: null,
    isActive: true,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  listPlansMock.mockReset();
  createPlanMock.mockReset();
  updatePlanMock.mockReset();
  deletePlanMock.mockReset();
  listActivitiesMock.mockReset();
  listBranchesMock.mockReset();
  listActivitiesMock.mockResolvedValue({ data: [makeActivity()] });
  listBranchesMock.mockResolvedValue({ data: [makeBranch()] });
  await primeSession();
});

describe('PlansPage', () => {
  it('render feliz traduce el ciclo de facturación a texto legible', async () => {
    listPlansMock.mockResolvedValueOnce({
      data: [
        makePlan({ billingCycle: 'MONTHLY' }),
        makePlan({
          id: '00000000-0000-0000-0000-000000000102',
          name: 'Pack 10 clases',
          billingCycle: 'CLASS_PACK',
          classesIncluded: 10,
          durationDays: 60,
        }),
      ],
    });
    const { default: PlansPage } = await import('./page');
    render(withQuery(<PlansPage />));

    await waitFor(() => expect(screen.getByText('Mensual full')).toBeInTheDocument());
    expect(screen.getByText('Mensual')).toBeInTheDocument();
    expect(screen.getByText('Pack de clases')).toBeInTheDocument();
    expect(screen.getByText('Libre')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('crear plan envía los activityIds y branchIds seleccionados con Idempotency-Key', async () => {
    listPlansMock.mockResolvedValue({ data: [] });
    createPlanMock.mockResolvedValueOnce(makePlan());
    const { default: PlansPage } = await import('./page');
    render(withQuery(<PlansPage />));

    await waitFor(() => expect(screen.getByText(/Todavía no hay planes/i)).toBeInTheDocument());
    // El listado de actividades del modal debe estar cargado antes de abrirlo.
    await waitFor(() => expect(listActivitiesMock).toHaveBeenCalled());
    await waitFor(() => expect(listBranchesMock).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: /Nuevo plan/i })[0]!);

    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Bimestral' } });
    // MoneyInput acepta strings decimales sin el 0 padding hasta el blur.
    // El label real es "Precio *" (FormField required agrega un asterisco);
    // aria-hidden en el asterisco no lo excluye del text content del <label>
    // cuando testing-library computa el accessible name para getByLabelText.
    const priceInput = screen.getByLabelText(/Precio/i) as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: '18000' } });
    fireEvent.blur(priceInput);

    // Marca la actividad y la sede.
    fireEvent.click(screen.getByLabelText(/Musculación/i));
    fireEvent.click(screen.getByLabelText(/Centro/i));

    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));

    await waitFor(() => expect(createPlanMock).toHaveBeenCalledTimes(1));
    const [payload, idempotencyKey] = createPlanMock.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    expect(payload).toMatchObject({
      name: 'Bimestral',
      price: '18000.00',
      billingCycle: 'MONTHLY',
      activityIds: ['00000000-0000-0000-0000-0000000000a1'],
      branchIds: ['b1'],
    });
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('delete que responde 409 PLAN_IN_USE muestra el detail como toast', async () => {
    listPlansMock.mockResolvedValueOnce({ data: [makePlan()] });
    const { ApiError } = await import('@/lib/api/errors');
    deletePlanMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'PLAN_IN_USE',
        title: 'Conflicto',
        status: 409,
        detail: 'El plan tiene membresías activas.',
      }),
    );
    const { default: PlansPage } = await import('./page');
    render(withQuery(<PlansPage />));

    await waitFor(() => expect(screen.getByText('Mensual full')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Desactivar/i }));

    // Confirma en el ConfirmDialog (segundo botón "Desactivar", dentro del diálogo).
    const confirmButtons = await screen.findAllByRole('button', { name: /Desactivar/i });
    // El botón de la fila desaparece por el open del dialog; queda al menos el del diálogo.
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(deletePlanMock).toHaveBeenCalledTimes(1));
    // El detail del backend aparece en pantalla (via el toast).
    expect(await screen.findByText(/El plan tiene membresías activas/i)).toBeInTheDocument();
  });
});
