import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Dashboard: KPIs reales + panel de deudores principales + accesos rápidos
 * filtrados por permiso + tarjeta del asistente. Todo dato viene de la API
 * (nada mock): acá se mockean los clientes HTTP.
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

const listMembersMock = vi.fn();
const listDebtorsMock = vi.fn();
vi.mock('@/lib/api/members', () => ({
  listMembers: (...args: unknown[]) => listMembersMock(...args),
  listDebtors: (...args: unknown[]) => listDebtorsMock(...args),
}));

const getDashboardMock = vi.fn();
vi.mock('@/lib/api/reporting', () => ({
  getDashboard: (...args: unknown[]) => getDashboardMock(...args),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function primeSession(permissions: string[]): Promise<void> {
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

const pageInfo = (total: number) => ({ total, limit: 5, offset: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  listMembersMock.mockResolvedValue({ data: [], pageInfo: pageInfo(42) });
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
    todayIncome: '120000.00',
    todayExpense: '0.00',
    todayAttendances: 31,
    totalDebt: '-90000.00',
    expiringMembershipsNext7Days: 4,
  });
});

describe('DashboardPage', () => {
  it('muestra KPIs, deudores principales con link a la ficha y accesos rápidos por permiso', async () => {
    await primeSession(['member:read', 'stats:read', 'member:write', 'cash:read']);
    const { default: Page } = await import('./page');
    render(withQuery(<Page />));

    expect(await screen.findByText('Socios activos')).toBeInTheDocument();
    expect(await screen.findByText('Suárez, Carla')).toBeInTheDocument();
    const memberLink = screen.getByText('Suárez, Carla').closest('a');
    expect(memberLink).toHaveAttribute('href', '/members/m1?tab=cuenta');

    // Accesos rápidos: con member:write y cash:read pero SIN access:operate
    expect(screen.getByText('Nuevo socio')).toBeInTheDocument();
    expect(screen.getByText('Ver caja')).toBeInTheDocument();
    expect(screen.queryByText('Registrar acceso')).not.toBeInTheDocument();

    // Tarjeta del asistente siempre visible
    expect(screen.getByText('Asistente Pulso')).toBeInTheDocument();
  });

  it('sin permisos de socios ni stats muestra el aviso y nada de datos', async () => {
    await primeSession([]);
    const { default: Page } = await import('./page');
    render(withQuery(<Page />));
    expect(
      screen.getByText('Tu usuario no tiene permisos para ver indicadores en esta pantalla.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Socios activos')).not.toBeInTheDocument();
    expect(listMembersMock).not.toHaveBeenCalled();
  });
});
