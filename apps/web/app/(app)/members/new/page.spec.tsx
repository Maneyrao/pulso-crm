import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { Plan } from '@pulso/contracts/catalog';
import type { CreateMembershipResponse } from '@pulso/contracts/memberships';

/**
 * Alta de socio (Fase 2B): wizard de 3 pasos que compone `POST /members` →
 * `POST /members/:id/memberships` (con `charge` embebido — el backend crea
 * el `CashMovement` atómicamente cuando `mode: 'NOW'`). Foco de estos tests:
 * disciplina de la composición (el socio nunca se re-crea si falla un paso
 * siguiente), idempotencia, y los tres desenlaces del paso de pago (sin
 * plan, sin caja abierta, con caja abierta).
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

const createMembershipMock = vi.fn();
vi.mock('@/lib/api/memberships', () => ({
  createMembership: (...args: unknown[]) => createMembershipMock(...args),
}));

const listPlansMock = vi.fn();
vi.mock('@/lib/api/catalog', () => ({
  listPlans: (...args: unknown[]) => listPlansMock(...args),
}));

const listBranchesMock = vi.fn();
vi.mock('@/lib/api/tenancy', () => ({
  listBranches: (...args: unknown[]) => listBranchesMock(...args),
}));

const getCurrentCashSessionMock = vi.fn();
const listPaymentMethodsMock = vi.fn();
vi.mock('@/lib/api/cash', () => ({
  getCurrentCashSession: (...args: unknown[]) => getCurrentCashSessionMock(...args),
  listPaymentMethods: (...args: unknown[]) => listPaymentMethodsMock(...args),
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

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    gymId: 'g1',
    name: 'Mensual',
    description: null,
    price: '20000.00',
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

const CREATED_MEMBER = {
  id: 'm1',
  gymId: 'g1',
  memberNumber: 1,
  firstName: 'Lucía',
  lastName: 'Pérez',
  documentType: 'DNI' as const,
  documentNumber: '20123456',
  email: null,
  phone: null,
  birthDate: null,
  gender: null,
  address: null,
  cardCode: null,
  photoKey: null,
  status: 'ACTIVE' as const,
  branchId: 'b1',
  balance: '0.00',
  medicalClearanceUntil: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  notes: null,
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
};

function membershipResponse(overrides: Partial<CreateMembershipResponse> = {}): CreateMembershipResponse {
  return {
    membership: {
      id: 'ms1',
      gymId: 'g1',
      memberId: 'm1',
      planId: 'p1',
      branchId: 'b1',
      status: 'ACTIVE',
      startDate: '2026-08-20',
      endDate: '2026-09-20',
      pricePaid: '20000.00',
      classesIncluded: null,
      classesRemaining: null,
      cancelledAt: null,
      cancelledReason: null,
      createdAt: '2026-08-20T12:00:00.000Z',
      updatedAt: '2026-08-20T12:00:00.000Z',
    },
    ledgerEntry: {
      id: 'led1',
      memberId: 'm1',
      type: 'DEBIT',
      reason: 'MEMBERSHIP_CHARGE',
      amount: '20000.00',
      balanceAfter: '-20000.00',
      description: null,
      membershipId: 'ms1',
      cashMovementId: null,
      reversalOfId: null,
      createdAt: '2026-08-20T12:00:00.000Z',
    },
    ...overrides,
  };
}

/** Radix Select: se abre con click en el trigger (labelizado) y se elige la option del listbox. */
async function selectPlan(name: RegExp = /Mensual/i): Promise<void> {
  const user = userEvent.setup();
  // findBy: el paso muestra "Cargando planes y sedes…" hasta que resuelve la query de planes.
  await user.click(await screen.findByLabelText(/^Plan\b/i));
  await user.click(await screen.findByRole('option', { name }));
}

async function fillPersonalStep(): Promise<void> {
  fireEvent.change(screen.getByLabelText(/Número de documento/i), { target: { value: '20123456' } });
  // /^Nombre\b/: el label real es "Nombre *" (asterisco de `required` en el text content).
  fireEvent.change(screen.getByLabelText(/^Nombre\b/i), { target: { value: 'Lucía' } });
  fireEvent.change(screen.getByLabelText(/Apellido/i), { target: { value: 'Pérez' } });
}

