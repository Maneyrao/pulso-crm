import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Dashboard (LEODARROSAFIT_ALIGNMENT_PLAN.md Fase 2A): KPIs reales + afluencia
 * por hora + últimos accesos + deudores + caja de hoy, cada tarjeta filtrada
 * por su propio permiso. Todo dato viene de la API (nada mock): acá se
 * mockean los clientes HTTP.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const listDebtorsMock = vi.fn();
vi.mock('@/lib/api/members', () => ({
  listDebtors: (...args: unknown[]) => listDebtorsMock(...args),
}));

const getDashboardMock = vi.fn();
vi.mock('@/lib/api/reporting', () => ({
  getDashboard: (...args: unknown[]) => getDashboardMock(...args),
}));

const listAccessAttemptsMock = vi.fn();
const listAttendancesMock = vi.fn();
vi.mock('@/lib/api/access', () => ({
  listAccessAttempts: (...args: unknown[]) => listAccessAttemptsMock(...args),
  listAttendances: (...args: unknown[]) => listAttendancesMock(...args),
}));

const getCurrentCashSessionMock = vi.fn();
const getDaybookMock = vi.fn();
const listCashConceptsMock = vi.fn();
vi.mock('@/lib/api/cash', () => ({
  getCurrentCashSession: (...args: unknown[]) => getCurrentCashSessionMock(...args),
  getDaybook: (...args: unknown[]) => getDaybookMock(...args),
  listCashConcepts: (...args: unknown[]) => listCashConceptsMock(...args),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function primeSession(permissions: string[]): Promise<void> {
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
    branches: [{ id: 'b1', name: 'Sede Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions,
    status: 'authenticated',
  } as never);
}

const pageInfo = (total: number) => ({ total, limit: 5, offset: 0 });
const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

beforeEach(() => {
  vi.clearAllMocks();

  listDebtorsMock.mockResolvedValue({
    data: [
      {
        id: 'm1',
        memberNumber: 1,
        firstName: 'Carla',
        lastName: 'Suárez',
        documentMasked: '30***123',
        phone: null,
        status: 'ACTIVE',
        branch: null,
        activeMembership: null,
        balance: '-15000.00',
        photoUrl: null,
        debtSince: '2026-07-01',
      },
    ],
    pageInfo: pageInfo(7),
  });

  getDashboardMock.mockResolvedValue({
    activeMembers: 120,
    newMembersThisMonth: 5,
    todayIncome: '120000.00',
    todayAttendances: 31,
    totalDebt: '-90000.00',
    expiringMembershipsNext7Days: 4,
    timezoneUsed: 'America/Argentina/Buenos_Aires',
  });

  listAccessAttemptsMock.mockResolvedValue({
    data: [
      {
        id: 'a1',
        branchId: 'b1',
        memberId: 'm1',
        method: 'DOCUMENT',
        rawInputMasked: '30***123',
        decision: 'ALLOWED',
        reasonCode: 'OK',
        detail: null,
        matchScore: null,
        attendanceId: 'att1',
        occurredAt: new Date().toISOString(),
      },
    ],
    pageInfo: pageInfo(1),
  });

  listAttendancesMock.mockResolvedValue({ data: [], pageInfo: pageInfo(0) });

  getCurrentCashSessionMock.mockResolvedValue({
    id: 'cs1',
    gymId: 'g1',
    branchId: 'b1',
    cashRegisterId: 'cr1',
    status: 'OPEN',
    openedByUserId: 'u',
    openedAt: '2026-08-20T12:00:00.000Z',
    openingAmount: '5000.00',
    openingNotes: null,
    closedByUserId: null,
    closedAt: null,
    closingNotes: null,
    expectedCash: null,
    declaredCash: null,
    cashDifference: null,
    businessDate: today,
  });

  getDaybookMock.mockResolvedValue({
    data: [{ businessDate: today, sessions: [], movements: [], totalsByMethod: [] }],
    timezoneUsed: 'America/Argentina/Buenos_Aires',
  });

  listCashConceptsMock.mockResolvedValue({ data: [] });
});

describe('DashboardPage', () => {
  it('muestra el título, la sede activa, KPIs y deudores con link a la ficha', async () => {
    await primeSession(['member:read', 'stats:read', 'cash:read']);
    const { default: Page } = await import('./page');
    render(withQuery(<Page />));

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    // Sede activa + estado de caja (sesión abierta en el mock de arriba).
    expect(await screen.findByText(/Sede Centro · caja abierta desde/)).toBeInTheDocument();

    expect(await screen.findByText('Ingresos hoy')).toBeInTheDocument();
    expect(screen.getByText('Suárez, Carla')).toBeInTheDocument();
    const memberLink = screen.getByText('Suárez, Carla').closest('a');
    expect(memberLink).toHaveAttribute('href', '/members/m1?tab=cuenta');
  });

  it('caja cerrada muestra el sufijo correspondiente', async () => {
    getCurrentCashSessionMock.mockResolvedValue(null);
    await primeSession(['cash:read']);
    const { default: Page } = await import('./page');
    render(withQuery(<Page />));

    expect(await screen.findByText(/Sede Centro · caja cerrada/)).toBeInTheDocument();
  });

  it('con access:read_history muestra últimos accesos con link a /access', async () => {
    await primeSession(['access:read_history']);
    const { default: Page } = await import('./page');
    render(withQuery(<Page />));

    expect(await screen.findByText('30***123')).toBeInTheDocument();
    expect(screen.getByText('Últimos accesos')).toBeInTheDocument();
    const link = screen.getByText('Ver acceso →').closest('a');
    expect(link).toHaveAttribute('href', '/access');
  });

  it('sin ningún permiso relevante muestra el aviso y no llama a la API', async () => {
    await primeSession([]);
    const { default: Page } = await import('./page');
    render(withQuery(<Page />));

    expect(
      screen.getByText('Tu usuario no tiene permisos para ver indicadores en esta pantalla.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Ingresos hoy')).not.toBeInTheDocument();
    expect(getDashboardMock).not.toHaveBeenCalled();
    expect(listDebtorsMock).not.toHaveBeenCalled();
  });
});
