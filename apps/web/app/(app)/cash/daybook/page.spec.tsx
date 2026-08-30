import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type {
  CashMovement,
  CashSession,
  DaybookResponse,
  PaymentMethod,
} from '@pulso/contracts/cash';

/**
 * Libro diario (`GET /cash/daybook`). Verifica el render feliz (agrupamiento
 * por día + totales por método) y que cambiar el rango de fechas dispara una
 * nueva query con los nuevos parámetros.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/cash/daybook',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const getDaybookMock = vi.fn();
const listPaymentMethodsMock = vi.fn();

vi.mock('@/lib/api/cash', () => ({
  getDaybook: (...args: unknown[]) => getDaybookMock(...args),
  listPaymentMethods: (...args: unknown[]) => listPaymentMethodsMock(...args),
  getCurrentCashSession: vi.fn(),
  listCashSessions: vi.fn(),
  listCashMovements: vi.fn(),
  listCashRegisters: vi.fn(),
  listCashConcepts: vi.fn(),
  listCashOperations: vi.fn(),
  openCashSession: vi.fn(),
  closeCashSession: vi.fn(),
  createCashMovement: vi.fn(),
  reverseCashMovement: vi.fn(),
}));

function withProviders(children: ReactNode): ReactNode {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const METHOD_CASH = '00000000-0000-0000-0000-0000000000b1';
const METHOD_CARD = '00000000-0000-0000-0000-0000000000b2';
const SESSION_A = '00000000-0000-0000-0000-000000000501';

function makeMethod(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: METHOD_CASH,
    gymId: 'g1',
    code: 'CASH',
    name: 'Efectivo',
    countsAsCash: true,
    isActive: true,
    sortOrder: 0,
    ...overrides,
  };
}

function makeSession(overrides: Partial<CashSession> = {}): CashSession {
  return {
    id: SESSION_A,
    gymId: 'g1',
    branchId: 'b1',
    cashRegisterId: '00000000-0000-0000-0000-0000000000c1',
    status: 'CLOSED',
    openedByUserId: 'u1',
    openedAt: '2026-08-12T10:00:00.000Z',
    openingAmount: '1000.00',
    openingNotes: null,
    closedByUserId: 'u1',
    closedAt: '2026-08-12T18:00:00.000Z',
    closingNotes: null,
    expectedCash: '4000.00',
    declaredCash: '4000.00',
    cashDifference: '0.00',
    businessDate: '2026-08-12',
    ...overrides,
  };
}

function makeMovement(overrides: Partial<CashMovement> = {}): CashMovement {
  return {
    id: '00000000-0000-0000-0000-000000000701',
    gymId: 'g1',
    cashSessionId: SESSION_A,
    type: 'INCOME',
    amount: '2000.00',
    paymentMethodId: METHOD_CASH,
    cashConceptId: '00000000-0000-0000-0000-0000000000a1',
    description: null,
    memberId: null,
    membershipId: null,
    reversalOfId: null,
    isReversed: false,
    reversalReason: null,
    createdByUserId: 'u1',
    createdAt: '2026-08-12T11:00:00.000Z',
    ...overrides,
  };
}

function makeDaybook(): DaybookResponse {
  return {
    timezoneUsed: 'America/Argentina/Buenos_Aires',
    data: [
      {
        businessDate: '2026-08-12',
        sessions: [makeSession()],
        movements: [
          makeMovement(),
          makeMovement({
            id: '00000000-0000-0000-0000-000000000702',
            type: 'EXPENSE',
            amount: '500.00',
            paymentMethodId: METHOD_CARD,
          }),
        ],
        totalsByMethod: [
          { paymentMethodId: METHOD_CASH, income: '2000.00', expense: '0.00' },
          { paymentMethodId: METHOD_CARD, income: '0.00', expense: '500.00' },
        ],
      },
    ],
  };
}

async function primeSession(): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: {
      id: 'u1',
      firstName: 'Ana',
      lastName: 'T',
      email: 'a@t.com',
      mustChangePassword: false,
    },
    gym: { id: 'g1', name: 'Demo', slug: 'demo', country: 'AR', currency: 'ARS', features: [] },
    branches: [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions: ['cash:read'],
    status: 'authenticated',
  } as never);
}

beforeEach(async () => {
  getDaybookMock.mockReset();
  listPaymentMethodsMock.mockReset();
  listPaymentMethodsMock.mockResolvedValue({
    data: [
      makeMethod(),
      makeMethod({ id: METHOD_CARD, code: 'CARD', name: 'Tarjeta', countsAsCash: false }),
    ],
  });

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

describe('DaybookPage', () => {
  it('render feliz: agrupa por día y muestra los totales por método', async () => {
    await primeSession();
    getDaybookMock.mockResolvedValue(makeDaybook());

    const { default: DaybookPage } = await import('./page');
    render(withProviders(<DaybookPage />));

    // Header del día.
    const dayHeader = await screen.findByRole('heading', { name: /2026-08-12/ });
    expect(dayHeader).toBeInTheDocument();

    // Tabla de movements incluye ambos métodos y ambos tipos.
    const section = dayHeader.closest('section');
    expect(section).not.toBeNull();
    const inSection = within(section!);
    // Cada método aparece dos veces: en la tabla de movements y en el
    // resumen "Totales por método" que sigue a la tabla.
    expect(inSection.getAllByText('Efectivo').length).toBeGreaterThanOrEqual(2);
    expect(inSection.getAllByText('Tarjeta').length).toBeGreaterThanOrEqual(2);
    // Ingresos y egresos como StatusBadge.
    expect(inSection.getAllByText(/^Ingreso$/).length).toBeGreaterThan(0);
    expect(inSection.getAllByText(/^Egreso$/).length).toBeGreaterThan(0);

    // Totales del día: 2.000 ingresos y 500 egresos aparecen en el pie.
    expect(inSection.getByText(/Total del día/i)).toBeInTheDocument();
    // Formato es-AR de miles: "2.000,00" y "500,00".
    expect(inSection.getAllByText(/2\.000,00/).length).toBeGreaterThan(0);
    expect(inSection.getAllByText(/500,00/).length).toBeGreaterThan(0);

    // Subtítulo con el saldo del período (2.000 ingreso - 500 egreso = 1.500).
    // El subtítulo trae rango + saldo en un solo nodo; "1.500,00" también aparece como
    // total neto del día en el pie de la tabla, así que se asserta sobre el subtítulo.
    await waitFor(() => expect(screen.getByText(/saldo/i)).toBeInTheDocument());
    expect(screen.getByText(/saldo/i)).toHaveTextContent('1.500,00');
  });

  it('atajos de mes: "Mes actual" y "Mes anterior" están disponibles', async () => {
    await primeSession();
    getDaybookMock.mockResolvedValue(makeDaybook());

    const { default: DaybookPage } = await import('./page');
    render(withProviders(<DaybookPage />));

    expect(screen.getByRole('button', { name: /Mes actual/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mes anterior/i })).toBeInTheDocument();
  });

  it('cambio de rango: dispara una segunda query con los nuevos from/to', async () => {
    await primeSession();
    getDaybookMock.mockResolvedValue(makeDaybook());

    const { default: DaybookPage } = await import('./page');
    render(withProviders(<DaybookPage />));

    // Default: desde el primer día del mes actual hasta hoy.
    const today = new Date();
    const expectedFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const expectedTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    await waitFor(() => expect(getDaybookMock).toHaveBeenCalled());
    const firstCall = getDaybookMock.mock.calls[0]?.[0] as { from: string; to: string };
    expect(firstCall.from).toBe(expectedFrom);
    expect(firstCall.to).toBe(expectedTo);

    // Cambiar "Desde" a un día anterior fuerza un rekey de la query. La fecha fija tiene que
    // ser distinta del default (primer día del mes actual) en cualquier mes en que corra el test.
    const fromInput = screen.getByLabelText(/Desde/i);
    fireEvent.change(fromInput, { target: { value: '2020-01-15' } });

    await waitFor(() => expect(getDaybookMock.mock.calls.length).toBeGreaterThan(1));
    const lastCall = getDaybookMock.mock.calls[getDaybookMock.mock.calls.length - 1]?.[0] as {
      from: string;
      to: string;
    };
    expect(lastCall.from).toBe('2020-01-15');
    // `to` sigue siendo el default (hoy).
    expect(lastCall.to).toBe(expectedTo);
  });
});
