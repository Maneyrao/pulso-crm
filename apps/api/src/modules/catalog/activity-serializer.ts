import type { Activity as PrismaActivity } from '@pulso/db';

/**
 * Forma de respuesta de `Activity` (`activitySchema` en
 * `packages/contracts/src/catalog.ts`): todo lo de `PrismaActivity` MENOS
 * `deletedAt`, que el contrato no declara. `createdAt`/`updatedAt` quedan
 * como `Date`; el `DecimalSerializerInterceptor` global los convierte a ISO
 * en el borde HTTP (mismo patrón que `tenancy/branch-serializer.ts`).
 */
export type ActivityDto = Omit<PrismaActivity, 'deletedAt'>;

export function serializeActivity(activity: PrismaActivity): ActivityDto {
  const { deletedAt: _deletedAt, ...rest } = activity;
  return rest;
}
