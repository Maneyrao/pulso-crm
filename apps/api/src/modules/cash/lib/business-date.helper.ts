import { DEFAULT_TIMEZONE, toBusinessDate } from '@pulso/config/time';
import type { Prisma, PulsoPrismaClient } from '@pulso/db';

/**
 * Estructuralmente compatible con el cliente normal y con el de una
 * transacción en curso: sólo se usa `branch.findUnique`.
 */
interface BranchReader {
  branch: {
    findUnique(args: { where: { id: string } }): Promise<{ timezone: string } | null>;
  };
}

/**
 * Zona horaria de una sede (ADR-021). El día de negocio SIEMPRE se calcula
 * con la zona de la SEDE, nunca UTC ni la del servidor.
 */
export async function getBranchTimezone(
  db: BranchReader | PulsoPrismaClient | Prisma.TransactionClient,
  branchId: string,
): Promise<string> {
  const branch = await (db as BranchReader).branch.findUnique({ where: { id: branchId } });
  return branch?.timezone ?? DEFAULT_TIMEZONE;
}

export { toBusinessDate, DEFAULT_TIMEZONE };
