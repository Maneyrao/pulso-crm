import { Prisma } from '@pulso/db';
import type { PulsoPrismaClient, PulsoTransactionClient } from '@pulso/db';
import { AppError } from '../../../common/errors/app-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';

/**
 * Corre una función dentro de una transacción `SERIALIZABLE` y traduce el
 * error de serialización de Postgres (40001 / Prisma P2034) a un 409 en vez
 * de dejarlo llegar como 500 (ADR-010, regla dura del brief).
 *
 * No reintenta: un reintento automático escondería un problema real de
 * locking. El cliente decide si reintenta, con la misma `Idempotency-Key`
 * si la operación es idempotente.
 */
export async function runSerializable<T>(
  client: PulsoPrismaClient,
  fn: (tx: PulsoTransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await client.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (err) {
    throw translateTransactionError(err);
  }
}

/** Códigos de error de Postgres que indican una carrera perdida, no un bug. */
const SERIALIZATION_FAILURE_SQLSTATE = '40001';
const DEADLOCK_DETECTED_SQLSTATE = '40P01';

export function translateTransactionError(err: unknown): unknown {
  if (err instanceof AppError) return err;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: "Transaction failed due to a write conflict or a deadlock.
    // Please retry your transaction" — es exactamente el 40001/40P01 de
    // Postgres, ya traducido por Prisma.
    if (err.code === 'P2034') {
      return AppError.conflict(
        ErrorCode.CONFLICT,
        'Otra operación tocó los mismos datos al mismo tiempo. Reintentá.',
      );
    }
  }

  const message = messageOf(err);
  if (
    message.includes(SERIALIZATION_FAILURE_SQLSTATE) ||
    message.includes(DEADLOCK_DETECTED_SQLSTATE)
  ) {
    return AppError.conflict(
      ErrorCode.CONFLICT,
      'Otra operación tocó los mismos datos al mismo tiempo. Reintentá.',
    );
  }

  return err;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
