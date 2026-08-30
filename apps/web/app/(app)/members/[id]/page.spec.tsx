import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { MemberDetail } from '@pulso/contracts/members';
import type { Membership } from '@pulso/contracts/memberships';
import type { Plan } from '@pulso/contracts/catalog';
import type { Branch } from '@pulso/contracts/tenancy';

/**
 * Ficha de socio (T-M3-3 + tab Membresías de M4). El documento enmascarado es
 * responsabilidad del backend (ADR-018): este componente lo muestra tal cual
 * lo recibe y no intenta re-enmascararlo.
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/members/abc',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: '00000000-0000-0000-0000-000000000abc' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const getMemberMock = vi.fn();
const getMemberLedgerMock = vi.fn();
const updateMemberMock = vi.fn();
const deactivateMemberMock = vi.fn();
vi.mock('@/lib/api/members', () => ({
  getMember: (...args: unknown[]) => getMemberMock(...args),
  getMemberLedger: (...args: unknown[]) => getMemberLedgerMock(...args),
  updateMember: (...args: unknown[]) => updateMemberMock(...args),
  deactivateMember: (...args: unknown[]) => deactivateMemberMock(...args),
}));

const listMemberMembershipsMock = vi.fn();
const createMembershipMock = vi.fn();
const cancelMembershipMock = vi.fn();
vi.mock('@/lib/api/memberships', () => ({
  listMemberMemberships: (...args: unknown[]) => listMemberMembershipsMock(...args),
  createMembership: (...args: unknown[]) => createMembershipMock(...args),
  cancelMembership: (...args: unknown[]) => cancelMembershipMock(...args),
}));

const listPlansMock = vi.fn();
vi.mock('@/lib/api/catalog', () => ({
  listPlans: (...args: unknown[]) => listPlansMock(...args),
  listActivities: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
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

function makeMember(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    id: '00000000-0000-0000-0000-000000000abc',
    gymId: 'g1',
    memberNumber: 42,
    firstName: 'Lucía',
    lastName: 'Pérez',
    documentType: 'DNI',
    // NOTA: el backend puede devolver el número enmascarado en `documentNumber`
    // si el usuario no tiene `member:read_document`. La UI lo muestra tal cual.
    documentNumber: '•••••456',
    email: 'lu@example.com',
    phone: '+541155551234',
    birthDate: '1995-05-20',
    gender: null,
    address: null,
    cardCode: null,
    photoKey: null,
    status: 'ACTIVE',
    branchId: 'b1',
    balance: '0.00',
    medicalClearanceUntil: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    recentMemberships: [],
    recentPayments: [],
    recentAttendances: [],
    ...overrides,
  };
}

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: '00000000-0000-0000-0000-000000000101',
    gymId: 'g1',
    name: 'Mensual full',
    description: null,
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

function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: '00000000-0000-0000-0000-000000000m01',
    gymId: 'g1',
    memberId: '00000000-0000-0000-0000-000000000abc',
    planId: '00000000-0000-0000-0000-000000000101',
    branchId: 'b1',
    status: 'ACTIVE',
    startDate: '2026-08-01',
    endDate: '2026-08-30',
    pricePaid: '25000.00',
    classesIncluded: null,
    classesRemaining: null,
    cancelledAt: null,
    cancelledReason: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

async function primeSession(
  permissions: string[] = [
    'member:read',
    'member:write',
    'member:delete',
    'membership:write',
    'membership:delete',
    'plan:read',
    'config:read',
  ],
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

beforeEach(async () => {
  routerPush.mockReset();
  getMemberMock.mockReset();
  getMemberLedgerMock.mockReset();
  updateMemberMock.mockReset();
  deactivateMemberMock.mockReset();
  listMemberMembershipsMock.mockReset();
  createMembershipMock.mockReset();
  cancelMembershipMock.mockReset();
  listPlansMock.mockReset();
  listBranchesMock.mockReset();
  getMemberLedgerMock.mockResolvedValue({ entries: [], balance: '0.00' });
  listMemberMembershipsMock.mockResolvedValue({ data: [] });
  listPlansMock.mockResolvedValue({ data: [makePlan()] });
  listBranchesMock.mockResolvedValue({ data: [makeBranch()] });
});

describe('MemberDetailPage', () => {
  it('render feliz muestra la ficha del socio con el resumen', async () => {
    await primeSession();
    getMemberMock.mockResolvedValueOnce(makeMember());
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText('Pérez, Lucía')).toBeInTheDocument());
    expect(screen.getByText(/Socio #42/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Cuenta corriente/i })).toBeInTheDocument();
  });

  it('empty en la cuenta corriente: sin entradas muestra el mensaje de "sin movimientos"', async () => {
    await primeSession();
    getMemberMock.mockResolvedValueOnce(makeMember());
    getMemberLedgerMock.mockResolvedValueOnce({ entries: [], balance: '0.00' });
    const user = userEvent.setup();
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText('Pérez, Lucía')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Cuenta corriente/i }));
    await waitFor(() =>
      expect(screen.getByText(/Todavía no hay movimientos/i)).toBeInTheDocument(),
    );
  });

  it('loading muestra el skeleton mientras la query está en vuelo', async () => {
    await primeSession();
    getMemberMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: MemberDetailPage } = await import('./page');
    const { container } = render(withQuery(<MemberDetailPage />));
    // Los Skeletons no exponen role; alcanza con verificar que aún NO se
    // pintó ni el nombre ni el número del socio.
    expect(container.textContent ?? '').not.toContain('Pérez');
  });

  it('ante error 500 muestra alert con reintento', async () => {
    await primeSession();
    const { ApiError } = await import('@/lib/api/errors');
    getMemberMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'INTERNAL_ERROR',
        title: 'Error',
        status: 500,
        detail: 'La base explotó',
      }),
    );
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/La base explotó/);

    getMemberMock.mockResolvedValueOnce(makeMember());
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    await waitFor(() => expect(getMemberMock).toHaveBeenCalledTimes(2));
  });

  it('documento enmascarado: se muestra EXACTAMENTE lo que envía el backend (no se re-enmascara acá)', async () => {
    await primeSession();
    // El backend puede devolver el documento visible ("20123456") si el usuario
    // tiene member:read_document, o enmascarado ("•••••456") si no. La UI
    // muestra el valor tal cual: no hace lógica de masking.
    getMemberMock.mockResolvedValueOnce(makeMember({ documentNumber: '20123456' }));
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText(/DNI 20123456/)).toBeInTheDocument());
    expect(screen.queryByText(/•••••456/)).not.toBeInTheDocument();
  });

  it('tab Membresías: lista las membresías del socio con el nombre del plan', async () => {
    await primeSession();
    getMemberMock.mockResolvedValueOnce(makeMember());
    listMemberMembershipsMock.mockResolvedValueOnce({
      data: [makeMembership()],
    });
    const user = userEvent.setup();
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText('Pérez, Lucía')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Membresías/i }));

    await waitFor(() => expect(listMemberMembershipsMock).toHaveBeenCalled());
    expect(await screen.findByText('Mensual full')).toBeInTheDocument();
    expect(screen.getByText('Activa')).toBeInTheDocument();
    expect(screen.getByText(/2026-08-01 → 2026-08-30/)).toBeInTheDocument();
  });

  it('tab Membresías: Cancel exige motivo mínimo de 5 caracteres y llama al endpoint', async () => {
    await primeSession();
    getMemberMock.mockResolvedValueOnce(makeMember());
    listMemberMembershipsMock.mockResolvedValueOnce({ data: [makeMembership()] });
    cancelMembershipMock.mockResolvedValueOnce({
      ...makeMembership({ status: 'CANCELLED', cancelledReason: 'baja voluntaria' }),
    });
    const user = userEvent.setup();
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText('Pérez, Lucía')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Membresías/i }));
    await waitFor(() => expect(screen.getByText('Mensual full')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^Cancelar$/i }));

    // El botón "Cancelar membresía" del diálogo queda disabled con motivo corto.
    const confirmBtn = await screen.findByRole('button', { name: /Cancelar membresía/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Motivo/i), {
      target: { value: 'baja voluntaria' },
    });
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());

    fireEvent.click(confirmBtn);

    await waitFor(() => expect(cancelMembershipMock).toHaveBeenCalledTimes(1));
    expect(cancelMembershipMock).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000m01', {
      reason: 'baja voluntaria',
    });
  });

  it('tab Membresías: alta en modo DEBT arma el payload con charge.mode = "DEBT" e Idempotency-Key', async () => {
    await primeSession();
    getMemberMock.mockResolvedValueOnce(makeMember());
    listMemberMembershipsMock.mockResolvedValueOnce({ data: [] });
    createMembershipMock.mockResolvedValueOnce({
      membership: makeMembership(),
      ledgerEntry: {
        id: 'le1',
        memberId: '00000000-0000-0000-0000-000000000abc',
        type: 'DEBIT',
        reason: 'MEMBERSHIP_CHARGE',
        amount: '25000.00',
        balanceAfter: '25000.00',
        description: 'Alta de membresía: Mensual full',
        membershipId: '00000000-0000-0000-0000-000000000m01',
        cashMovementId: null,
        reversalOfId: null,
        createdAt: '2026-08-01T12:00:00.000Z',
      },
    });
    const user = userEvent.setup();
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText('Pérez, Lucía')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Membresías/i }));

    // Con el listado vacío hay DOS botones "Asignar membresía": el del header
    // y el del emptyAction del DataTable. Clickeo el del header (el primero),
    // que es lo que ve un usuario cuando además ya conoce dónde vive el CTA
    // principal en el shell.
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /Asignar membresía/i }).length).toBeGreaterThan(
        0,
      ),
    );
    const openBtn = screen.getAllByRole('button', { name: /Asignar membresía/i })[0]!;
    fireEvent.click(openBtn);

    // Elegir plan y sede. Radix Select se abre con click en el trigger.
    // Labels reales: "Plan *" y "Sede *" — el asterisco de `required` es
    // parte del text content del <label> a efectos de accessible name.
    await waitFor(() => expect(listPlansMock).toHaveBeenCalled());
    const planTrigger = screen.getByLabelText(/^Plan\b/i);
    await user.click(planTrigger);
    await user.click(await screen.findByRole('option', { name: /Mensual full/i }));

    const branchTrigger = screen.getByLabelText(/^Sede\b/i);
    await user.click(branchTrigger);
    await user.click(await screen.findByRole('option', { name: /Centro/i }));

    // Envía el formulario.
    fireEvent.click(screen.getByRole('button', { name: /^Asignar$/i }));

    await waitFor(() => expect(createMembershipMock).toHaveBeenCalledTimes(1));
    const [memberId, payload, idempotencyKey] = createMembershipMock.mock.calls[0] as [
      string,
      Record<string, unknown>,
      string,
    ];
    expect(memberId).toBe('00000000-0000-0000-0000-000000000abc');
    expect(payload).toMatchObject({
      planId: '00000000-0000-0000-0000-000000000101',
      branchId: 'b1',
      charge: { mode: 'DEBT' },
    });
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
