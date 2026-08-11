import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  type CreateRoleRequest,
  createRoleRequestSchema,
  type UpdateRoleRequest,
  updateRoleRequestSchema,
} from '@pulso/contracts/iam';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam } from '../../common/validation/zod.pipe.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota en infra/redis/redis.service.ts
import { RoleService } from './role.service.js';

@Controller('roles')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @RequiresPermission('user:read')
  @Get()
  list() {
    return this.roles.list();
  }

  @RequiresPermission('user:write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@ZodBody(createRoleRequestSchema) body: CreateRoleRequest) {
    return this.roles.create(body);
  }

  @RequiresPermission('user:write')
  @Patch(':id')
  update(@ZodParam('id', uuidSchema) id: string, @ZodBody(updateRoleRequestSchema) body: UpdateRoleRequest) {
    return this.roles.update(id, body);
  }
}
