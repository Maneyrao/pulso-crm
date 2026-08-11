import type { PulsoTransactionClient } from '@pulso/db';

/**
 * Asigna el próximo `memberNumber` de un gimnasio.
 *
 * SIEMPRE con `SELECT ... FOR UPDATE` sobre la fila del contador, dentro de la
 * transacción que crea el socio. `MAX(memberNumber) + 1` se rompe bajo
 * concurrencia (dos altas simultáneas leen el mismo MAX y generan el mismo
 * número); el lock de fila serializa exactamente las altas de UN gimnasio,
 * sin bloquear a los demás.
 *
 * No hace falta `SERIALIZABLE` para esto: el lock pesimista sobre la fila del
 * contador ya da la garantía, sin el costo de reintentos por fallo de
 * serialización que trae ese nivel de aislamiento.
 */
export async function nextMemberNumber(tx: PulsoTransactionClient, gymId: string): Promise<number> {
  // La fila del contador la crea `seedMinimalGym`/el alta del gimnasio; este
  // INSERT ... ON CONFLICT DO NOTHING es sólo una red de seguridad para no
  // fallar si por algún motivo no existe todavía.
  await tx.$executeRaw`
    INSERT INTO "member_counters" ("gymId", "last")
    VALUES (${gymId}::uuid, 0)
    ON CONFLICT ("gymId") DO NOTHING
  `;

  const rows = await tx.$queryRaw<{ last: number }[]>`
    SELECT "last" FROM "member_counters" WHERE "gymId" = ${gymId}::uuid FOR UPDATE
  `;
  const next = (rows[0]?.last ?? 0) + 1;

  await tx.$executeRaw`
    UPDATE "member_counters" SET "last" = ${next} WHERE "gymId" = ${gymId}::uuid
  `;

  return next;
}
