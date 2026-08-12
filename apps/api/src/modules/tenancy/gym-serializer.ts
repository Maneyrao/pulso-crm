import type { Gym as PrismaGym } from '@pulso/db';

/**
 * Forma de respuesta de `Gym` (`gymSchema` en
 * `packages/contracts/src/tenancy.ts`): todo lo de `PrismaGym` MENOS
 * `deletedAt`, que el contrato no declara.
 */
export type GymDto = Omit<PrismaGym, 'deletedAt'>;

export function serializeGym(gym: PrismaGym): GymDto {
  const { deletedAt: _deletedAt, ...rest } = gym;
  return rest;
}
