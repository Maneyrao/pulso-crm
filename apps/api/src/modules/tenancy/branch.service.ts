import { Injectable } from '@nestjs/common';
import type { Prisma } from '@pulso/db';
import { scoped } from '@pulso/db';
import type { CreateBranchRequest, UpdateBranchRequest } from '@pulso/contracts/tenancy';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService, diff } from '../../common/audit/audit.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { isUniqueViolation } from '../../common/db/db-errors.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/**
 * `Branch` (API_CONTRACTS §4 "GET/POST/PATCH/DELETE /branches").
 *
 * `Branch` SÍ es tenant-scoped (`TENANT_SCOPED_MODELS`): toda consulta acá
 * pasa por `this.prisma.client`, que la extensión filtra/inyecta con
 * `gymId` automáticamente (ver `tenant-extension.ts`). Un `findFirst` por
 * `id` de otro gimnasio devuelve `null` — indistinguible de "no existe", que
 * es exactamente la garantía que pide T-2.8 (404 ≡ 403 cross-tenant).
 */
@Injectable()
export class BranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const branches = await this.prisma.client.branch.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return { data: branches };
  }

  async create(input: CreateBranchRequest) {
    const ctx = TenantContextStore.require();
    await this.assertUnderPlanLimit(ctx.gymId);

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.branch.create({
          data: scoped({
            name: input.name.trim(),
            timezone: input.timezone,
            address: input.address ?? null,
            phone: input.phone ?? null,
          }),
        });

        await this.audit.recordIn(tx, {
          action: 'BRANCH_CREATED',
          resourceType: 'Branch',
          resourceId: created.id,
          after: created,
          branchId: created.id,
        });

        return created;
      });
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  async update(id: string, input: UpdateBranchRequest) {
    const existing = await this.prisma.client.branch.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound('La sede');

    const patch: Prisma.BranchUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.address !== undefined) patch.address = input.address;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const updated = await tx.branch.update({ where: { id }, data: patch });

        const { before, after } = diff(existing, patch as Record<string, unknown>);
        await this.audit.recordIn(tx, {
          action: 'BRANCH_UPDATED',
          resourceType: 'Branch',
          resourceId: id,
          before,
          after,
          branchId: id,
        });

        return updated;
      });
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  /** `DELETE /branches/:id` — sólo desactiva (`isActive = false`), nunca borra filas. */
  async deactivate(id: string) {
    const existing = await this.prisma.client.branch.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw AppError.notFound('La sede');

    const [memberCount, openSessionCount] = await Promise.all([
      this.prisma.client.member.count({ where: { branchId: id, deletedAt: null } }),
      this.prisma.client.cashSession.count({ where: { branchId: id, status: 'OPEN' } }),
    ]);
    if (memberCount > 0 || openSessionCount > 0) {
      throw AppError.conflict(
        ErrorCode.BRANCH_HAS_ACTIVE_DATA,
        'La sede tiene socios o una caja abierta. No se puede desactivar hasta resolverlo.',
        { memberCount, openSessionCount },
      );
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.branch.update({ where: { id }, data: { isActive: false } });

      await this.audit.recordIn(tx, {
        action: 'BRANCH_DELETED',
        resourceType: 'Branch',
        resourceId: id,
        before: { isActive: existing.isActive },
        after: { isActive: false },
        branchId: id,
      });

      return updated;
    });
  }

  private async assertUnderPlanLimit(gymId: string): Promise<void> {
    const [gym, activeCount] = await Promise.all([
      this.prisma.client.gym.findUnique({ where: { id: gymId }, include: { saasPlan: true } }),
      this.prisma.client.branch.count({ where: { deletedAt: null, isActive: true } }),
    ]);
    // `Gym` no es tenant-scoped (ver GymService); `gymId` viene del contexto
    // de sesión, no del cliente, así que consultarlo acá es seguro.
    if (gym && activeCount >= gym.saasPlan.maxBranches) {
      throw new AppError(
        ErrorCode.PLAN_LIMIT_REACHED,
        403,
        `El plan actual permite hasta ${gym.saasPlan.maxBranches} sedes activas.`,
        {
          detail: `El plan actual permite hasta ${gym.saasPlan.maxBranches} sedes activas.`,
          meta: { maxBranches: gym.saasPlan.maxBranches, currentActive: activeCount },
        },
      );
    }
  }

  private translateWriteError(err: unknown): unknown {
    if (isUniqueViolation(err)) {
      return AppError.conflict(
        ErrorCode.CONFLICT,
        'Ya existe una sede con ese nombre en este gimnasio.',
      );
    }
    return err;
  }
}
