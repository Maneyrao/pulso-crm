import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from './common/audit/audit.module.js';
import { AuthGuard } from './common/auth/auth.guard.js';
import { FeatureGuard } from './common/auth/feature.guard.js';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor.js';
import { DecimalSerializerInterceptor } from './common/money/decimal.serializer.js';
import { ConfigModule } from './common/config/config.module.js';
import { GlobalExceptionFilter } from './common/errors/exception.filter.js';
import { RequestContextMiddleware } from './common/logging/request-context.middleware.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { MembersModule } from './modules/members/members.module.js';
import { ReportingModule } from './modules/reporting/reporting.module.js';
import { CashModule } from './modules/cash/cash.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { IamModule } from './modules/iam/iam.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    HealthModule,
    AuthModule,
    MembersModule,
    CashModule,
    CatalogModule,
    MembershipsModule,
    TenancyModule,
    IamModule,
    AccessModule,
    ReportingModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Guard global: por defecto TODO endpoint exige sesión y permisos
    // declarados. Abrir uno requiere @Public() explícito.
    { provide: APP_GUARD, useClass: AuthGuard },
    // Corre después de AuthGuard (necesita TenantContextStore ya poblado):
    // rechaza @RequiresFeature no habilitadas por el plan SaaS (ADR-022, T-2.8).
    { provide: APP_GUARD, useClass: FeatureGuard },
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
