import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type {
  CashConcept,
  CashMovement,
  CashRegister,
  CashSession,
  PaymentMethod,
} from '@pulso/contracts/cash';

/**
 * Pantalla operativa de caja.
 *
 * Cubre los estados troncales: sin sesión → botón "Abrir caja" + modal,
 * con sesión → tabla de movements + acciones (nuevo, revertir, cerrar).
 * La lista de socios es un input libre de UUID (MVP), así que el test
 * verifica que el `memberId` viaja en el payload cuando se ingresa.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/cash',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const getCurrentCashSessionMock = vi.fn();
const listCashMovementsMock = vi.fn();
const listPaymentMethodsMock = vi.fn();
const listCashConceptsMock = vi.fn();
const listCashRegistersMock = vi.fn();
const openCashSessionMock = vi.fn();
const closeCashSessionMock = vi.fn();
const createCashMovementMock = vi.fn();
const reverseCashMovementMock = vi.fn();
const listCashOperationsMock = vi.fn();

vi.mock('@/lib/api/cash', () => ({
  getCurrentCashSession: (...args: unknown[]) => getCurrentCashSessionMock(...args),
  listCashMovements: (...args: unknown[]) => listCashMovementsMock(...args),
  listPaymentMethods: (...args: unknown[]) => listPaymentMethodsMock(...args),
  listCashConcepts: (...args: unknown[]) => listCashConceptsMock(...args),
  listCashRegisters: (...args: unknown[]) => listCashRegistersMock(...args),
  openCashSession: (...args: unknown[]) => openCashSessionMock(...args),
  closeCashSession: (...args: unknown[]) => closeCashSessionMock(...args),
  createCashMovement: (...args: unknown[]) => createCashMovementMock(...args),
  reverseCashMovement: (...args: unknown[]) => reverseCashMovementMock(...args),
  listCashOperations: (...args: unknown[]) => listCashOperationsMock(...args),
  getDaybook: vi.fn(),
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

const REGISTER_ID = '00000000-0000-0000-0000-0000000000c1';
const SESSION_ID = '00000000-0000-0000-0000-000000000501';
const MOVEMENT_ID = '00000000-0000-0000-0000-000000000601';
const CONCEPT_INCOME = '00000000-0000-0000-0000-0000000000a1';
const CONCEPT_EXPENSE = '00000000-0000-0000-0000-0000000000a2';
const METHOD_CASH = '00000000-0000-0000-0000-0000000000b1';
const METHOD_CARD = '00000000-0000-0000-0000-0000000000b2';

function makeRegister(overrides: Partial<CashRegister> = {}): CashRegister {
  return {
    id: REGISTER_ID,
    gymId: 'g1',
    branchId: 'b1',
    name: 'Caja Principal',
    isActive: true,
    ...overrides,
  };
}

function makeSession(overrides: Partial<CashSession> = {}): CashSession {
  return {
    id: SESSION_ID,
    gymId: 'g1',
    branchId: 'b1',
    cashRegisterId: REGISTER_ID,
    status: 'OPEN',
    openedByUserId: 'u1',
    openedAt: '2026-08-12T10:00:00.000Z',
    openingAmount: '1000.00',
    openingNotes: null,
    closedByUserId: null,
    closedAt: null,
    closingNotes: null,
    expectedCash: null,
    declaredCash: null,
    cashDifference: null,
    businessDate: '2026-08-12',
    ...overrides,
  };
}

function makeMovement(overrides: Partial<CashMovement> = {}): CashMovement {
  return {
    id: MOVEMENT_ID,
    gymId: 'g1',
    cashSessionId: SESSION_ID,
    type: 'INCOME',
    amount: '2500.00',
    paymentMethodId: METHOD_CASH,
    cashConceptId: CONCEPT_INCOME,
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

function makeConcept(overrides: Partial<CashConcept> = {}): CashConcept {
  return {
    id: CONCEPT_INCOME,
    gymId: 'g1',
    code: 'OTHER_INCOME',
    name: 'Ingreso varios',
    type: 'INCOME',
    isSystem: false,
    isActive: true,
    ...overrides,
  };
}

async function primeSession(permissions: string[] = ['cash:read', 'cash:operate', 'cash:open_close', 'cash:reverse']): Promise<void> {
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
    permissions,
    status: 'authenticated',
  } as never);
}

beforeEach(async () => {
  getCurrentCashSessionMock.mockReset();
  listCashMovementsMock.mockReset();
  listPaymentMethodsMock.mockReset();
  listCashConceptsMock.mockReset();
  listCashRegistersMock.mockReset();
  openCashSessionMock.mockReset();
  closeCashSessionMock.mockReset();
  createCashMovementMock.mockReset();
  reverseCashMovementMock.mockReset();
  listCashOperationsMock.mockReset().mockResolvedValue({ data: [] });

  listPaymentMethodsMock.mockResolvedValue({
    data: [
      makeMethod(),
      makeMethod({ id: METHOD_CARD, code: 'CARD', name: 'Tarjeta', countsAsCash: false }),
    ],
  });
  listCashConceptsMock.mockResolvedValue({
    data: [
      makeConcept(),
      makeConcept({
        id: CONCEPT_EXPENSE,
        code: 'OTHER_EXPENSE',
        name: 'Egreso varios',
        type: 'EXPENSE',
      }),
    ],
  });
  listCashRegistersMock.mockResolvedValue({ data: [makeRegister()] });

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

describe('CashPage', () => {
  it('un error de sesión no aparenta caja cerrada ni permite abrir otra', async () => {
    await primeSession();
    getCurrentCashSessionMock.mockRejectedValue(new Error('sin red'));
    const { default: Page } = await import('./page');
    render(withProviders(<Page />));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar');
    expect(screen.queryByRole('button', { name: /Abrir caja/ })).not.toBeInTheDocument();
    expect(screen.queryByText('No hay caja abierta')).not.toBeInTheDocument();
  });

  it('cash:operate no habilita abrir/cerrar ni revertir sin permisos específicos', async () => {
    await primeSession(['cash:read', 'cash:operate']);
    getCurrentCashSessionMock.mockResolvedValue(makeSession());
    listCashMovementsMock.mockResolvedValue({ data: [makeMovement()] });
    const { default: Page } = await import('./page');
    render(withProviders(<Page />));
    expect(await screen.findByRole('button', { name: /Entrada .* salida manual/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Cerrar caja|Revertir/ })).not.toBeInTheDocument();
  });

  it('vende productos por Inventario y excluye tarjetas y conceptos de cuotas en entradas manuales', async () => {
    await primeSession(['cash:read', 'cash:operate', 'product:read']);
    getCurrentCashSessionMock.mockResolvedValue(makeSession());
    listCashMovementsMock.mockResolvedValue({ data: [] });
    listCashConceptsMock.mockResolvedValue({ data: [makeConcept(), makeConcept({ id: 'cuota', name: 'Cuota', isSystem: true })] });
    listPaymentMethodsMock.mockResolvedValue({ data: [makeMethod(), makeMethod({ id: 'qr', code: 'QR', name: 'QR / Billetera', countsAsCash: false }), makeMethod({ id: 'card', code: 'DEBIT', name: 'Débito' })] });
    const { default: Page } = await import('./page');
    render(withProviders(<Page />));
    expect(screen.getByRole('link', { name: 'Vender producto' })).toHaveAttribute('href', '/inventory');
    await waitFor(() => expect(screen.getByRole('button', { name: /Entrada .* salida manual/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Entrada .* salida manual/ }));
    await userEvent.click(screen.getByLabelText(/^Concepto/));
    expect(screen.queryByRole('option', { name: 'Cuota' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Ingreso varios' }));
    await userEvent.click(screen.getByLabelText(/^Método de pago/));
    expect(screen.getByRole('option', { name: 'Mercado Pago' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Débito|Crédito|Tarjeta/ })).not.toBeInTheDocument();
  });

  it('conserva el arqueo vacío hasta contarlo y muestra rechazo real por pendientes', async () => {
    await primeSession();
    getCurrentCashSessionMock.mockResolvedValue(makeSession());
    listCashMovementsMock.mockResolvedValue({ data: [] });
    const { ApiError } = await import('@/lib/api/errors');
    closeCashSessionMock.mockRejectedValue(new ApiError({ type: 'about:blank', title: 'Pendientes', status: 409, code: 'CASH_SESSION_HAS_PENDING_OPERATIONS', detail: 'La caja tiene operaciones pendientes de aprobación.' }));
    const { default: Page } = await import('./page');
    render(withProviders(<Page />));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar caja' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    const dialog = await screen.findByRole('dialog');
    const amount = within(dialog).getByLabelText('Efectivo');
    expect(amount).toHaveValue('');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar caja' }));
    expect(closeCashSessionMock).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Completá cada importe');
    fireEvent.change(amount, { target: { value: '1000' } });
    fireEvent.blur(amount);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('operaciones pendientes'));
    expect(amount).toHaveValue('1000.00');
    expect(listCashOperationsMock).not.toHaveBeenCalled();
  });

  it('sin sesión: muestra el estado vacío y ofrece "Abrir caja"', async () => {
    await primeSession();
    getCurrentCashSessionMock.mockResolvedValueOnce(null);

    const { default: CashPage } = await import('./page');
    render(withProviders(<CashPage />));

    await waitFor(() => expect(screen.getByText(/No hay caja abierta/i)).toBeInTheDocument());
    // Botones "Abrir caja": el del header + el del EmptyState.
    expect(screen.getAllByRole('button', { name: /Abrir caja/i }).length).toBeGreaterThan(0);
    // Y no aparece "Cerrar caja" porque no hay sesión.
    expect(screen.queryByRole('button', { name: /Cerrar caja/i })).not.toBeInTheDocument();
  });

  it('con sesión OPEN: pinta los movements con concepto, método e importe', async () => {
    await primeSession();
    getCurrentCashSessionMock.mockResolvedValue(makeSession());
    listCashMovementsMock.mockResolvedValue({
      data: [
        makeMovement(),
        makeMovement({
          id: '00000000-0000-0000-0000-000000000602',
          type: 'EXPENSE',
          amount: '500.00',
          paymentMethodId: METHOD_CARD,
          cashConceptId: CONCEPT_EXPENSE,
        }),
      ],
    });

    const { default: CashPage } = await import('./page');
    render(withProviders(<CashPage />));

    await waitFor(() => expect(screen.getByText(/Ingreso varios/)).toBeInTheDocument());
    expect(screen.getByText(/Egreso varios/)).toBeInTheDocument();
    expect(screen.getByText(/^Efectivo$/)).toBeInTheDocument();
    expect(screen.getByText(/Tarjeta/)).toBeInTheDocument();
    // Formato es-AR: "$ 2.500,00" con espacio duro entre símbolo y monto.
    // Se busca dentro de la tabla porque el mismo importe también puede
    // aparecer en el KPI "Ingresos" calculado sobre los mismos movements.
    const table = screen.getByRole('table', { name: /Movimientos de la sesión de caja/i });
    expect(within(table).getByText(/2\.500,00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Entrada .* salida manual/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cerrar caja/i })).toBeInTheDocument();

    // KPIs de la sesión calculados a partir de los movements reales:
    // ingresos 2.500, egresos 500, saldo = inicial (1.000) + 2.500 - 500 = 3.000.
    expect(screen.getByText('Ingresos registrados')).toBeInTheDocument();
    expect(screen.getByText('Salidas registradas')).toBeInTheDocument();
    expect(screen.getByText('Efectivo estimado')).toBeInTheDocument();
    expect(screen.getByText(/3\.500,00/)).toBeInTheDocument();
  });

  it('abrir caja: envía openCashSession con el fondo y el cashRegisterId elegido', async () => {
    await primeSession();
    getCurrentCashSessionMock.mockResolvedValue(null);
    openCashSessionMock.mockResolvedValueOnce({ session: makeSession() });

    const user = userEvent.setup();
    const { default: CashPage } = await import('./page');
    render(withProviders(<CashPage />));

    await waitFor(() => expect(screen.getByText(/No hay caja abierta/i)).toBeInTheDocument());
    // Abrimos el modal con el CTA del header (queda arriba, siempre visible).
    const openButtons = screen.getAllByRole('button', { name: /Abrir caja/i });
    fireEvent.click(openButtons[0]!);

    // Esperamos a que el select de cajas cargue.
    await waitFor(() => expect(listCashRegistersMock).toHaveBeenCalled());
    // Elegir la caja del select.
    const registerTrigger = await screen.findByLabelText(/^Caja\b/i);
    await user.click(registerTrigger);
    await user.click(await screen.findByRole('option', { name: /Caja Principal/i }));

    // Fondo de apertura.
    const amountLabel = await screen.findByLabelText(/Fondo de apertura/i);
    fireEvent.change(amountLabel, { target: { value: '5000' } });
    fireEvent.blur(amountLabel);

    // Confirmar. Hay dos "Abrir caja" (header y footer del modal); disparamos
    // el submit del formulario apretando el del footer del modal — es el que
    // tiene type=submit sobre el form del modal.
    const submitBtns = screen.getAllByRole('button', { name: /Abrir caja/i });
    // El del modal es el que aparece último en el DOM (dentro del portal).
    fireEvent.click(submitBtns[submitBtns.length - 1]!);

    await waitFor(() => expect(openCashSessionMock).toHaveBeenCalledTimes(1));
    const [payload, idem] = openCashSessionMock.mock.calls[0] as [
      { cashRegisterId: string; openingAmount: string; notes?: string },
      string,
    ];
    expect(payload.cashRegisterId).toBe(REGISTER_ID);
    expect(payload.openingAmount).toBe('5000.00');
    expect(idem).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('entrada manual: envía importes string sin UUID de socio ni simular un cobro de cuota', async () => {
    await primeSession();
    getCurrentCashSessionMock.mockResolvedValue(makeSession());
    listCashMovementsMock.mockResolvedValue({ data: [] });
    createCashMovementMock.mockResolvedValueOnce({
      status: 'CREATED',
      movement: makeMovement(),
    });

    const user = userEvent.setup();
    const { default: CashPage } = await import('./page');
    render(withProviders(<CashPage />));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Entrada .* salida manual/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Entrada .* salida manual/i }));

    // Concepto: elegir "Ingreso varios" (INCOME por default).
    const conceptTrigger = await screen.findByLabelText(/^Concepto\b/i);
    await user.click(conceptTrigger);
    await user.click(await screen.findByRole('option', { name: /Ingreso varios/i }));

    // Método de pago: Efectivo.
    const methodTrigger = screen.getByLabelText(/^Método de pago\b/i);
    await user.click(methodTrigger);
    await user.click(await screen.findByRole('option', { name: /^Efectivo$/i }));

    // Importe.
    const amountInput = screen.getByLabelText(/^Importe\b/i);
    fireEvent.change(amountInput, { target: { value: '1500' } });
    fireEvent.blur(amountInput);

    expect(screen.queryByLabelText(/^Socio/i)).not.toBeInTheDocument();

    // Enviar.
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/i }));

    await waitFor(() => expect(createCashMovementMock).toHaveBeenCalledTimes(1));
    const [payload, idem] = createCashMovementMock.mock.calls[0] as [
      {
        type: string;
        cashConceptId: string;
        paymentMethodId: string;
        amount: string;
        memberId?: string;
      },
      string,
    ];
    expect(payload).toMatchObject({
      type: 'INCOME',
      cashConceptId: CONCEPT_INCOME,
      paymentMethodId: METHOD_CASH,
      amount: '1500.00',
    });
    expect(payload).not.toHaveProperty('memberId');
    expect(idem).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('revertir: abre el diálogo con motivo y llama reverseCashMovement al confirmar', async () => {
    await primeSession();
    getCurrentCashSessionMock.mockResolvedValue(makeSession());
    listCashMovementsMock.mockResolvedValue({ data: [makeMovement()] });
    reverseCashMovementMock.mockResolvedValueOnce({
      reversal: makeMovement({
        id: '00000000-0000-0000-0000-000000000603',
        reversalOfId: MOVEMENT_ID,
        type: 'EXPENSE',
        amount: '2500.00',
      }),
      original: makeMovement({ isReversed: true }),
    });

    const { default: CashPage } = await import('./page');
    render(withProviders(<CashPage />));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Revertir/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Revertir/i }));

    // El diálogo pide un motivo — el botón Confirmar queda disabled con < 10 chars.
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: /^Revertir$/i });
    expect(confirmBtn).toBeDisabled();
    expect(within(dialog).getByText(/Se anulará.*2\.500,00/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();

    const reasonInput = within(dialog).getByLabelText(/Motivo/i);
    fireEvent.change(reasonInput, { target: { value: 'error de tipeo evidente' } });
    await waitFor(() => expect(confirmBtn).not.toBeDisabled());

    fireEvent.click(confirmBtn);

    await waitFor(() => expect(reverseCashMovementMock).toHaveBeenCalledTimes(1));
    const [id, payload, idem] = reverseCashMovementMock.mock.calls[0] as [
      string,
      { reason: string },
      string,
    ];
    expect(id).toBe(MOVEMENT_ID);
    expect(payload.reason).toBe('error de tipeo evidente');
    expect(idem).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('cerrar caja: envía closingDetails y muestra la diferencia en el toast', async () => {
    await primeSession();
    getCurrentCashSessionMock.mockResolvedValue(makeSession());
    listCashMovementsMock.mockResolvedValue({
      data: [makeMovement({ paymentMethodId: METHOD_CASH, amount: '2000.00', type: 'INCOME' })],
    });
    closeCashSessionMock.mockResolvedValueOnce({
      session: makeSession({ status: 'CLOSED' }),
      details: [
        {
          paymentMethodId: METHOD_CASH,
          expectedAmount: '3000.00',
          declaredAmount: '3100.00',
          difference: '100.00',
        },
      ],
      differenceTotal: '100.00',
    });

    const { default: CashPage } = await import('./page');
    render(withProviders(<CashPage />));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Cerrar caja/i })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Cerrar caja/i }));

    // Modal de cierre: hay MoneyInput por cada método declarable. Cambiamos el
    // de Efectivo (único que tiene movimientos + countsAsCash en este test).
    const dialog = await screen.findByRole('dialog');
    const cashInput = within(dialog).getByLabelText(/Efectivo/);
    fireEvent.change(cashInput, { target: { value: '3100' } });
    fireEvent.blur(cashInput);

    // Submit del footer del modal.
    const submitBtn = within(dialog).getByRole('button', { name: /Cerrar caja/i });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(closeCashSessionMock).toHaveBeenCalledTimes(1));
    const [payload, idem] = closeCashSessionMock.mock.calls[0] as [
      { declared: { paymentMethodId: string; amount: string }[]; notes?: string },
      string,
    ];
    expect(payload.declared).toEqual(
      expect.arrayContaining([{ paymentMethodId: METHOD_CASH, amount: '3100.00' }]),
    );
    expect(idem).toMatch(/^[0-9a-f-]{36}$/i);

    // Toast con la diferencia (100,00). El texto vive en el `region` "Notificaciones".
    const region = await screen.findByRole('region', { name: /Notificaciones/i });
    await waitFor(() =>
      expect(within(region).getByText(/Diferencia total del arqueo/i)).toBeInTheDocument(),
    );
    expect(within(region).getByText(/100,00/)).toBeInTheDocument();
  });
});
