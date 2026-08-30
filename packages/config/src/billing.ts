import { addMoney, fromCents, normalizeMoney, toCents } from './money.js';

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
 * Precio de alta dentro del mes:
 *  - 1..14: precio completo.
 *  - 15..20: 50%.
 *  - 21..fin de mes: 25%.
 * Transferencia suma $5.000 al resultado, independientemente del plan.
 */
export function quoteEnrollmentPrice(
  baseAmount: string,
  startDate: string,
  paymentMethodCode?: string | null,
): EnrollmentPriceQuote {
  const day = Number(startDate.slice(8, 10));
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`Fecha de inicio inválida: ${startDate}`);
  }
  const base = normalizeMoney(baseAmount);
  const band: EnrollmentPriceBand = day >= 21 ? 'FINAL_DAYS' : day >= 15 ? 'SECOND_HALF' : 'FULL';
  const divisor = band === 'FINAL_DAYS' ? 4n : band === 'SECOND_HALF' ? 2n : 1n;
  const proratedAmount = fromCents((toCents(base) + divisor / 2n) / divisor);
  const transferSurcharge = paymentMethodCode === 'TRANSFER' ? TRANSFER_SURCHARGE : '0.00';
  return {
    band,
    baseAmount: base,
    proratedAmount,
    transferSurcharge,
    total: addMoney(proratedAmount, transferSurcharge),
  };
}

export function enrollmentPriceBandLabel(band: EnrollmentPriceBand): string {
  if (band === 'SECOND_HALF') return 'Alta del 15 al 20: 50% del plan';
  if (band === 'FINAL_DAYS') return 'Alta desde el 21: 25% del plan';
  return 'Alta del 1 al 14: precio completo';
}
