import type { PaymentMethod } from '@pulso/contracts/cash';

export const PAYMENT_OPTIONS = [
  { value: 'CASH', label: 'Efectivo' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'QR', label: 'Mercado Pago' },
] as const;
const OPERATING_CODES = new Set<string>(PAYMENT_OPTIONS.map((option) => option.value));

export function operatingPaymentMethods(methods: readonly PaymentMethod[]): PaymentMethod[] {
  return methods.filter((method) => method.isActive && OPERATING_CODES.has(method.code.toUpperCase()));
}

export function paymentMethodLabel(method: PaymentMethod): string {
  const code = method.code.toUpperCase();
  if (code === 'CASH') return 'Efectivo';
  if (code === 'TRANSFER') return 'Transferencia';
  if (code === 'QR') return 'Mercado Pago';
  return method.name;
}
