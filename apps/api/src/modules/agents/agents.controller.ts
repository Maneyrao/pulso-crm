import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  type AgentHeartbeatRequest,
  agentHeartbeatRequestSchema,
  type AgentPairRequest,
  agentPairRequestSchema,
  type AgentSendEventsRequest,
  agentSendEventsRequestSchema,
  type CreateAgentRequest,
  createAgentRequestSchema,
  type ListAgentEventsQuery,
  listAgentEventsQuerySchema,
  type ListAgentsQuery,
  listAgentsQuerySchema,
  type ListDevicesQuery,
  listDevicesQuerySchema,
  type RevokeAgentRequest,
  revokeAgentRequestSchema,
} from '@pulso/contracts/biometrics';
import { uuidSchema } from '@pulso/contracts/common';
import { AgentOnly, Public, RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe.js';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AgentAuthService, AgentAuth, type AgentAuthInfo } from './agent-auth.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AgentsService } from './agents.service.js';

/** Superficie CRM: gestión de agentes locales (API_CONTRACTS.md §10). */
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @RequiresPermission('device:manage')
  @Get()
  list(@ZodQuery(listAgentsQuerySchema) query: ListAgentsQuery) {
    return this.agents.list(query);
  }

  /** El `pairingSecret` de la respuesta se muestra UNA sola vez. */
  @RequiresPermission('device:manage')
  @Post()
  create(@ZodBody(createAgentRequestSchema) body: CreateAgentRequest) {
    return this.agents.create(body);
  }

  @RequiresPermission('device:manage')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@ZodParam('id', uuidSchema) id: string) {
    return this.agents.approve(id);
  }

  @RequiresPermission('device:manage')
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@ZodParam('id', uuidSchema) id: string, @ZodBody(revokeAgentRequestSchema) body: RevokeAgentRequest) {
    return this.agents.revoke(id, body);
  }

  @RequiresPermission('device:manage')
  @Get(':id/events')
  events(@ZodParam('id', uuidSchema) id: string, @ZodQuery(listAgentEventsQuerySchema) query: ListAgentEventsQuery) {
    return this.agents.listEvents(id, query);
  }
}

/** Superficie CRM: lectores físicos. */
@Controller('devices')
export class DevicesController {
  constructor(private readonly agents: AgentsService) {}

  @RequiresPermission('device:manage')
  @Get()
  list(@ZodQuery(listDevicesQuerySchema) query: ListDevicesQuery) {
    return this.agents.listDevices(query);
  }
}

/**
 * Superficie del agente local (`/agent/*`). Nunca comparte credenciales con
 * la superficie CRM: `pair` es público (autentica el secreto de un solo uso),
 * el resto lleva `Authorization: Bearer` con la credencial del agente.
 */
@Controller('agent')
export class AgentGatewayController {
  constructor(
    private readonly agentAuth: AgentAuthService,
    private readonly agents: AgentsService,
  ) {}

  @Public()
  @Post('pair')
  @HttpCode(HttpStatus.OK)
  pair(@ZodBody(agentPairRequestSchema) body: AgentPairRequest) {
    return this.agentAuth.pair(body);
  }

  @AgentOnly()
  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  heartbeat(@AgentAuth() auth: AgentAuthInfo, @ZodBody(agentHeartbeatRequestSchema) body: AgentHeartbeatRequest) {
    return this.agents.heartbeat(auth, body);
  }

  @AgentOnly()
  @Post('events')
  @HttpCode(HttpStatus.OK)
  events(@AgentAuth() auth: AgentAuthInfo, @ZodBody(agentSendEventsRequestSchema) body: AgentSendEventsRequest) {
    return this.agents.ingestEvents(auth, body);
  }
}
