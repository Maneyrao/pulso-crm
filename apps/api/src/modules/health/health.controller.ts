import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { RedisService } from '../../infra/redis/redis.service.js';
import { Public } from '../../common/auth/decorators.js';

/**
 * /health/live  — ¿el proceso está vivo? No toca dependencias.
 * /health/ready — ¿puede atender tráfico? Verifica base y Redis de verdad.
 *
 * La distinción importa: un readiness que consulta la base hace que el
 * orquestador saque la instancia de rotación cuando la base cae, en vez de
 * reiniciarla en loop.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  @Public()
  @Get('ready')
  async ready(@Res() res: Response) {
    const [db, redis] = await Promise.all([this.prisma.isHealthy(), this.redis.isHealthy()]);

    let migrations: number | null = null;
    if (db) {
      migrations = (await this.prisma.pendingMigrationsCheck().catch(() => null))?.applied ?? null;
    }

    const ok = db && redis;
    res.status(ok ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).json({
      status: ok ? 'ok' : 'degraded',
      checks: { db, redis, migrationsApplied: migrations },
    });
  }
}
