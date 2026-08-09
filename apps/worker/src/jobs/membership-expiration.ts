import { toBusinessDate } from '@pulso/config';
import type { PrismaClient } from '@pulso/db';
import type { Logger } from 'pino';

/**
 * Vencimiento de membresías (ADR-021).
 *
 * Corre a diario. Lo delicado acá no es la consulta sino la zona horaria: una
 * membresía que vence hoy sigue siendo válida hasta las 23:59 EN LA SEDE. Si el
 * job comparara contra `now()` en UTC, a las 21:00 de Argentina empezaría a
 * rechazar gente que todavía tiene derecho a entrar.
 *
 * Por eso se agrupa por sede y se compara contra el día de negocio de cada una.
 */

export interface ExpirationDeps {
  prisma: PrismaClient;
  logger: Logger;
  /** Instante de referencia. Inyectable para poder testear bordes de DST. */
  now?: Date;
}

export interface ExpirationResult {
  branchesProcessed: number;
  membershipsExpired: number;
}

export async function expireMemberships(deps: ExpirationDeps): Promise<ExpirationResult> {
  const { prisma, logger } = deps;
  const now = deps.now ?? new Date();

  const branches = await prisma.branch.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, gymId: true, timezone: true },
  });

  // Varias sedes suelen compartir zona horaria; se agrupan para no repetir el
  // mismo UPDATE una vez por sede.
  const byTimezone = new Map<string, { gymId: string; branchId: string }[]>();
  for (const b of branches) {
    const list = byTimezone.get(b.timezone) ?? [];
    list.push({ gymId: b.gymId, branchId: b.id });
    byTimezone.set(b.timezone, list);
  }

  let expired = 0;

  for (const [timezone, group] of byTimezone) {
    const businessDate = toBusinessDate(now, timezone);
    const gymIds = [...new Set(group.map((g) => g.gymId))];

    // Vence la membresía cuyo endDate ya PASÓ. Una que termina hoy sigue activa.
    const result = await prisma.membership.updateMany({
      where: {
        gymId: { in: gymIds },
        status: 'ACTIVE',
        endDate: { not: null, lt: new Date(`${businessDate}T00:00:00.000Z`) },
      },
      data: { status: 'EXPIRED' },
    });

    expired += result.count;

    if (result.count > 0) {
      logger.info(
        { timezone, businessDate, count: result.count },
        'Membresías marcadas como vencidas',
      );
    }
  }

  // Los packs de clases no vencen por fecha sino por consumo.
  const exhausted = await prisma.membership.updateMany({
    where: { status: 'ACTIVE', endDate: null, classesRemaining: 0 },
    data: { status: 'EXPIRED' },
  });
  expired += exhausted.count;

  return { branchesProcessed: branches.length, membershipsExpired: expired };
}
