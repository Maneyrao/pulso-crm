import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { scoped } from '@pulso/db';
import type {
  LocalAgent as DbLocalAgent,
  AccessDevice as DbAccessDevice,
  AgentAuditEvent as DbAgentAuditEvent,
} from '@pulso/db';
import type {
  AgentHeartbeatRequest,
  AgentHeartbeatResponse,
  AgentSendEventsRequest,
  AgentSendEventsResponse,
  ApproveAgentResponse,
  CreateAgentRequest,
  CreateAgentResponse,
  ListAgentEventsQuery,
  ListAgentEventsResponse,
  ListAgentsQuery,
  ListAgentsResponse,
  ListDevicesQuery,
  ListDevicesResponse,
  LocalAgent,
  AccessDevice,
  AgentAuditEvent,
  RevokeAgentRequest,
  RevokeAgentResponse,
} from '@pulso/contracts/biometrics';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService } from '../../common/audit/audit.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  generateToken,
  hashToken,
  PAIRING_SECRET_PREFIX,
  type AgentAuthInfo,
} from './agent-auth.service.js';

export function serializeAgent(agent: DbLocalAgent): LocalAgent {
  return {
    id: agent.id,
    gymId: agent.gymId,
    branchId: agent.branchId,
    name: agent.name,
    installationId: agent.installationId,
    agentVersion: agent.agentVersion,
    osVersion: agent.osVersion,
    status: agent.status,
    lastSeenAt: agent.lastSeenAt?.toISOString() ?? null,
    approvedAt: agent.approvedAt?.toISOString() ?? null,
    revokedAt: agent.revokedAt?.toISOString() ?? null,
    revokeReason: agent.revokeReason,
    createdAt: agent.createdAt.toISOString(),
  };
}

function serializeDevice(device: DbAccessDevice): AccessDevice {
  return {
    id: device.id,
    branchId: device.branchId,
    localAgentId: device.localAgentId,
    kind: device.kind,
    vendor: device.vendor,
    model: device.model,
    serialNumber: device.serialNumber,
    status: device.status,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
  };
}

function serializeEvent(event: DbAgentAuditEvent): AgentAuditEvent {
  return {
    id: event.id,
    branchId: event.branchId,
    localAgentId: event.localAgentId,
    deviceId: event.deviceId,
    type: event.type,
    severity: event.severity,
    message: event.message,
    metadata: (event.metadata ?? null) as Record<string, string> | null,
    occurredAt: event.occurredAt.toISOString(),
    receivedAt: event.receivedAt.toISOString(),
  };
}

/**
 * Gestión de agentes locales (API_CONTRACTS.md §10, superficie CRM) y
 * operaciones autenticadas por credencial de agente (heartbeat, eventos).
 */
