import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from './common/audit/audit.module.js';
import { AuthGuard } from './common/auth/auth.guard.js';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor.js';
import { DecimalSerializerInterceptor } from './common/money/decimal.serializer.js';
import { ConfigModule } from './common/config/config.module.js';
import { GlobalExceptionFilter } from './common/errors/exception.filter.js';
import { RequestContextMiddleware } from './common/logging/request-context.middleware.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';

@Module({
  imports: [ConfigModule, PrismaModule, RedisModule, AuditModule, HealthModule, AuthModule],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Guard global: por defecto TODO endpoint exige sesión y permisos
    // declarados. Abrir uno requiere @Public() explícito.
    { provide: APP_GUARD, useClass: AuthGuard },
    // El orden importa: idempotencia primero (puede cortar el request y
    // devolver la respuesta guardada), serialización de Decimal al final.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: DecimalSerializerInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
