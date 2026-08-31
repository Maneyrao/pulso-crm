import { Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  type CreateMemberRequest,
  createMemberRequestSchema,
  type DeactivateMemberRequest,
  deactivateMemberRequestSchema,
  type ListDebtorsQuery,
  listDebtorsQuerySchema,
  type ListMemberPaymentsQuery,
  listMemberPaymentsQuerySchema,
  type ListMembersQuery,
  listMembersQuerySchema,
  type UpdateMemberRequest,
  updateMemberRequestSchema,
} from '@pulso/contracts/members';
import { uuidSchema } from '@pulso/contracts/common';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { MembersService } from './members.service.js';

@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @RequiresPermission('member:read')
  @Get()
  list(@ZodQuery(listMembersQuerySchema) query: ListMembersQuery) {
    return this.members.list(query);
  }

  @RequiresPermission('member:read')
  @Get('debtors')
  debtors(@ZodQuery(listDebtorsQuerySchema) query: ListDebtorsQuery) {
    return this.members.listDebtors(query);
  }

  @RequiresPermission('member:write')
  @Idempotent()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@ZodBody(createMemberRequestSchema) body: CreateMemberRequest) {
    return this.members.create(body);
  }

  @RequiresPermission('member:read')
  @Get(':id')
  getById(@ZodParam('id', uuidSchema) id: string) {
    return this.members.getById(id);
  }

  @RequiresPermission('member:write')
  @Patch(':id')
  update(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateMemberRequestSchema) body: UpdateMemberRequest,
  ) {
    return this.members.update(id, body);
  }

  @RequiresPermission('member:delete')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(deactivateMemberRequestSchema) body: DeactivateMemberRequest,
  ) {
    return this.members.deactivate(id, body);
  }

  @RequiresPermission('member:read')
  @Get(':id/ledger')
  ledger(@ZodParam('id', uuidSchema) id: string) {
    return this.members.getLedger(id);
  }

  @RequiresPermission('member:read')
  @Get(':id/payments')
  payments(
    @ZodParam('id', uuidSchema) id: string,
    @ZodQuery(listMemberPaymentsQuerySchema) query: ListMemberPaymentsQuery,
  ) {
    return this.members.getPayments(id, query);
  }
}
