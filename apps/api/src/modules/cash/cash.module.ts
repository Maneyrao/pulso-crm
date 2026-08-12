import { Module } from '@nestjs/common';
import { CashConfigModule } from './cash-config.module.js';
import { CashDaybookController } from './cash-daybook.controller.js';
import { CashDaybookService } from './cash-daybook.service.js';
import { CashMovementController } from './cash-movement.controller.js';
import { CashMovementService } from './cash-movement.service.js';
import { CashSessionController } from './cash-session.controller.js';
import { CashSessionService } from './cash-session.service.js';

/**
 * Caja: sesiones, movements, reversas y libro diario. Complementa a
 * `CashConfigModule` (PaymentMethod / CashConcept / CashRegister) — se
 * reexporta desde acá para que quien importe `CashModule` obtenga todo el
 * módulo, no sólo su mitad operativa.
 *
 * `AuditService` viene de `AuditModule` (marcado `@Global()`), así que no
 * hace falta importarlo. Mismo patrón que `MembersModule` / `MembershipsModule`.
 */
@Module({
  imports: [CashConfigModule],
  controllers: [CashSessionController, CashMovementController, CashDaybookController],
  providers: [CashSessionService, CashMovementService, CashDaybookService],
  exports: [CashSessionService, CashMovementService, CashDaybookService, CashConfigModule],
})
export class CashModule {}
