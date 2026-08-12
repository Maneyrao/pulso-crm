import { Injectable } from '@nestjs/common';
import type { Prisma } from '@pulso/db';
import { scoped } from '@pulso/db';
import type { CreateActivityRequest, UpdateActivityRequest } from '@pulso/contracts/catalog';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService, diff } from '../../common/audit/audit.service.js';
import { isUniqueViolation } from '../../common/db/db-errors.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { serializeActivity, type ActivityDto } from './activity-serializer.js';

/**
 * `Activity` (API_CONTRACTS §7 "Catálogo").
 *
 * `Activity` es tenant-scoped (`TENANT_SCOPED_MODELS`): toda consulta acá
 * pasa por `this.prisma.client`, que la extensión filtra/inyecta con
 * `gymId` automáticamente. Un `findFirst` por `id` de otro gimnasio devuelve
 * `null` — indistinguible de "no existe", como pide T-2.8.
 *
 * El unique compuesto `(gymId, name)` está declarado como índice único
 * PARCIAL en SQL (`where deletedAt is null`, ver migración base). La
 * violación se traduce a 409 `CONFLICT` con el mismo criterio que branches.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const activities = await this.prisma.client.activity.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return { data: activities.map(serializeActivity) };
  }

  async create(input: CreateActivityRequest): Promise<ActivityDto> {
    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        const row = await tx.activity.create({
          data: scoped({
            name: input.name.trim(),
            description: input.description ?? null,
            color: input.color ?? null,
          }),
        });

        await this.audit.recordIn(tx, {
          action: 'ACTIVITY_CREATED',
          resourceType: 'Activity',
          resourceId: row.id,
          after: row,
        });

        return row;
      });

      return serializeActivity(created);
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  async update(id: string, input: UpdateActivityRequest): Promise<ActivityDto> {
    const existing = await this.prisma.client.activity.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw AppError.notFound('La actividad');

    const patch: Prisma.ActivityUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) patch.description = input.description;
    if (input.color !== undefined) patch.color = input.color;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        const row = await tx.activity.update({ where: { id }, data: patch });

        const { before, after } = diff(
          existing as unknown as Record<string, unknown>,
          patch as Record<string, unknown>,
        );
        await this.audit.recordIn(tx, {
          action: 'ACTIVITY_UPDATED',
          resourceType: 'Activity',
          resourceId: id,
          before,
          after,
        });

        return row;
      });

      return serializeActivity(updated);
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  private translateWriteError(err: unknown): unknown {
    if (isUniqueViolation(err)) {
      return AppError.conflict(
        ErrorCode.CONFLICT,
        'Ya existe una actividad con ese nombre en este gimnasio.',
      );
    }
    return err;
  }
}
