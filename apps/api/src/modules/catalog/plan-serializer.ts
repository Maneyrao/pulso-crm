import type { Plan as PrismaPlan } from '@pulso/db';

/**
 * Forma de respuesta de `Plan` (`planSchema` en
 * `packages/contracts/src/catalog.ts`): todo lo de `PrismaPlan` MENOS
 * `deletedAt` (no está en el contrato) + los ids de actividades y sedes
 * asociadas, que vienen de las tablas puente `PlanActivity` / `PlanBranch`.
 *
 * `price` queda como `Prisma.Decimal` y el `DecimalSerializerInterceptor` lo
 * convierte a string decimal en el borde HTTP.
 */
export type PlanDto = Omit<PrismaPlan, 'deletedAt'> & {
  activityIds: string[];
  branchIds: string[];
};

export function serializePlan(
  plan: PrismaPlan,
  activityIds: string[],
  branchIds: string[],
): PlanDto {
  const { deletedAt: _deletedAt, ...rest } = plan;
  return { ...rest, activityIds, branchIds };
}
