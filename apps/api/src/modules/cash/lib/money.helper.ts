import { isPositiveMoney, isZeroMoney } from '@pulso/config/money';
import { AppError } from '../../../common/errors/app-error.js';

/**
 * Valida que un importe recibido del cliente sea estrictamente positivo.
 *
 * `moneySchema` de `@pulso/contracts` sólo valida el FORMATO ("1500.00"); no
 * rechaza "0.00" ni "-5.00". Esa regla de negocio (importe > 0) vive acá.
 */
export function assertPositiveMoney(amount: string, field = 'amount'): void {
  if (isZeroMoney(amount) || !isPositiveMoney(amount)) {
    throw AppError.validation(
      [{ field, code: 'too_small', message: 'El importe tiene que ser mayor a cero.' }],
      'El importe tiene que ser mayor a cero.',
    );
  }
}
