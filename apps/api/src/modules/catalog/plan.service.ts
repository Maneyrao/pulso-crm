import { Injectable } from '@nestjs/common';
import type { Prisma } from '@pulso/db';
import { scoped } from '@pulso/db';
import type { CreatePlanRequest, UpdatePlanRequest } from '@pulso/contracts/catalog';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService, diff } from '../../common/audit/audit.service.js';
import { isUniqueViolation } from '../../common/db/db-errors.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { serializePlan, type PlanDto } from './plan-serializer.js';

/**
 * `Plan` (API_CONTRACTS §7 "Catálogo").
 *
 * Un plan agrupa actividades habilitadas y — opcionalmente — sedes donde se
 * puede usar. Las relaciones viven en las tablas puente `PlanActivity` y
 * `PlanBranch`, ambas tenant-scoped (`TENANT_SCOPED_MODELS`): la extensión
 * inyecta `gymId` automáticamente, y los ids de actividades/sedes que llegan
 * en el body se validan a través del cliente scoped — un id ajeno se ve
 * como inexistente y responde 404 (API_CONTRACTS §1.3).
 *
 * Alta y edición corren dentro de una única transacción: el plan y sus
 * tablas puente se ven consistentes o ninguna. La edición resincroniza las
 * puentes con `deleteMany` + `createMany` (`onDelete: Cascade`, no hay FKs
 * saliendo de las tablas puente).
 *
 * `DELETE /plans/:id` es soft-delete lógico (`isActive: false`), nunca borra
 * la fila: hay `Membership.planId` con `onDelete: Restrict` y `pricePaid`
 * congelado — la historia contable exige que el plan siga existiendo. Si
 * hay membresías `ACTIVE`, ni siquiera se desactiva: 409 `PLAN_IN_USE`.
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.client.plan.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        activities: { select: { activityId: true } },
        branches: { select: { branchId: true } },
      },
    });

    return {
      data: rows.map((row) =>
        serializePlan(
          row,
          row.activities.map((a) => a.activityId),
          row.branches.map((b) => b.branchId),
        ),
      ),
    };
  }

  async create(input: CreatePlanRequest): Promise<PlanDto> {
    // Validación cross-tenant ANTES de abrir la transacción: la lectura ya
    // sale scoped por tenant, así que un id ajeno responde 404. Se hace acá
    // arriba para que el error salga limpio en vez de reventar en el
    // `createMany` con una FK con un id "inexistente".
    const activityIds = await this.resolveActivityIds(input.activityIds);
    const branchIds = await this.resolveBranchIds(input.branchIds);

    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        const plan = await tx.plan.create({
          data: scoped({
            name: input.name.trim(),
            description: input.description ?? null,
            price: input.price,
            billingCycle: input.billingCycle,
            durationDays: input.durationDays ?? null,
            classesIncluded: input.classesIncluded ?? null,
            weeklyAccessLimit: input.weeklyAccessLimit ?? null,
          }),
        });

        // `createMany` de NIVEL SUPERIOR (mismo motivo que
        // `iam/user.service.ts`): la extensión de tenant sólo inyecta
        // `gymId` en operaciones top-level sobre modelos tenant-scoped, no
        // en creates anidados dentro de un `plan.create`.
        if (activityIds.length > 0) {
          await tx.planActivity.createMany({
            data: activityIds.map((activityId) => scoped({ planId: plan.id, activityId })),
          });
        }
        if (branchIds.length > 0) {
          await tx.planBranch.createMany({
            data: branchIds.map((branchId) => scoped({ planId: plan.id, branchId })),
          });
        }

        await this.audit.recordIn(tx, {
          action: 'PLAN_CREATED',
          resourceType: 'Plan',
          resourceId: plan.id,
          after: { ...plan, activityIds, branchIds },
        });

        return plan;
      });

      return serializePlan(created, activityIds, branchIds);
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  async update(id: string, input: UpdatePlanRequest): Promise<PlanDto> {
    const existing = await this.prisma.client.plan.findFirst({
      where: { id, deletedAt: null },
      include: {
        activities: { select: { activityId: true } },
        branches: { select: { branchId: true } },
      },
    });
    if (!existing) throw AppError.notFound('El plan');

    const activityIds =
      input.activityIds !== undefined
        ? await this.resolveActivityIds(input.activityIds)
        : undefined;
    const branchIds =
      input.branchIds !== undefined ? await this.resolveBranchIds(input.branchIds) : undefined;

    const patch: Prisma.PlanUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) patch.description = input.description;
    if (input.price !== undefined) patch.price = input.price;
    if (input.durationDays !== undefined) patch.durationDays = input.durationDays;
    if (input.classesIncluded !== undefined) patch.classesIncluded = input.classesIncluded;
    if (input.weeklyAccessLimit !== undefined) patch.weeklyAccessLimit = input.weeklyAccessLimit;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    try {
      const { plan, finalActivityIds, finalBranchIds } = await this.prisma.client.$transaction(
        async (tx) => {
          if (Object.keys(patch).length > 0) {
            await tx.plan.update({ where: { id }, data: patch });
          }

          if (activityIds !== undefined) {
            await tx.planActivity.deleteMany({ where: { planId: id } });
            if (activityIds.length > 0) {
              await tx.planActivity.createMany({
                data: activityIds.map((activityId) => scoped({ planId: id, activityId })),
              });
            }
          }
          if (branchIds !== undefined) {
            await tx.planBranch.deleteMany({ where: { planId: id } });
            if (branchIds.length > 0) {
              await tx.planBranch.createMany({
                data: branchIds.map((branchId) => scoped({ planId: id, branchId })),
              });
            }
          }

          const row = await tx.plan.findUniqueOrThrow({
            where: { id },
            include: {
              activities: { select: { activityId: true } },
              branches: { select: { branchId: true } },
            },
          });

          const finalActivity = row.activities.map((a) => a.activityId);
          const finalBranch = row.branches.map((b) => b.branchId);

          const { before, after } = diff(
            existing as unknown as Record<string, unknown>,
            patch as Record<string, unknown>,
          );
          if (activityIds !== undefined) {
            before['activityIds'] = existing.activities.map((a) => a.activityId);
            after['activityIds'] = finalActivity;
          }
          if (branchIds !== undefined) {
            before['branchIds'] = existing.branches.map((b) => b.branchId);
            after['branchIds'] = finalBranch;
          }
          await this.audit.recordIn(tx, {
            action: 'PLAN_UPDATED',
            resourceType: 'Plan',
            resourceId: id,
            before,
            after,
          });

          return { plan: row, finalActivityIds: finalActivity, finalBranchIds: finalBranch };
        },
      );

      return serializePlan(plan, finalActivityIds, finalBranchIds);
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  /**
   * `DELETE /plans/:id` — SOLO desactiva (`isActive = false`), nunca borra
   * la fila: `Membership.planId` es `onDelete: Restrict` porque el precio
   * de la membresía está congelado en el momento de la venta y su historia
   * contable exige que el plan siga existiendo.
   *
   * Si el plan tiene alguna membresía `ACTIVE`, ni siquiera se desactiva:
   * 409 `PLAN_IN_USE` — vender un plan y desactivarlo al mismo tiempo
   * dejaría las membresías vigentes sin plan visible en la UI.
   */
  async deactivate(id: string): Promise<PlanDto> {
    const existing = await this.prisma.client.plan.findFirst({
      where: { id, deletedAt: null },
      include: {
        activities: { select: { activityId: true } },
        branches: { select: { branchId: true } },
      },
    });
    if (!existing) throw AppError.notFound('El plan');

    const activeMembershipCount = await this.prisma.client.membership.count({
      where: { planId: id, status: 'ACTIVE' },
    });
    if (activeMembershipCount > 0) {
      throw AppError.conflict(
        ErrorCode.PLAN_IN_USE,
        'El plan tiene membresías activas. Cancelalas o esperá a que expiren antes de desactivar el plan.',
        { activeMembershipCount },
      );
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.plan.update({ where: { id }, data: { isActive: false } });

      await this.audit.recordIn(tx, {
        action: 'PLAN_DEACTIVATED',
        resourceType: 'Plan',
        resourceId: id,
        before: { isActive: existing.isActive },
        after: { isActive: false },
      });

      return row;
    });

    return serializePlan(
      updated,
      existing.activities.map((a) => a.activityId),
      existing.branches.map((b) => b.branchId),
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * Valida que cada `activityId` pertenezca a este gimnasio. La consulta ya
   * sale filtrada por tenant (`this.prisma.client`): un id ajeno o
   * inexistente falta en el resultado, y ambos casos responden 404
   * (API_CONTRACTS §1.3: "no revelar si esa fila existe en otro lado").
   *
   * Deduplica el input antes de comparar cantidades: `[a, a]` no es un
   * error del cliente, es un pedido de "una vez".
   */
  private async resolveActivityIds(activityIds: string[]): Promise<string[]> {
    const unique = [...new Set(activityIds)];
    if (unique.length === 0) return [];
    const rows = await this.prisma.client.activity.findMany({
      where: { id: { in: unique }, deletedAt: null },
    });
    if (rows.length !== unique.length) throw AppError.notFound('La actividad');
    return rows.map((r) => r.id);
  }

  /** Mismo criterio que `resolveActivityIds`, sobre `Branch`. */
  private async resolveBranchIds(branchIds: string[]): Promise<string[]> {
    const unique = [...new Set(branchIds)];
    if (unique.length === 0) return [];
    const rows = await this.prisma.client.branch.findMany({
      where: { id: { in: unique }, deletedAt: null },
    });
    if (rows.length !== unique.length) throw AppError.notFound('La sede');
    return rows.map((r) => r.id);
  }

  private translateWriteError(err: unknown): unknown {
    if (isUniqueViolation(err)) {
      return AppError.conflict(
        ErrorCode.CONFLICT,
        'Ya existe un plan con ese nombre en este gimnasio.',
      );
    }
    return err;
  }
}
