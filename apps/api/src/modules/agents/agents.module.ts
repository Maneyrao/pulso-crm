import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module.js';
import { AgentAuthService } from './agent-auth.service.js';
import { AgentGatewayController, AgentsController, DevicesController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';

/**
 * Agentes locales de biometría (Etapas 7-8). Dos superficies: CRM
 * (`/agents`, `/devices`, permiso `device:manage`) y agente (`/agent/*`,
 * Bearer). `AgentAuthService` lo consume también `AuthGuard` para resolver
 * los endpoints `@AgentOnly()`.
 */
@Module({
  imports: [AuditModule],
  controllers: [AgentsController, DevicesController, AgentGatewayController],
  providers: [AgentsService, AgentAuthService],
  exports: [AgentAuthService, AgentsService],
})
export class AgentsModule {}
