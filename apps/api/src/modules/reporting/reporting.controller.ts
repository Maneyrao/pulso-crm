import { Controller, Get } from '@nestjs/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { ReportingService } from './reporting.service.js';

@Controller('reports')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @RequiresPermission('stats:read')
  @Get('dashboard')
  dashboard() {
    return this.reporting.dashboard();
  }
}
