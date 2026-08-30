import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { z } from 'zod';
import {
  closeCashSessionRequestSchema,
  listCashSessionsQuerySchema,
  openCashSessionRequestSchema,
} from '@pulso/contracts/cash';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { ZodBody, ZodQuery } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { CashSessionService } from './cash-session.service.js';

/**
 * Sesiones de caja (API_CONTRACTS §8 "Caja").
 *
 * `GET` con `cash:read`; `POST /open|/close` con `cash:operate` (el brief
 * declara `cash:operate` para "todo lo operativo de caja" en un solo scope,
 * a diferencia del comentario en `packages/contracts/src/cash.ts` que sugiere
 * un `cash:open_close` separado — el brief manda, per CLAUDE.md).
 *
 * `Idempotent()` es obligatorio en open/close: el reintento por timeout no
 * puede abrir dos sesiones (con la segunda chocando contra el UNIQUE
 * parcial) ni cerrarla dos veces (con el segundo close atacando una fila
 * ya CLOSED).
 */
@Controller('cash/sessions')
export class CashSessionController {
  constructor(private readonly service: CashSessionService) {}

  @RequiresPermission('cash:read')
  @Get('current')
  getCurrent() {
    return this.service.getCurrent();
  }

  @RequiresPermission('cash:read')
  @Get()
  list(@ZodQuery(listCashSessionsQuerySchema) query: z.infer<typeof listCashSessionsQuerySchema>) {
    return this.service.list(query);
  }

  @RequiresPermission('cash:operate')
  @Idempotent()
  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  open(@ZodBody(openCashSessionRequestSchema) body: z.infer<typeof openCashSessionRequestSchema>) {
    return this.service.open(body);
  }

  @RequiresPermission('cash:operate')
  @Idempotent()
  @Post('close')
  @HttpCode(HttpStatus.OK)
  close(
    @ZodBody(closeCashSessionRequestSchema) body: z.infer<typeof closeCashSessionRequestSchema>,
  ) {
    return this.service.close(body);
  }
}
