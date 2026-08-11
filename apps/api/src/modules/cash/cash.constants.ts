/**
 * Constantes del módulo de caja.
 *
 * `LARGE_EXPENSE_THRESHOLD` debería terminar siendo configurable por gimnasio
 * (una columna en `Gym` o una fila de configuración); como esa superficie no
 * existe todavía, queda como constante acá. Cambiarlo es un cambio de una
 * línea cuando se implemente esa configuración.
 */
export const LARGE_EXPENSE_THRESHOLD = '50000.00';

/**
 * Conceptos de sistema que el módulo necesita para poder cobrar deuda y dar
 * reintegros aunque el gimnasio todavía no haya configurado sus propios
 * conceptos. Se crean de forma perezosa (idempotente) la primera vez que
 * hacen falta — ver `lib/system-concepts.ts`.
 */
export const SYSTEM_CASH_CONCEPTS = {
  DEBT_PAYMENT: {
    code: 'DEBT_PAYMENT',
    name: 'Pago de cuenta corriente',
    type: 'INCOME',
  },
  REFUND: {
    code: 'REFUND',
    name: 'Reintegro a socio',
    type: 'EXPENSE',
  },
} as const;
