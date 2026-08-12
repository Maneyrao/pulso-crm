import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  type CreatePlanRequest,
  createPlanRequestSchema,
  type UpdatePlanRequest,
  updatePlanRequestSchema,
} from '@pulso/contracts/catalog';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PlanService } from './plan.service.js';

/**
 * `Plan` (API_CONTRACTS §7). No hay `plan:delete` en el catálogo de
 * permisos (packages/contracts/src/permissions.ts): `DELETE /plans/:id`
 * (soft-delete lógico) usa `plan:write`, mismo criterio que el resto de
 * mutaciones sobre el catálogo.
 */
@Controller('plans')
export class PlanController {
  constructor(private readonly plans: PlanService) {}

  @RequiresPermission('plan:read')
  @Get()
  list() {
    return this.plans.list();
  }

  @RequiresPermission('plan:write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@ZodBody(createPlanRequestSchema) body: CreatePlanRequest) {
    return this.plans.create(body);
  }

  @RequiresPermission('plan:write')
  @Patch(':id')
  update(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updatePlanRequestSchema) body: UpdatePlanRequest,
  ) {
    return this.plans.update(id, body);
  }

  /**
   * `DELETE /plans/:id` — nunca borra la fila: sólo pone `isActive: false`.
   * `Membership.planId` es `Restrict` y el precio congelado depende de que
   * el plan siga existiendo. Ver `PlanService.deactivate`.
   */
  @RequiresPermission('plan:write')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deactivate(@ZodParam('id', uuidSchema) id: string) {
    return this.plans.deactivate(id);
  }
}
