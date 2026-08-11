import { Prisma } from '@pulso/db';
import { AppError } from '../../../common/errors/app-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';

/**
 * Traduce violaciones de constraints de Postgres a `AppError` con buen
 * mensaje.
 *
 * El `GlobalExceptionFilter` (común a toda la API) ya hace esta traducción
 * como red de seguridad para cualquier error que se le escape a un módulo.
 * Acá se hace la MISMA traducción para los constraints de caja, porque los
 * tests de este módulo llaman a los servicios directo (sin pasar por el
 * filtro HTTP) y necesitan recibir el `AppError` correcto, no el error crudo
 * de Postgres. Duplicar esta traducción es preferible a que el test dependa
 * de una capa que no está ejercitando.
 */
export function translateCashConstraintError(err: unknown): AppError | null {
  const message = messageOf(err);
  if (!message) return null;

  if (message.includes('cash_sessions_one_open_per_register')) {
    return AppError.conflict(ErrorCode.CASH_REGISTER_BUSY, 'Esa caja ya tiene una sesión abierta.');
  }
  if (message.includes('cash_sessions_one_open_per_user')) {
    return AppError.conflict(
      ErrorCode.USER_HAS_OPEN_SESSION,
      'Ya tenés una caja abierta. Cerrala antes de abrir otra.',
    );
  }
  if (message.includes('cash_movements_reversalOfId_key') || message.includes('reversalOfId')) {
    return AppError.conflict(ErrorCode.MOVEMENT_ALREADY_REVERSED, 'Ese movimiento ya fue revertido.');
  }
  if (message.includes('cash_movements_amount_positive')) {
    return AppError.unprocessable(ErrorCode.VALIDATION_ERROR, 'El importe tiene que ser mayor a cero.');
  }
  if (message.includes('append-only') || message.includes('inmutable')) {
    return AppError.conflict(ErrorCode.CONFLICT, 'Ese registro es inmutable. Corregilo con una reversa.');
  }
  if (message.includes('_gymId_code_key') || message.includes('_gymId_branchId_name_key')) {
    return AppError.conflict(ErrorCode.CONFLICT, 'Ya existe un registro con ese código.');
  }

  return null;
}

function messageOf(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const target = err.meta?.['target'];
    return `${err.message} ${Array.isArray(target) ? target.join(',') : String(target ?? '')}`;
  }
  if (err instanceof Error) return err.message;
  return '';
}
