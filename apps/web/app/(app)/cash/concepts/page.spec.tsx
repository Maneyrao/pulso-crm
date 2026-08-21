import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { CashConcept } from '@pulso/contracts/cash';

/**
 * Caja › Conceptos (`GET /cash/concepts` — `cash:read`; alta/edición con
 * `config:write` vía `POST/PATCH /cash/concepts`, cableados en
 * `lib/api/cash.ts` porque el backend ya expone `CashConfigController`).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/cash/concepts',
  useSearchParams: () => new URLSearchParams(),
}));

const listCashConceptsMock = vi.fn();
const createCashConceptMock = vi.fn();
const updateCashConceptMock = vi.fn();
vi.mock('@/lib/api/cash', () => ({
  listCashConcepts: (...args: unknown[]) => listCashConceptsMock(...args),
  createCashConcept: (...args: unknown[]) => createCashConceptMock(...args),
  updateCashConcept: (...args: unknown[]) => updateCashConceptMock(...args),
  listPaymentMethods: vi.fn(),
  createPaymentMethod: vi.fn(),
  updatePaymentMethod: vi.fn(),
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
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

async function primeSession(permissions: string[] = ['cash:read']): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u', firstName: 'Ana', lastName: 'Test', email: 'a@t.com' },
    gym: { id: 'g1', slug: 'demo', name: 'Demo', currency: 'ARS', features: [] },
    branches: [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions,
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
  createCashConceptMock.mockReset();
  updateCashConceptMock.mockReset();
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

  it('sin config:write no muestra "Nuevo concepto" ni acciones de fila', async () => {
    await primeSession();
    listCashConceptsMock.mockResolvedValueOnce({ data: [makeConcept()] });

    const { default: CashConceptsPage } = await import('./page');
    render(withQuery(<CashConceptsPage />));

    await waitFor(() => expect(screen.getByText('Cobro de cuota')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Nuevo concepto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument();
  });

  it('con config:write: crea un concepto nuevo con code/name/type', async () => {
    await primeSession(['cash:read', 'config:write']);
    listCashConceptsMock.mockResolvedValue({ data: [] });
    createCashConceptMock.mockResolvedValueOnce(
      makeConcept({ id: '00000000-0000-0000-0000-000000000003', code: 'RENT', name: 'Alquiler', type: 'EXPENSE' }),
    );

    const user = userEvent.setup();
    const { default: CashConceptsPage } = await import('./page');
    render(withQuery(<CashConceptsPage />));

    await waitFor(() => expect(screen.getByText(/Todavía no hay conceptos/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Nuevo concepto/i }));

    const nameInput = await screen.findByLabelText(/^Nombre\b/i);
    fireEvent.change(nameInput, { target: { value: 'Alquiler' } });
    const codeInput = screen.getByLabelText(/^Código\b/i);
    fireEvent.change(codeInput, { target: { value: 'rent' } });

    const typeTrigger = screen.getByLabelText(/^Tipo\b/i);
    await user.click(typeTrigger);
    await user.click(await screen.findByRole('option', { name: /^Egreso$/i }));

    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));

    await waitFor(() => expect(createCashConceptMock).toHaveBeenCalledTimes(1));
    expect(createCashConceptMock).toHaveBeenCalledWith({ code: 'RENT', name: 'Alquiler', type: 'EXPENSE' });
  });
});
