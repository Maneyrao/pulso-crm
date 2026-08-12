import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  type CreateActivityRequest,
  createActivityRequestSchema,
  type UpdateActivityRequest,
  updateActivityRequestSchema,
} from '@pulso/contracts/catalog';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { ActivityService } from './activity.service.js';

/**
 * `Activity` (API_CONTRACTS §7). El catálogo no tiene un permiso propio de
 * lectura: se usa `plan:read` / `plan:write` (packages/contracts/src/permissions.ts)
 * porque las actividades sólo tienen sentido como componente de un `Plan`.
 */
@Controller('activities')
export class ActivityController {
  constructor(private readonly activities: ActivityService) {}

  @RequiresPermission('plan:read')
  @Get()
  list() {
    return this.activities.list();
  }

  @RequiresPermission('plan:write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@ZodBody(createActivityRequestSchema) body: CreateActivityRequest) {
    return this.activities.create(body);
  }

  @RequiresPermission('plan:write')
  @Patch(':id')
  update(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateActivityRequestSchema) body: UpdateActivityRequest,
  ) {
    return this.activities.update(id, body);
  }
}
