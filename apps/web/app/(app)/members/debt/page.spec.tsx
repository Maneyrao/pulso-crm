import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DebtorListItem, ListDebtorsResponse } from '@pulso/contracts/members';

/**
 * Listado de deudores (T-M3-4). El único ordenamiento por defecto que la UI
 * garantiza es "mayor deuda primero": los saldos deudores son negativos, así
 * que se pide sort=balance, order=asc (más negativo primero). El resto
 * viene del backend.
 */

const routerPush = vi.fn();
let currentParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/members/debt',
  useSearchParams: () => currentParams,
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

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function primeSession(): Promise<void> {
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
    permissions: ['member:read'],
    status: 'authenticated',
  } as never);
}

function makeDebtor(overrides: Partial<DebtorListItem> = {}): DebtorListItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    memberNumber: 10,
    firstName: 'Bruno',
    lastName: 'García',
    documentMasked: '•••••789',
    phone: null,
    status: 'ACTIVE',
    branch: { id: 'b1', name: 'Centro' },
    activeMembership: { planName: 'Mensual', endDate: '2026-01-15', classesRemaining: null },
    balance: '15000.00',
    photoUrl: null,
    debtSince: '2025-11-01',
    ...overrides,
  };
}

function makeResponse(items: DebtorListItem[], total = items.length): ListDebtorsResponse {
  return {
    data: items,
    pageInfo: { total, page: 1, limit: 25, hasMore: false },
  };
}

beforeEach(async () => {
  routerPush.mockReset();
  listDebtorsMock.mockReset();
  currentParams = new URLSearchParams();
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

describe('DebtorsPage', () => {
  it('render feliz: muestra apellido+nombre, documento, deuda y última membresía', async () => {
    await primeSession();
    listDebtorsMock.mockResolvedValueOnce(makeResponse([makeDebtor()]));

    const { default: DebtorsPage } = await import('./page');
    render(withQuery(<DebtorsPage />));

    await waitFor(() => expect(screen.getByText('García, Bruno')).toBeInTheDocument());
    expect(screen.getByText('•••••789')).toBeInTheDocument();
    expect(screen.getByText(/15\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Mensual/)).toBeInTheDocument();
  });

  it('empty sin filtros muestra el mensaje "Ningún socio con deuda"', async () => {
    await primeSession();
    listDebtorsMock.mockResolvedValueOnce(makeResponse([]));
    const { default: DebtorsPage } = await import('./page');
    render(withQuery(<DebtorsPage />));

    await waitFor(() => expect(screen.getByText(/Ningún socio con deuda/i)).toBeInTheDocument());
  });

  it('loading pinta la tabla en estado busy', async () => {
    await primeSession();
    listDebtorsMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: DebtorsPage } = await import('./page');
    render(withQuery(<DebtorsPage />));
    const table = await screen.findByRole('table');
    expect(table).toHaveAttribute('aria-busy', 'true');
  });

  it('ante error 500 muestra el detail y permite reintentar', async () => {
    await primeSession();
    const { ApiError } = await import('@/lib/api/errors');
    listDebtorsMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'INTERNAL_ERROR',
        title: 'Error',
        status: 500,
        detail: 'La consulta explotó',
      }),
    );
    const { default: DebtorsPage } = await import('./page');
    render(withQuery(<DebtorsPage />));
    await waitFor(() => expect(screen.getByText(/La consulta explotó/)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
  });

  it('orden por defecto pide sort=balance, order=asc (mayor deuda primero: saldos negativos)', async () => {
    await primeSession();
    listDebtorsMock.mockResolvedValueOnce(makeResponse([makeDebtor()]));
    const { default: DebtorsPage } = await import('./page');
    render(withQuery(<DebtorsPage />));

    await waitFor(() => expect(listDebtorsMock).toHaveBeenCalledTimes(1));
    const firstArg = listDebtorsMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstArg.sort).toBe('balance');
    expect(firstArg.order).toBe('asc');
  });
});
