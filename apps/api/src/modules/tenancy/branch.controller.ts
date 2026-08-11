import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  type CreateBranchRequest,
  createBranchRequestSchema,
  type UpdateBranchRequest,
  updateBranchRequestSchema,
} from '@pulso/contracts/tenancy';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam } from '../../common/validation/zod.pipe.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota en infra/redis/redis.service.ts
import { BranchService } from './branch.service.js';

@Controller('branches')
export class BranchController {
  constructor(private readonly branches: BranchService) {}

  @RequiresPermission('config:read')
  @Get()
  list() {
    return this.branches.list();
  }

  @RequiresPermission('config:write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@ZodBody(createBranchRequestSchema) body: CreateBranchRequest) {
    return this.branches.create(body);
  }

  @RequiresPermission('config:write')
  @Patch(':id')
  update(@ZodParam('id', uuidSchema) id: string, @ZodBody(updateBranchRequestSchema) body: UpdateBranchRequest) {
    return this.branches.update(id, body);
  }

  /**
   * `DELETE /branches/:id` (API_CONTRACTS §4): el verbo HTTP es DELETE, pero el
   * efecto NUNCA es un borrado real — sólo `isActive = false`. El nombre del
   * método refleja el efecto, no la ruta.
   */
  @RequiresPermission('config:write')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deactivate(@ZodParam('id', uuidSchema) id: string) {
    return this.branches.deactivate(id);
  }
}
