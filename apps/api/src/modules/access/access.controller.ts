import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type AccessCheckRequest,
  accessCheckRequestSchema,
  type ListAttendancesQuery,
  listAttendancesQuerySchema,
  type ListAccessAttemptsQuery,
  listAccessAttemptsQuerySchema,
} from '@pulso/contracts/access';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AccessService } from './access.service.js';

@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  /**
   * `POST /access/check`. Regla de negocio en `access-decision.ts` (función
   * pura, testeada en `access-decision.spec.ts`); acá sólo se pega HTTP →
   * service. Siempre responde 200: una denegación es un resultado válido
   * de la consulta, no un error de la consulta.
   */
  @RequiresPermission('access:operate')
  @Post('check')
  @HttpCode(HttpStatus.OK)
  check(@ZodBody(accessCheckRequestSchema) body: AccessCheckRequest) {
    return this.access.check(body);
  }

  @RequiresPermission('access:read_history')
  @Get('attempts/:id/result')
  attemptResult(@ZodParam('id', uuidSchema) id: string) {
    return this.access.getAttemptResult(id);
  }

  @RequiresPermission('access:read_history')
  @Get('attempts')
  attempts(@ZodQuery(listAccessAttemptsQuerySchema) query: ListAccessAttemptsQuery) {
    return this.access.listAttempts(query);
  }
}

@Controller('attendances')
export class AttendancesController {
  constructor(private readonly access: AccessService) {}

  @RequiresPermission('attendance:read')
  @Get()
  list(@ZodQuery(listAttendancesQuerySchema) query: ListAttendancesQuery) {
    return this.access.listAttendances(query);
  }
}
