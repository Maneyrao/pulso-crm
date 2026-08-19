import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CashConcept } from '@pulso/contracts/cash';

/**
 * Caja › Conceptos (`GET /cash/concepts`). `lib/api/cash.ts` sólo expone
 * `listCashConcepts` (sin create/update), así que la pantalla es de sólo
 * lectura: se verifica el render feliz, el estado vacío y el de error.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/cash/concepts',
  useSearchParams: () => new URLSearchParams(),
}));

const listCashConceptsMock = vi.fn();
vi.mock('@/lib/api/cash', () => ({
  listCashConcepts: (...args: unknown[]) => listCashConceptsMock(...args),
  listPaymentMethods: vi.fn(),
  getCurrentCashSession: vi.fn(),
  listCashSessions: vi.fn(),
  listCashMovements: vi.fn(),
  listCashRegisters: vi.fn(),
  listCashOperations: vi.fn(),
  openCashSession: vi.fn(),
  closeCashSession: vi.fn(),
  createCashMovement: vi.fn(),
  reverseCashMovement: vi.fn(),
  getDaybook: vi.fn(),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function primeSession(): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u', firstName: 'Ana', lastName: 'Test', email: 'a@t.com' },
    gym: { id: 'g1', slug: 'demo', name: 'Demo', currency: 'ARS', features: [] },
    branches: [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions: ['cash:read'],
    status: 'authenticated',
  } as never);
}

function makeConcept(overrides: Partial<CashConcept> = {}): CashConcept {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    gymId: 'g1',
    code: 'MEMBERSHIP_FEE',
    name: 'Cobro de cuota',
    type: 'INCOME',
    isSystem: true,
    isActive: true,
    ...overrides,
  };
}

beforeEach(async () => {
  listCashConceptsMock.mockReset();
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

describe('CashConceptsPage', () => {
  it('sin permiso cash:read muestra el fallback de sin acceso', async () => {
    await primeSession();
    const { useSessionStore } = await import('@/lib/stores/session');
    useSessionStore.setState({ permissions: [] } as never);

    const { default: CashConceptsPage } = await import('./page');
    render(withQuery(<CashConceptsPage />));

    expect(screen.getByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: título, y conceptos con tipo y estado', async () => {
    await primeSession();
    listCashConceptsMock.mockResolvedValueOnce({
      data: [
        makeConcept({ name: 'Cobro de cuota', type: 'INCOME' }),
        makeConcept({
          id: '00000000-0000-0000-0000-000000000002',
          code: 'SUPPLIES',
          name: 'Insumos',
          type: 'EXPENSE',
          isSystem: false,
          isActive: false,
        }),
      ],
    });

    const { default: CashConceptsPage } = await import('./page');
    render(withQuery(<CashConceptsPage />));

    expect(screen.getByText('Conceptos')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Cobro de cuota')).toBeInTheDocument());
    expect(screen.getByText('Insumos')).toBeInTheDocument();
    expect(screen.getByText('Ingreso')).toBeInTheDocument();
    expect(screen.getByText('Egreso')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('vacío muestra "Todavía no hay conceptos"', async () => {
    await primeSession();
    listCashConceptsMock.mockResolvedValueOnce({ data: [] });

    const { default: CashConceptsPage } = await import('./page');
    render(withQuery(<CashConceptsPage />));

    await waitFor(() => expect(screen.getByText(/Todavía no hay conceptos/i)).toBeInTheDocument());
  });

  it('ante error muestra el detail y permite reintentar', async () => {
    await primeSession();
    const { ApiError } = await import('@/lib/api/errors');
    listCashConceptsMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'INTERNAL_ERROR',
        title: 'Error',
        status: 500,
        detail: 'No se pudieron cargar los conceptos',
      }),
    );

    const { default: CashConceptsPage } = await import('./page');
    render(withQuery(<CashConceptsPage />));

    await waitFor(() =>
      expect(screen.getByText(/No se pudieron cargar los conceptos/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
  });
});
