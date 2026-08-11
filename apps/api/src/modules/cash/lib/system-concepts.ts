import type { Prisma } from '@pulso/db';
import { SYSTEM_CASH_CONCEPTS } from '../cash.constants.js';

interface ConceptReader {
  cashConcept: {
    findFirst(args: { where: { code: string } }): Promise<{ id: string } | null>;
    create(args: {
      data: { code: string; name: string; type: 'INCOME' | 'EXPENSE'; isSystem: true };
    }): Promise<{ id: string }>;
  };
}

/**
 * Busca (o crea, la primera vez) el `CashConcept` de sistema que necesitan
 * `pay-debt` y `refund` para funcionar sin depender de que alguien haya
 * configurado los conceptos del gimnasio a mano.
 *
 * Idempotente ante la carrera: si dos requests concurrentes lo crean a la
 * vez, uno choca contra `unique(gymId, code)` y simplemente relee.
 */
export async function ensureSystemConcept(
  db: ConceptReader | Prisma.TransactionClient,
  key: keyof typeof SYSTEM_CASH_CONCEPTS,
): Promise<{ id: string }> {
  const spec = SYSTEM_CASH_CONCEPTS[key];
  const reader = db as ConceptReader;

  const existing = await reader.cashConcept.findFirst({ where: { code: spec.code } });
  if (existing) return existing;

  try {
    return await reader.cashConcept.create({
      data: { code: spec.code, name: spec.name, type: spec.type, isSystem: true },
    });
  } catch {
    const created = await reader.cashConcept.findFirst({ where: { code: spec.code } });
    if (created) return created;
    throw new Error(`No se pudo crear ni encontrar el concepto de sistema ${spec.code}.`);
  }
}
