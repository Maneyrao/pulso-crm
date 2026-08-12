import { Controller, Get } from '@nestjs/common';
import type { z } from 'zod';
import { daybookQuerySchema } from '@pulso/contracts/cash';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodQuery } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { CashDaybookService } from './cash-daybook.service.js';

/**
 * Libro diario de caja (API_CONTRACTS §8, `GET /cash/daybook`).
 *
 * Requiere `from` y `to` (día de negocio, `YYYY-MM-DD`). Sin `branchId`
 * explícito usa la sede activa de la sesión (`TenantContextStore`).
 */
@Controller('cash/daybook')
export class CashDaybookController {
  constructor(private readonly service: CashDaybookService) {}

  @RequiresPermission('cash:read')
  @Get()
  get(@ZodQuery(daybookQuerySchema) query: z.infer<typeof daybookQuerySchema>) {
    return this.service.get(query);
  }
}
