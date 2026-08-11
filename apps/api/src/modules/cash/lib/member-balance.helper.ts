import { Prisma } from '@pulso/db';
import { addMoney, subMoney } from '@pulso/config/money';
import { AppError } from '../../../common/errors/app-error.js';

// TODO(integración): unificar con el helper de members cuando exista. El
// módulo `members` (en desarrollo en paralelo) va a exportar su propia forma
// de recalcular el saldo; hasta entonces cash necesita la suya, autocontenida,
// para poder cobrar deuda y dar reintegros sin importar de `modules/members`.

interface MemberBalanceDb {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  member: {
    update(args: {
      where: { id: string };
      data: { balance: Prisma.Decimal };
    }): Promise<{ id: string; balance: Prisma.Decimal }>;
  };
}

/**
 * Aplica un delta al saldo del socio bajo lock (`SELECT ... FOR UPDATE`) y
 * devuelve el saldo resultante.
 *
 * El lock es necesario: dos cobros concurrentes al mismo socio, sin lock,
 * podrían leer el mismo saldo de partida y perder uno de los dos ajustes
 * (lost update). `FOR UPDATE` serializa el acceso a ESA fila puntual sin
 * necesidad de que las dos transacciones colisionen a nivel `SERIALIZABLE`.
 *
 * `direction: 'credit'` suma (el socio pagó, la deuda baja). `'debit'` resta
 * (reintegro o cargo nuevo).
 */
export async function applyMemberBalanceDelta(
  tx: MemberBalanceDb,
  gymId: string,
  memberId: string,
  amount: string,
  direction: 'credit' | 'debit',
): Promise<Prisma.Decimal> {
  const locked = await tx.$queryRaw<{ id: string; balance: Prisma.Decimal }[]>`
    SELECT id, balance FROM members
    WHERE id = ${memberId}::uuid AND "gymId" = ${gymId}::uuid AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  const row = locked[0];
  if (!row) throw AppError.notFound('El socio');

  const currentBalance = decimalToMoneyString(row.balance);
  const nextBalance =
    direction === 'credit' ? addMoney(currentBalance, amount) : subMoney(currentBalance, amount);

  const updated = await tx.member.update({
    where: { id: memberId },
    data: { balance: new Prisma.Decimal(nextBalance) },
  });
  return updated.balance;
}

/**
 * `$queryRaw` puede devolver el `numeric` de Postgres como `Decimal` (driver
 * por defecto) o como string, según el adaptador. Se normaliza acá para no
 * asumir uno de los dos.
 */
function decimalToMoneyString(value: Prisma.Decimal | string | number): string {
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  return new Prisma.Decimal(value).toFixed(2);
}