@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Superficie CRM (device:manage) ────────────────────────────────────

  async list(query: ListAgentsQuery): Promise<ListAgentsResponse> {
    const ctx = TenantContextStore.require();
    const branchId = query.branchId ? TenantContextStore.requireBranch(query.branchId) : undefined;
    const agents = await this.prisma.client.localAgent.findMany({
      where: {
        branchId: branchId ?? { in: ctx.branchIds },
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: agents.map(serializeAgent) };
  }

  async create(input: CreateAgentRequest): Promise<CreateAgentResponse> {
    const branchId = TenantContextStore.requireBranch(input.branchId);

    // El secreto se muestra UNA vez; sólo el hash queda en la base.
    const pairingSecret = generateToken(PAIRING_SECRET_PREFIX);

    const agent = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.localAgent.create({
        data: scoped({
          branchId,
          name: input.name,
          installationId: randomUUID(),
          enrollmentSecretHash: hashToken(pairingSecret),
        }),
      });
      await this.audit.recordIn(tx, {
        action: 'AGENT_CREATED',
        resourceType: 'LocalAgent',
        resourceId: created.id,
        after: { name: created.name, branchId },
        branchId,
      });
      return created;
    });

    return { agent: serializeAgent(agent), pairingSecret };
  }

  async approve(id: string): Promise<ApproveAgentResponse> {
    const ctx = TenantContextStore.require();
    const agent = await this.findOwn(id);
    if (agent.status === 'REVOKED') {
      throw AppError.conflict(
        ErrorCode.AGENT_REVOKED,
        'Un agente revocado no puede aprobarse. Creá uno nuevo.',
      );
    }
    if (agent.status === 'ACTIVE') {
      return { agent: serializeAgent(agent) };
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.localAgent.update({
        where: { id: agent.id },
        data: { status: 'ACTIVE', approvedByUserId: ctx.userId, approvedAt: new Date() },
      });
      // Alta implícita del lector: el agente maneja un único U.are.U 4500
      // (LOCAL_AGENT_ARCHITECTURE.md). Cuando en la Etapa 8 el agente reporte
      // hardware real, esta fila se actualizará con serial y estado reales.
      const existing = await tx.accessDevice.findFirst({ where: { localAgentId: agent.id } });
      if (!existing) {
        await tx.accessDevice.create({
          data: scoped({
            branchId: agent.branchId,
            localAgentId: agent.id,
            kind: 'FINGERPRINT_READER',
            vendor: 'HID_DIGITALPERSONA',
            model: 'UAREU_4500',
            status: 'OFFLINE',
          }),
        });
      }
      await this.audit.recordIn(tx, {
        action: 'AGENT_APPROVED',
        resourceType: 'LocalAgent',
        resourceId: agent.id,
        branchId: agent.branchId,
      });
      return row;
    });
    return { agent: serializeAgent(updated) };
  }

  async revoke(id: string, input: RevokeAgentRequest): Promise<RevokeAgentResponse> {
    const ctx = TenantContextStore.require();
    const agent = await this.findOwn(id);
    if (agent.status === 'REVOKED') {
      return { agent: serializeAgent(agent) };
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.localAgent.update({
        where: { id: agent.id },
        data: {
          status: 'REVOKED',
          revokedByUserId: ctx.userId,
          revokedAt: new Date(),
          revokeReason: input.reason,
        },
      });
      // Invalida los deviceTokens en curso: la revocación es inmediata
      // (BIOMETRIC_SECURITY.md §1.4). La credencial de larga vida se conserva
      // para que el heartbeat pueda devolver REVOKED y el agente se apague.
      await tx.deviceToken.updateMany({
        where: { localAgentId: agent.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await this.audit.recordIn(tx, {
        action: 'AGENT_REVOKED',
        resourceType: 'LocalAgent',
        resourceId: agent.id,
        after: { reason: input.reason },
        branchId: agent.branchId,
      });
      return row;
    });
    return { agent: serializeAgent(updated) };
  }

  async listEvents(id: string, query: ListAgentEventsQuery): Promise<ListAgentEventsResponse> {
    const agent = await this.findOwn(id);
    const where = {
      localAgentId: agent.id,
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [total, events] = await this.prisma.client.$transaction([
      this.prisma.client.agentAuditEvent.count({ where }),
      this.prisma.client.agentAuditEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      data: events.map(serializeEvent),
      pageInfo: {
        total,
        page: query.page,
        limit: query.limit,
        hasMore: query.page * query.limit < total,
      },
    };
  }

  async listDevices(query: ListDevicesQuery): Promise<ListDevicesResponse> {
    const ctx = TenantContextStore.require();
    const branchId = query.branchId ? TenantContextStore.requireBranch(query.branchId) : undefined;
    const devices = await this.prisma.client.accessDevice.findMany({
      where: {
        branchId: branchId ?? { in: ctx.branchIds },
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: devices.map(serializeDevice) };
  }

  // ── Superficie agente (credencial de larga vida) ──────────────────────

  async heartbeat(
    auth: AgentAuthInfo,
    input: AgentHeartbeatRequest,
  ): Promise<AgentHeartbeatResponse> {
    const now = new Date();
    await this.prisma.client.localAgent.update({
      where: { id: auth.agent.id },
      data: { lastSeenAt: now, agentVersion: input.agentVersion },
    });
    if (input.deviceStatus) {
      const status = ['ONLINE', 'OFFLINE', 'ERROR', 'DISABLED'].includes(input.deviceStatus)
        ? (input.deviceStatus as 'ONLINE' | 'OFFLINE' | 'ERROR' | 'DISABLED')
        : 'ERROR';
      await this.prisma.client.accessDevice.updateMany({
        where: { localAgentId: auth.agent.id },
        data: { status, lastSeenAt: now },
      });
    }

    // DISABLED se reporta como BLOCKED (§5.1 del protocolo del agente):
    // "deshabilitado por el gimnasio" — recuperable, a diferencia de REVOKED.
    const status = auth.agent.status === 'DISABLED' ? 'BLOCKED' : auth.agent.status;
    return { status, reason: auth.agent.revokeReason };
  }

  async ingestEvents(
    auth: AgentAuthInfo,
    input: AgentSendEventsRequest,
  ): Promise<AgentSendEventsResponse> {
    const received = new Date();
    await this.prisma.client.agentAuditEvent.createMany({
      data: input.events.map((event) => ({
        gymId: auth.agent.gymId,
        branchId: auth.agent.branchId,
        localAgentId: auth.agent.id,
        type: event.type,
        severity: event.severity,
        message: event.message,
        metadata: event.metadata ?? {},
        occurredAt: new Date(event.occurredAt),
        receivedAt: received,
      })),
    });
    return { accepted: input.events.length };
  }

  private async findOwn(id: string): Promise<DbLocalAgent> {
    const ctx = TenantContextStore.require();
    const agent = await this.prisma.client.localAgent.findFirst({
      where: { id, branchId: { in: ctx.branchIds } },
    });
    if (!agent) throw AppError.notFound('El agente');
    return agent;
  }
}
