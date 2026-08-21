import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * Estadísticas (LEODARROSAFIT_ALIGNMENT_PLAN.md Fase 2A): reescrita para usar
 * sólo datos reales — `GET /reports/dashboard` + afluencia por hora de hoy
 * calculada de `GET /attendances`. Ya no depende de `lib/mock/data/insights-demo.ts`.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/stats',
  useRouter: () => ({ push: vi.fn() }),
}));

const getDashboardMock = vi.fn();
vi.mock('@/lib/api/reporting', () => ({
  getDashboard: (...args: unknown[]) => getDashboardMock(...args),
}));

const listAttendancesMock = vi.fn();
vi.mock('@/lib/api/access', () => ({
  listAttendances: (...args: unknown[]) => listAttendancesMock(...args),
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

const pageInfo = (total: number) => ({ total, limit: 100, offset: 0 });

beforeEach(() => {
  vi.clearAllMocks();

  getDashboardMock.mockResolvedValue({
    activeMembers: 120,
    newMembersThisMonth: 5,
    todayIncome: '85000.00',
    todayAttendances: 22,
    totalDebt: '-30000.00',
    expiringMembershipsNext7Days: 3,
    timezoneUsed: 'America/Argentina/Buenos_Aires',
  });

  listAttendancesMock.mockResolvedValue({
    data: [{ occurredAt: new Date().toISOString() }],
    pageInfo: pageInfo(1),
  });
});

describe('StatsPage', () => {
  it('sin permiso stats:read muestra el mensaje de sin acceso y no llama a la API', async () => {
    await primeSession([]);
    const { default: StatsPage } = await import('./page');
    render(withQuery(<StatsPage />));

    expect(screen.getByText('Sin acceso')).toBeInTheDocument();
    expect(getDashboardMock).not.toHaveBeenCalled();
  });

  it('con stats:read muestra los KPIs reales de GET /reports/dashboard', async () => {
    await primeSession(['stats:read']);
    const { default: StatsPage } = await import('./page');
    render(withQuery(<StatsPage />));

    expect(await screen.findByText('22')).toBeInTheDocument();
    expect(screen.getByText('Ingresos hoy')).toBeInTheDocument();
    expect(screen.getByText('Asistencias hoy')).toBeInTheDocument();
    expect(screen.getByText('Deuda total')).toBeInTheDocument();
    expect(screen.getByText('Membresías por vencer (7 días)')).toBeInTheDocument();
  });

  it('con attendance:read muestra la afluencia por hora de hoy', async () => {
    await primeSession(['stats:read', 'attendance:read']);
    const { default: StatsPage } = await import('./page');
    render(withQuery(<StatsPage />));

    expect(await screen.findByText('Afluencia por hora · hoy')).toBeInTheDocument();
    expect(listAttendancesMock).toHaveBeenCalled();
  });

  it('sin attendance:read no muestra la tarjeta de afluencia', async () => {
    await primeSession(['stats:read']);
    const { default: StatsPage } = await import('./page');
    render(withQuery(<StatsPage />));

    await screen.findByText('Ingresos hoy');
    expect(screen.queryByText('Afluencia por hora · hoy')).not.toBeInTheDocument();
    expect(listAttendancesMock).not.toHaveBeenCalled();
  });
});
