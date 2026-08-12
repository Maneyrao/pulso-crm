import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type CancelMembershipRequest,
  cancelMembershipRequestSchema,
  type CreateMembershipRequest,
  createMembershipRequestSchema,
} from '@pulso/contracts/memberships';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { ZodBody, ZodParam } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { MembershipsService } from './memberships.service.js';

/**
 * `Membership` (API_CONTRACTS §7 "Membresías").
 *
 * Tres rutas viven en dos controllers naturales: alta y listado cuelgan de
 * `/members/:id/...` (el socio es el recurso padre), y la cancelación
 * cuelga de `/memberships/:id/...` (mutación sobre la membresía misma,
 * sin necesidad de pasar por el socio). Ambos usan el mismo service.
 */
@Controller()
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @RequiresPermission('membership:write')
  @Idempotent()
  @Post('members/:memberId/memberships')
  @HttpCode(HttpStatus.CREATED)
  create(
    @ZodParam('memberId', uuidSchema) memberId: string,
    @ZodBody(createMembershipRequestSchema) body: CreateMembershipRequest,
  ) {
    return this.memberships.create(memberId, body);
  }

  /**
   * Lista de membresías del socio, ordenadas por `startDate` descendente
   * (la más reciente primero). `member:read` es suficiente — quien lee al
   * socio puede ver su historial de planes; `membership:write` es sólo
   * para altas.
   */
  @RequiresPermission('member:read')
  @Get('members/:memberId/memberships')
  listByMember(@ZodParam('memberId', uuidSchema) memberId: string) {
    return this.memberships.listByMember(memberId);
  }

  @RequiresPermission('membership:delete')
  @Post('memberships/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(cancelMembershipRequestSchema) body: CancelMembershipRequest,
  ) {
    return this.memberships.cancel(id, body);
  }
}
