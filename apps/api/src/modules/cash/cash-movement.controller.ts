import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { z } from 'zod';
import {
  createCashMovementRequestSchema,
  listCashMovementsQuerySchema,
  reverseCashMovementRequestSchema,
} from '@pulso/contracts/cash';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { CashMovementService } from './cash-movement.service.js';

/**
 * Movimientos de caja (API_CONTRACTS §8 "Caja").
 *
 * Todas las escrituras son idempotentes: doble click / retry no puede duplicar
 * un cobro ni una reversa. Los `POST` responden con el shape del contrato
 * (`createCashMovementResponseSchema` es un discriminated union por `status`).
 */
@Controller('cash/movements')
export class CashMovementController {
  constructor(private readonly service: CashMovementService) {}

  @RequiresPermission('cash:read')
  @Get()
  list(
    @ZodQuery(listCashMovementsQuerySchema) query: z.infer<typeof listCashMovementsQuerySchema>,
  ) {
    return this.service.list(query);
  }

  @RequiresPermission('cash:operate')
  @Idempotent()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @ZodBody(createCashMovementRequestSchema)
    body: z.infer<typeof createCashMovementRequestSchema>,
  ) {
    return this.service.create(body);
  }

  @RequiresPermission('cash:operate')
  @Idempotent()
  @Post(':id/reverse')
  @HttpCode(HttpStatus.CREATED)
  reverse(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(reverseCashMovementRequestSchema)
    body: z.infer<typeof reverseCashMovementRequestSchema>,
  ) {
    return this.service.reverse(id, body);
  }
}