beforeEach(async () => {
  routerPush.mockReset();
  createMemberMock.mockReset();
  createMembershipMock.mockReset();
  listPlansMock.mockReset();
  listBranchesMock.mockReset();
  getCurrentCashSessionMock.mockReset();
  listPaymentMethodsMock.mockReset();

  listPlansMock.mockResolvedValue({ data: [makePlan()] });
  listBranchesMock.mockResolvedValue({ data: [{ id: 'b1', gymId: 'g1', name: 'Centro', timezone: 'tz', address: null, phone: null, isActive: true, createdAt: '', updatedAt: '' }] });
  getCurrentCashSessionMock.mockResolvedValue(null);
  listPaymentMethodsMock.mockResolvedValue({ data: [] });

  await primeSession();
});

describe('NewMemberPage', () => {
  it('paso 1: crea el socio con Idempotency-Key y avanza al paso de plan', async () => {
    createMemberMock.mockResolvedValueOnce(CREATED_MEMBER);
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    expect(screen.getByRole('heading', { name: /Nuevo socio/i })).toBeInTheDocument();
    await fillPersonalStep();
    fireEvent.click(screen.getByRole('button', { name: /Crear socio y continuar/i }));

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
    const [payload, idempotencyKey] = createMemberMock.mock.calls[0] as [Record<string, unknown>, string];
    expect(payload).toMatchObject({ firstName: 'Lucía', lastName: 'Pérez', documentNumber: '20123456', branchId: 'b1' });
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);

    await waitFor(() => expect(screen.getByText(/Plan y membresía/i)).toBeInTheDocument());
  });

  it('vacío en el paso 1 muestra los alerts de validación y no crea el socio', async () => {
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    fireEvent.click(screen.getByRole('button', { name: /Crear socio y continuar/i }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(createMemberMock).not.toHaveBeenCalled();
  });

  it('doble click en "Crear socio y continuar" no dispara dos mutations', async () => {
    createMemberMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await fillPersonalStep();
    const submit = screen.getByRole('button', { name: /Crear socio y continuar/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(createMemberMock).toHaveBeenCalledTimes(1));
  });

  it('ante error del backend en el paso 1 muestra el detail y no navega', async () => {
    const { ApiError } = await import('@/lib/api/errors');
    createMemberMock.mockRejectedValueOnce(
      new ApiError({ type: 'about:blank', code: 'DUPLICATE_DOCUMENT', title: 'Conflicto', status: 409, detail: 'Ya existe un socio con ese documento.' }),
    );
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await fillPersonalStep();
    fireEvent.click(screen.getByRole('button', { name: /Crear socio y continuar/i }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Ya existe un socio con ese documento\./i)).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('omitir el plan cierra el alta sin crear membresía', async () => {
    createMemberMock.mockResolvedValueOnce(CREATED_MEMBER);
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await fillPersonalStep();
    fireEvent.click(screen.getByRole('button', { name: /Crear socio y continuar/i }));
    await screen.findByText(/Plan y membresía/i);

    fireEvent.click(screen.getByRole('button', { name: /Omitir plan y finalizar/i }));

    await waitFor(() => expect(screen.getByText('El socio quedó activo')).toBeInTheDocument());
    expect(screen.getByText(/No se asignó ninguna/i)).toBeInTheDocument();
    expect(createMembershipMock).not.toHaveBeenCalled();
  });

  it('con plan pero sin caja abierta: finaliza con charge.mode DEBT (queda pendiente)', async () => {
    createMemberMock.mockResolvedValueOnce(CREATED_MEMBER);
    createMembershipMock.mockResolvedValueOnce(membershipResponse());
    getCurrentCashSessionMock.mockResolvedValue(null);
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await fillPersonalStep();
    fireEvent.click(screen.getByRole('button', { name: /Crear socio y continuar/i }));
    await screen.findByText(/Plan y membresía/i);

    await selectPlan();
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));

    await screen.findByText(/No hay una caja abierta/i);
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));

    await waitFor(() => expect(createMembershipMock).toHaveBeenCalledTimes(1));
    const [memberId, payload] = createMembershipMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(memberId).toBe('m1');
    expect(payload).toMatchObject({ planId: 'p1', charge: { mode: 'DEBT' } });

    await waitFor(() => expect(screen.getByText('El socio quedó activo')).toBeInTheDocument());
    expect(screen.getByText(/No — queda como saldo pendiente/i)).toBeInTheDocument();
  });

  it('con plan y caja abierta: cobra ahora con charge.mode NOW y el método elegido', async () => {
    createMemberMock.mockResolvedValueOnce(CREATED_MEMBER);
    createMembershipMock.mockResolvedValueOnce(
      membershipResponse({
        cashMovement: {
          id: 'cm1',
          gymId: 'g1',
          cashSessionId: 'cs1',
          type: 'INCOME',
          amount: '20000.00',
          paymentMethodId: 'pm1',
          cashConceptId: 'cc1',
          description: null,
          memberId: 'm1',
          membershipId: 'ms1',
          reversalOfId: null,
          isReversed: false,
          reversalReason: null,
          createdByUserId: 'u',
          createdAt: '2026-08-20T12:00:00.000Z',
        },
      }),
    );
    getCurrentCashSessionMock.mockResolvedValue({
      id: 'cs1',
      gymId: 'g1',
      branchId: 'b1',
      cashRegisterId: 'cr1',
      status: 'OPEN',
      openedByUserId: 'u',
      openedAt: '2026-08-20T10:00:00.000Z',
      openingAmount: '0.00',
      openingNotes: null,
      closedByUserId: null,
      closedAt: null,
      closingNotes: null,
      expectedCash: null,
      declaredCash: null,
      cashDifference: null,
      businessDate: '2026-08-20',
    });
    listPaymentMethodsMock.mockResolvedValue({
      data: [{ id: 'pm1', gymId: 'g1', code: 'CASH', name: 'Efectivo', countsAsCash: true, isActive: true, sortOrder: 0 }],
    });

    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await fillPersonalStep();
    fireEvent.click(screen.getByRole('button', { name: /Crear socio y continuar/i }));
    await screen.findByText(/Plan y membresía/i);

    await selectPlan();
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));

    const user = userEvent.setup();
    await user.click(await screen.findByLabelText(/Método de pago/i));
    await user.click(await screen.findByRole('option', { name: /Efectivo/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar y cobrar/i }));

    await waitFor(() => expect(createMembershipMock).toHaveBeenCalledTimes(1));
    const [, payload] = createMembershipMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload).toMatchObject({ planId: 'p1', charge: { mode: 'NOW', paymentMethodId: 'pm1', amount: '20000.00' } });

    await waitFor(() => expect(screen.getByText('El socio quedó activo')).toBeInTheDocument());
    // Dos filas con "Sí —": membresía activa y pago cobrado. La ausencia del texto de deuda
    // confirma que el resumen refleja el cobro NOW.
    expect(screen.getAllByText(/Sí —/i)).toHaveLength(2);
    expect(screen.queryByText(/queda como saldo pendiente/i)).not.toBeInTheDocument();
  });

  it('si la membresía falla, el socio no se vuelve a crear al reintentar', async () => {
    createMemberMock.mockResolvedValueOnce(CREATED_MEMBER);
    const { ApiError } = await import('@/lib/api/errors');
    createMembershipMock.mockRejectedValueOnce(
      new ApiError({ type: 'about:blank', code: 'INTERNAL_ERROR', title: 'Error', status: 500, detail: 'La membresía explotó.' }),
    );
    getCurrentCashSessionMock.mockResolvedValue(null);
    const { default: NewMemberPage } = await import('./page');
    render(withQuery(<NewMemberPage />));

    await fillPersonalStep();
    fireEvent.click(screen.getByRole('button', { name: /Crear socio y continuar/i }));
    await screen.findByText(/Plan y membresía/i);

    await selectPlan();
    fireEvent.click(screen.getByRole('button', { name: /^Siguiente$/i }));
    await screen.findByText(/No hay una caja abierta/i);

    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));
    await screen.findByText(/La membresía explotó\./i);

    // Reintentar: el socio NO se vuelve a crear.
    createMembershipMock.mockResolvedValueOnce(membershipResponse());
    fireEvent.click(screen.getByRole('button', { name: /Confirmar/i }));

    await waitFor(() => expect(createMembershipMock).toHaveBeenCalledTimes(2));
    expect(createMemberMock).toHaveBeenCalledTimes(1);
  });
});
