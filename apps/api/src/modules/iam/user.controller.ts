import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  type CreateUserRequest,
  createUserRequestSchema,
  type ListUsersQuery,
  listUsersQuerySchema,
  type UpdateUserRequest,
  updateUserRequestSchema,
} from '@pulso/contracts/iam';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota en infra/redis/redis.service.ts
import { UserService } from './user.service.js';

@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @RequiresPermission('user:read')
  @Get()
  list(@ZodQuery(listUsersQuerySchema) query: ListUsersQuery) {
    return this.users.list(query);
  }

  @RequiresPermission('user:write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@ZodBody(createUserRequestSchema) body: CreateUserRequest) {
    return this.users.create(body);
  }

  @RequiresPermission('user:read')
  @Get(':id')
  getById(@ZodParam('id', uuidSchema) id: string) {
    return this.users.getById(id);
  }

  @RequiresPermission('user:write')
  @Patch(':id')
  update(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateUserRequestSchema) body: UpdateUserRequest,
  ) {
    return this.users.update(id, body);
  }

  @RequiresPermission('user:write')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@ZodParam('id', uuidSchema) id: string) {
    return this.users.deactivate(id);
  }

  @RequiresPermission('user:write')
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@ZodParam('id', uuidSchema) id: string) {
    return this.users.resetPassword(id);
  }
}
