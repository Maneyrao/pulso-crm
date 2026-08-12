import { Injectable } from '@nestjs/common';
import type { UpdateGymRequest } from '@pulso/contracts/tenancy';
// Import de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService, diff } from '../../common/audit/audit.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { serializeGym } from './gym-serializer.js';

/**
 * `Gym` (API_CONTRACTS §4 "GET/PATCH /gym").
 *
 * `Gym` es un modelo GLOBAL (no tiene `gymId` propio, ver
 * `packages/db/src/tenant-extension.ts` — `GLOBAL_MODELS`), así que la
 * extensión de tenant no lo filtra automáticamente. Por eso todo acceso acá
 * pasa explícitamente `id: ctx.gymId` en el `where`, tomado SIEMPRE de
 * `TenantContextStore` (nunca de un parámetro de ruta: no hay `:id` en este
 * endpoint, opera sobre "mi propio gimnasio").
 */
@Injectable()
export class GymService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get() {
    const ctx = TenantContextStore.require();
    const gym = await this.prisma.client.gym.findUnique({ where: { id: ctx.gymId } });
    if (!gym) throw AppError.notFound('El gimnasio');
    return serializeGym(gym);
  }

  async update(input: UpdateGymRequest) {
    const ctx = TenantContextStore.require();
    const existing = await this.prisma.client.gym.findUnique({ where: { id: ctx.gymId } });
    if (!existing) throw AppError.notFound('El gimnasio');

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.gym.update({ where: { id: ctx.gymId }, data: input });

      const { before, after } = diff(existing, input);
      await this.audit.recordIn(tx, {
        action: 'GYM_UPDATED',
        resourceType: 'Gym',
        resourceId: ctx.gymId,
        before,
        after,
      });

      return row;
    });

    return serializeGym(updated);
  }
}
