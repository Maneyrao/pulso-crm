import type { Prisma, PulsoTransactionClient } from '@pulso/db';
import { AppError } from '../../../common/errors/app-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';

/**
 * Estructuralmente compatible con el cliente extendido y el de una
 * transacción en curso: sólo se usa `cashSession.findFirst`.
 */
interface SessionReader {
  cashSession: {
    findFirst(args: {
      where: {
        openedByUserId: string;
        status: 'OPEN';
        branchId?: string;
      };
    }): Promise<{
      id: string;
      gymId: string;
      branchId: string;
      cashRegisterId: string;
    } | null>;
  };
}

export interface OpenSessionSummary {
  id: string;
  gymId: string;
  branchId: string;
  cashRegisterId: string;
}

/**
 * Busca la sesión OPEN del usuario en la sede indicada (o en cualquier sede
 * si `branchId` es `undefined`). Devuelve `null` si no hay ninguna.
 *
 * El índice parcial `cash_sessions_one_open_per_user` garantiza que como
 * máximo hay una sesión OPEN por (gymId, userId): no hay ambigüedad.
 */
export async function findOpenSessionForUser(
  db: SessionReader | PulsoTransactionClient | Prisma.TransactionClient,
  userId: string,
  branchId?: string,
): Promise<OpenSessionSummary | null> {
  return (db as SessionReader).cashSession.findFirst({
    where: {
      openedByUserId: userId,
      status: 'OPEN',
      ...(branchId ? { branchId } : {}),
    },
  });
}

/**
 * Igual que `findOpenSessionForUser` pero lanza 409 `NO_OPEN_CASH_SESSION` si
 * no hay una. Para endpoints que exigen caja abierta (create movement,
 * reverse, membership mode NOW).
 */
export async function requireOpenSessionForUser(
  db: SessionReader | PulsoTransactionClient | Prisma.TransactionClient,
  userId: string,
  branchId?: string,
): Promise<OpenSessionSummary> {
  const session = await findOpenSessionForUser(db, userId, branchId);
  if (!session) {
    throw AppError.conflict(
      ErrorCode.NO_OPEN_CASH_SESSION,
      'No tenés una caja abierta. Abrí una antes de cobrar.',
    );
  }
  return session;
}
