import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';

/**
 * Membresías (API_CONTRACTS §7). `AuditService` viene de `AuditModule`
 * (marcado `@Global()`), así que no hace falta importarlo acá — mismo
 * patrón que `MembersModule` / `CatalogModule`.
 */
@Module({
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
