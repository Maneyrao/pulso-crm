'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, FormField, Modal, MoneyDisplay, Select, useToast } from '@pulso/ui';
import { getCurrentCashSession, listPaymentMethods } from '@/lib/api/cash';
import { getMemberPaymentQuote, payMemberDebt } from '@/lib/api/members';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/** Mount only while open: one collection attempt, one idempotency key. */
export function MemberPaymentDialog({ member, onClose }: {
  member: { id: string; firstName: string; lastName: string; balance: string };
  onClose: () => void;
}) {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const client = useQueryClient();
  const { toast } = useToast();
  const attempt = useIdempotencyKey();
  const [methodId, setMethodId] = React.useState('');
  const locked = React.useRef(false);
  const session = useQuery({ queryKey: qk.cashSession(gymId, branchId), queryFn: getCurrentCashSession });
  const methods = useQuery({ queryKey: qk.paymentMethods(gymId), queryFn: listPaymentMethods });
  const allowedMethods = (methods.data?.data ?? []).filter((m) => m.isActive && ['CASH', 'QR', 'MERCADO_PAGO', 'MERCADOPAGO', 'TRANSFER'].includes(m.code));
  const selectedMethod = methodId || allowedMethods.find((m) => m.code === 'CASH')?.id || allowedMethods[0]?.id || '';
  const quote = useQuery({
    queryKey: ['member-payment-quote', gymId, member.id, selectedMethod],
    queryFn: () => getMemberPaymentQuote(member.id, selectedMethod), enabled: !!selectedMethod,
    staleTime: 0,
  });
  const mutation = useMutation({
    mutationFn: () => {
      if (!quote.data) throw new Error('No se pudo calcular el cobro.');
      return payMemberDebt(member.id, { paymentMethodId: selectedMethod, expectedTotal: quote.data.total, ledgerVersion: quote.data.ledgerVersion }, attempt.getKey());
    },
    onSuccess: async () => {
      for (const prefix of ['members', 'member', 'member-ledger', 'member-payments', 'member-payment-quote', 'debtors', 'cash-session', 'cash-movements', 'daybook', 'dashboard']) {
        await client.invalidateQueries({ queryKey: [prefix, gymId] });
      }
      toast({ title: 'Pago registrado', tone: 'success' });
      onClose();
    },
    onSettled: () => { locked.current = false; },
  });
  const loading = session.isPending || methods.isPending || (!!selectedMethod && quote.isPending);
  const failed = session.isError || methods.isError || quote.isError;
  const valid = !!quote.data && Number(quote.data.total) > 0 && !!selectedMethod;
  const stale = mutation.error instanceof ApiError && mutation.error.status === 409;
  const disabled = !valid || loading || failed || quote.isFetching || !session.data || mutation.isPending || stale;
  function refresh() {
    attempt.renew(); mutation.reset();
    void session.refetch(); void methods.refetch(); void quote.refetch();
  }
  return (
    <Modal open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }} title="Pagar cuota pendiente" footer={
      <>
        <Button variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="member-payment" loading={mutation.isPending} disabled={disabled}>Confirmar pago</Button>
      </>
    }>
      <form id="member-payment" className="flex flex-col gap-4" onSubmit={(event) => {
        event.preventDefault();
        if (disabled || locked.current) return;
        locked.current = true; mutation.mutate();
      }}>
        <p className="font-semibold">{member.firstName} {member.lastName}</p>
        {loading && <p role="status">Calculando cuota...</p>}
        {failed && <div role="alert">No pudimos consultar el cobro. <Button variant="outline" onClick={refresh}>Reintentar</Button></div>}
        {!loading && !failed && !session.data && <p role="alert">Necesitás abrir tu caja. <Link className="underline" href="/cash">Ir a caja</Link></p>}
        <FormField label="Medio de pago" required>{(field) => <Select {...field} disabled={mutation.isPending} value={selectedMethod} onValueChange={(v) => { setMethodId(v); attempt.renew(); mutation.reset(); }} options={allowedMethods.map((m) => ({ value: m.id, label: m.code === 'QR' ? 'Mercado Pago' : m.name }))} placeholder="Elegí un medio" />}</FormField>
        {!loading && !methods.isError && allowedMethods.length === 0 && <p role="alert">No hay medios de pago habilitados. Revisá la configuración de caja.</p>}
        {quote.data && !quote.isFetching && <div className="divide-y divide-(--color-border)">
          {quote.data.lines.map((line, index) => <div key={line.membershipId ?? index} className="flex flex-wrap items-start justify-between gap-2 py-3">
            <div><p className="font-medium">{line.label}</p>{line.startDate && <p className="text-sm text-(--color-muted)">{line.startDate} al {line.endDate ?? 'sin vencimiento'}</p>}</div>
            <MoneyDisplay value={line.amount} />
          </div>)}
          {Number(quote.data.surcharge) > 0 && <p className="flex flex-wrap justify-between gap-2 py-3">Recargo por transferencia <MoneyDisplay value={quote.data.surcharge} /></p>}
          <p className="flex items-center justify-between gap-2 pt-4 text-lg font-semibold">Total a cobrar <MoneyDisplay value={quote.data.total} /></p>
          {Number(quote.data.debt) === 0 && <p role="status" className="pt-3">Este socio no tiene deuda pendiente.</p>}
        </div>}
        {mutation.isError && <div role="alert"><p>{mutation.error instanceof ApiError ? mutation.error.detail ?? mutation.error.message : 'No pudimos confirmar el pago. Reintentá para verificar el resultado sin duplicarlo.'}</p>{stale && <Button variant="outline" onClick={refresh}>Actualizar importe</Button>}</div>}
      </form>
    </Modal>
  );
}
