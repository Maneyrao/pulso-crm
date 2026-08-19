import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { PaymentMethod } from '@pulso/contracts/cash';

/**
 * Caja › Métodos de pago (`GET /cash/payment-methods`). `lib/api/cash.ts`
 * sólo expone `listPaymentMethods` (sin create/update), así que la pantalla
 * es de sólo lectura: se verifica el render feliz, el estado vacío y el de
 * error.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/cash/payment-methods',
  useSearchParams: () => new URLSearchParams(),
}));

const listPaymentMethodsMock = vi.fn();
vi.mock('@/lib/api/cash', () => ({
  listPaymentMethods: (...args: unknown[]) => listPaymentMethodsMock(...args),
  listCashConcepts: vi.fn(),
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

function makeMethod(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    gymId: 'g1',
    code: 'CASH',
    name: 'Efectivo',
    countsAsCash: true,
    isActive: true,
    sortOrder: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  listPaymentMethodsMock.mockReset();
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

describe('PaymentMethodsPage', () => {
  it('sin permiso cash:read muestra el fallback de sin acceso', async () => {
    await primeSession();
    const { useSessionStore } = await import('@/lib/stores/session');
    useSessionStore.setState({ permissions: [] } as never);

    const { default: PaymentMethodsPage } = await import('./page');
    render(withQuery(<PaymentMethodsPage />));

    expect(screen.getByText(/Sin acceso/i)).toBeInTheDocument();
  });

  it('render feliz: título y métodos con cuenta como efectivo y estado', async () => {
    await primeSession();
    listPaymentMethodsMock.mockResolvedValueOnce({
      data: [
        makeMethod({ name: 'Efectivo', countsAsCash: true }),
        makeMethod({
          id: '00000000-0000-0000-0000-000000000002',
          code: 'CARD_DEBIT',
          name: 'Débito',
          countsAsCash: false,
          isActive: false,
        }),
      ],
    });

    const { default: PaymentMethodsPage } = await import('./page');
    render(withQuery(<PaymentMethodsPage />));

    expect(screen.getByRole('heading', { name: 'Métodos de pago' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Efectivo')).toBeInTheDocument());
    expect(screen.getByText('Débito')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('vacío muestra "Todavía no hay métodos de pago"', async () => {
    await primeSession();
    listPaymentMethodsMock.mockResolvedValueOnce({ data: [] });

    const { default: PaymentMethodsPage } = await import('./page');
    render(withQuery(<PaymentMethodsPage />));

    await waitFor(() =>
      expect(screen.getByText(/Todavía no hay métodos de pago/i)).toBeInTheDocument(),
    );
  });

  it('ante error muestra el detail y permite reintentar', async () => {
    await primeSession();
    const { ApiError } = await import('@/lib/api/errors');
    listPaymentMethodsMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'INTERNAL_ERROR',
        title: 'Error',
        status: 500,
        detail: 'No se pudieron cargar los métodos de pago',
      }),
    );

    const { default: PaymentMethodsPage } = await import('./page');
    render(withQuery(<PaymentMethodsPage />));

    await waitFor(() =>
      expect(screen.getByText(/No se pudieron cargar los métodos de pago/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeInTheDocument();
  });
});
