import { describe, expect, it } from 'vitest';
import {
  monthlyEndDate,
  nextMonthlyDate,
  nextMonthlyDateAfter,
  quoteEnrollmentPrice,
} from './billing.js';

describe('quoteEnrollmentPrice', () => {
  it('cobra completo del 1 al 14', () => {
    expect(quoteEnrollmentPrice('40000.00', '2026-08-10')).toMatchObject({
      band: 'FULL',
      total: '40000.00',
    });
  });

  it('nuevo requisito: cobra completo tambien del 15 al 20', () => {
    expect(quoteEnrollmentPrice('40000.00', '2026-08-15')).toMatchObject({
      band: 'FULL',
      total: '40000.00',
    });
  });

  it('nuevo requisito: cobra completo desde el 21 y suma $5.000 solo por transferencia', () => {
    expect(quoteEnrollmentPrice('40000.00', '2026-08-21', 'TRANSFER')).toMatchObject({
      band: 'FULL',
      proratedAmount: '40000.00',
      transferSurcharge: '5000.00',
      total: '45000.00',
    });
    expect(quoteEnrollmentPrice('40000.00', '2026-08-30', 'MERCADO_PAGO').total).toBe('40000.00');
  });

  it.each(['2026-02-30', 'invalid', '2026-13-01'])('rechaza fecha invalida %s', (date) => {
    expect(() => quoteEnrollmentPrice('100.01', date)).toThrow();
  });
  it('conserva centavos sin redondeos de prorrateo', () => {
    expect(quoteEnrollmentPrice('100.01', '2026-09-30').total).toBe('100.01');
  });
});

describe('periodos mensuales fecha a fecha', () => {
  it.each([
    ['2026-09-01', '2026-09-30', '2026-10-01'],
    ['2026-01-31', '2026-02-27', '2026-02-28'],
    ['2028-01-31', '2028-02-28', '2028-02-29'],
    ['2026-12-15', '2027-01-14', '2027-01-15'],
  ])('%s -> %s inclusive, siguiente %s', (start, end, next) => {
    expect(monthlyEndDate(start)).toBe(end);
    expect(nextMonthlyDate(start)).toBe(next);
  });
  it('recupera dia 31 despues de febrero', () => {
    expect(nextMonthlyDate('2026-02-28', 31)).toBe('2026-03-31');
    expect(monthlyEndDate('2026-02-28', 31)).toBe('2026-03-30');
    expect(nextMonthlyDate('2026-04-30', 31)).toBe('2026-05-31');
  });
  it('habilitar vencida agenda una fecha estrictamente futura', () => {
    expect(nextMonthlyDateAfter('2026-09-04', 15)).toBe('2026-09-15');
    expect(nextMonthlyDateAfter('2026-09-15', 15)).toBe('2026-10-15');
    expect(nextMonthlyDateAfter('2026-02-28', 31)).toBe('2026-03-31');
  });
  it.each([0, 32, 1.5])('rechaza ancla invalida %s', (anchor) => {
    expect(() => nextMonthlyDate('2026-09-01', anchor)).toThrow();
  });
});
