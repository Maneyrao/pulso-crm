import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberPaymentDialog } from './MemberPaymentDialog';
import { useSessionStore } from '@/lib/stores/session';
import { ApiError } from '@/lib/api/errors';

const api = vi.hoisted(() => ({ getMemberPaymentQuote: vi.fn(), payMemberDebt: vi.fn(), getCurrentCashSession: vi.fn(), listPaymentMethods: vi.fn() }));
vi.mock('@/lib/api/cash', () => api);
vi.mock('@/lib/api/members', () => api);
const close = vi.fn();
const member = { id: 'member1', firstName: 'Ana', lastName: 'Perez', balance: '-40000.00' };
const quote = { balance: '-40000.00', debt: '40000.00', total: '40000.00', surcharge: '0.00', ledgerVersion: 'ledger1',
  lines: [{ membershipId: 'membership1', label: 'Pase Zen', startDate: '2026-09-01', endDate: '2026-09-30', amount: '40000.00', surcharge: '0.00' }] };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><ToastProvider><MemberPaymentDialog member={member} onClose={close} /></ToastProvider></QueryClientProvider>);
  return invalidate;
}
beforeEach(() => {
  vi.resetAllMocks();
  useSessionStore.setState({ gym: { id: 'g1' }, activeBranchId: 'b1' } as never);
  api.getCurrentCashSession.mockResolvedValue({ id: 'session1' });
  api.listPaymentMethods.mockResolvedValue({ data: [{ id: 'cash1', code: 'CASH', name: 'Efectivo', isActive: true }] });
  api.getMemberPaymentQuote.mockResolvedValue(quote);
  api.payMemberDebt.mockResolvedValue({ cashMovements: [{ id: 'movement1' }], balance: '0.00' });
});
describe('Cobro de cuota calculada por el servidor', () => {
  it('muestra plan y periodo, no permite editar importe y actualiza saldo e historial', async () => {
    const invalidate = setup();
    const submit = screen.getByRole('button', { name: 'Confirmar pago' });
    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.getByText('Pase Zen')).toBeVisible();
    expect(screen.getByText('2026-09-01 al 2026-09-30')).toBeVisible();
    expect(screen.queryByLabelText(/Importe recibido/)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    fireEvent.click(submit);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(api.payMemberDebt).toHaveBeenCalledWith('member1', { expectedTotal: '40000.00', paymentMethodId: 'cash1', ledgerVersion: 'ledger1' }, expect.any(String));
    for (const prefix of ['members', 'member-ledger', 'member-payments', 'cash-movements', 'daybook', 'debtors']) expect(invalidate).toHaveBeenCalledWith({ queryKey: [prefix, 'g1'] });
  });
  it('no cobra sin caja abierta', async () => {
    api.getCurrentCashSession.mockResolvedValue(null);
    setup();
    expect(await screen.findByRole('link', { name: 'Ir a caja' })).toHaveAttribute('href', '/cash');
    expect(screen.getByRole('button', { name: 'Confirmar pago' })).toBeDisabled();
    expect(api.payMemberDebt).not.toHaveBeenCalled();
  });
  it('no cobra un socio cuyo saldo ya fue cancelado por otra recepcion', async () => {
    api.getMemberPaymentQuote.mockResolvedValue({ ...quote, balance: '0.00', debt: '0.00', total: '0.00', lines: [] });
    setup();
    expect(await screen.findByText('Este socio no tiene deuda pendiente.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Confirmar pago' })).toBeDisabled();
  });
  it('conserva la clave al reintentar un error de red', async () => {
    api.payMemberDebt.mockRejectedValueOnce(ApiError.network());
    setup();
    const submit = screen.getByRole('button', { name: 'Confirmar pago' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await screen.findByRole('alert');
    fireEvent.click(submit);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(api.payMemberDebt.mock.calls[0]?.[2]).toBe(api.payMemberDebt.mock.calls[1]?.[2]);
  });
  it('bloquea doble envio mientras guarda', async () => {
    api.payMemberDebt.mockImplementation(() => new Promise(() => {}));
    setup();
    const submit = screen.getByRole('button', { name: 'Confirmar pago' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit); fireEvent.click(submit);
    await waitFor(() => expect(api.payMemberDebt).toHaveBeenCalledOnce());
  });
  it('exige actualizar un saldo cambiado antes de reintentar', async () => {
    api.payMemberDebt.mockRejectedValueOnce(new ApiError({ type: 'about:blank', title: 'Conflicto', code: 'CONFLICT', status: 409, detail: 'El saldo cambió.' }));
    setup();
    const submit = screen.getByRole('button', { name: 'Confirmar pago' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await screen.findByText('El saldo cambió.');
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar importe' }));
    await waitFor(() => expect(submit).toBeEnabled());
    expect(api.getMemberPaymentQuote).toHaveBeenCalledTimes(2);
  });
});
