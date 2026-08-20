import { Module } from '@nestjs/common';
import { AccessController, AttendancesController } from './access.controller.js';
import { AccessService } from './access.service.js';

/**
 * Control de acceso — decisión (Regla #2) + registro (`AccessAttempt`,
 * `Attendance`). Biometría fuera del MVP (Etapa 8, agente local .NET).
 */
@Module({
  controllers: [AccessController, AttendancesController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
