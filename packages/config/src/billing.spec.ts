import { describe, expect, it } from 'vitest';
import { quoteEnrollmentPrice } from './billing.js';

describe('quoteEnrollmentPrice', () => {
  it('cobra completo del 1 al 14', () => {
    expect(quoteEnrollmentPrice('40000.00', '2026-08-10')).toMatchObject({
      band: 'FULL',
      total: '40000.00',
    });
  });

  it('cobra 50% del 15 al 20', () => {
    expect(quoteEnrollmentPrice('40000.00', '2026-08-15')).toMatchObject({
      band: 'SECOND_HALF',
      total: '20000.00',
    });
  });

  it('cobra 25% desde el 21 y suma $5.000 sólo por transferencia', () => {
    expect(quoteEnrollmentPrice('40000.00', '2026-08-21', 'TRANSFER')).toMatchObject({
      band: 'FINAL_DAYS',
      proratedAmount: '10000.00',
      transferSurcharge: '5000.00',
      total: '15000.00',
    });
    expect(quoteEnrollmentPrice('40000.00', '2026-08-30', 'MERCADO_PAGO').total).toBe('10000.00');
  });
});
