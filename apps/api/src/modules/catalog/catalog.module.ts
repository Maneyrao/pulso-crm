import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller.js';
import { ActivityService } from './activity.service.js';
import { PlanController } from './plan.controller.js';
import { PlanService } from './plan.service.js';

/**
 * Catálogo (API_CONTRACTS §7): actividades y planes. `AuditService` viene
 * de `AuditModule` (marcado `@Global()`), así que no hace falta importarlo
 * acá — mismo patrón que `TenancyModule` / `MembersModule`.
 */
@Module({
  controllers: [ActivityController, PlanController],
  providers: [ActivityService, PlanService],
  exports: [ActivityService, PlanService],
})
export class CatalogModule {}
