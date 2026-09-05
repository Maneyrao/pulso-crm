import { addMoney, normalizeMoney } from './money.js';

export const TRANSFER_SURCHARGE = '5000.00';

export type EnrollmentPriceBand = 'FULL' | 'SECOND_HALF' | 'FINAL_DAYS';

export interface EnrollmentPriceQuote {
  band: EnrollmentPriceBand;
  baseAmount: string;
  proratedAmount: string;
  transferSurcharge: string;
  total: string;
}

/**
 * Nuevas operaciones: precio completo del plan en cualquier fecha.
 * Se conserva el shape del quote; no recalcula importes historicos.
 * Transferencia suma $5.000; Mercado Pago es independiente.
 */
export function quoteEnrollmentPrice(
  baseAmount: string,
  startDate: string,
  paymentMethodCode?: string | null,
): EnrollmentPriceQuote {
  parseBillingDate(startDate);
  const base = normalizeMoney(baseAmount);
  const proratedAmount = base;
  const transferSurcharge = paymentMethodCode === 'TRANSFER' ? TRANSFER_SURCHARGE : '0.00';
  return {
    band: 'FULL',
    baseAmount: base,
    proratedAmount,
    transferSurcharge,
    total: addMoney(proratedAmount, transferSurcharge),
  };
}

export function enrollmentPriceBandLabel(band: EnrollmentPriceBand): string {
  if (band === 'SECOND_HALF') return 'Alta del 15 al 20: 50% del plan';
  if (band === 'FINAL_DAYS') return 'Alta desde el 21: 25% del plan';
  return 'Precio completo del plan';
}

function parseBillingDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Fecha de inicio invalida: ${value}`);
  }
  return date;
}

function anchoredDate(year: number, month: number, anchorDay: number): string {
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new Error('El dia de anclaje debe estar entre 1 y 31.');
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchorDay, lastDay))).toISOString().slice(0, 10);
}

/** Conserva el ancla original: 31/01 -> 28/02 -> 31/03. */
export function nextMonthlyDate(startDate: string, anchorDay?: number): string {
  const start = parseBillingDate(startDate);
  return anchoredDate(
    start.getUTCFullYear(),
    start.getUTCMonth() + 1,
    anchorDay ?? start.getUTCDate(),
  );
}

/** Primera fecha anclada estrictamente futura; habilitar no genera deuda hoy. */
export function nextMonthlyDateAfter(today: string, anchorDay: number): string {
  const date = parseBillingDate(today);
  const candidate = anchoredDate(date.getUTCFullYear(), date.getUTCMonth(), anchorDay);
  return candidate > today ? candidate : nextMonthlyDate(today, anchorDay);
}

export function monthlyEndDate(startDate: string, anchorDay?: number): string {
  const end = parseBillingDate(nextMonthlyDate(startDate, anchorDay));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}
