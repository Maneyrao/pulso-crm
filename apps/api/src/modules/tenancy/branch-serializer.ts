import type { Branch as PrismaBranch } from '@pulso/db';

/**
 * Forma de respuesta de `Branch` (`branchSchema` en
 * `packages/contracts/src/tenancy.ts`): todo lo de `PrismaBranch` MENOS
 * `deletedAt`, que el contrato no declara. `createdAt`/`updatedAt` quedan
 * como `Date` — el `DecimalSerializerInterceptor` global los convierte a
 * ISO string en el borde HTTP, mismo patrón que `members/member-serializer.ts`.
 */
export type BranchDto = Omit<PrismaBranch, 'deletedAt'>;

export function serializeBranch(branch: PrismaBranch): BranchDto {
  const { deletedAt: _deletedAt, ...rest } = branch;
  return rest;
}
