import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AgentPairRequest, AgentPairResponse } from '@pulso/contracts/biometrics';
import type { LocalAgent, DeviceTokenScope } from '@pulso/db';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';

/**
 * Autenticación de la superficie agente (API_CONTRACTS.md §10,
 * BIOMETRIC_SECURITY.md §8).
 *
 * Este archivo es el ÚNICO del módulo autorizado a usar `prisma.unscoped()`
 * (allowlist en test/tenancy/cross-tenant-suite.spec.ts): tanto el pareo como
 * la resolución de un Bearer ocurren ANTES de que exista contexto de tenant —
 * el gymId sale de la credencial resuelta, nunca de un header del cliente
 * (ADR-008). Todo lo demás del módulo corre scoped.
 *
 * Tokens (los tres son aleatorios de alta entropía y sólo se guarda su hash):
 *  - `pps_…` secreto de pareo, un solo uso, se muestra una vez al crear.
 *  - `pac_…` credencial de agente de larga vida, emitida por /agent/pair.
 *  - `pdt_…` deviceToken de una operación, TTL corto, un solo uso.
 */

export const AGENT_CREDENTIAL_PREFIX = 'pac_';
export const DEVICE_TOKEN_PREFIX = 'pdt_';
export const PAIRING_SECRET_PREFIX = 'pps_';

export interface AgentAuthInfo {
  agent: LocalAgent;
  kind: 'credential' | 'device';
  /** Sólo para kind='device'. */
  deviceToken?: {
    id: string;
    scope: DeviceTokenScope;
    subjectMemberId: string | null;
    enrollmentId: string | null;
  };
}

/** La request, decorada por AuthGuard cuando el endpoint es @AgentOnly(). */
export interface RequestWithAgentAuth {
  agentAuth?: AgentAuthInfo;
}

/** Inyecta en el handler la autenticación resuelta por AuthGuard. */
export const AgentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AgentAuthInfo => {
    const req = ctx.switchToHttp().getRequest<RequestWithAgentAuth>();
    if (!req.agentAuth) {
      throw new Error(
        '@AgentAuth() usado en un handler sin @AgentOnly(). Es un error de programación.',
      );
    }
    return req.agentAuth;
  },
);

export function generateToken(prefix: string): string {
  return prefix + randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

@Injectable()
export class AgentAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resuelve el Bearer de un endpoint @AgentOnly(). Devuelve la info para que
   * el guard fije el contexto de tenant con el gymId del AGENTE.
   *
   * El deviceToken acá sólo se VALIDA (existencia, vigencia, no usado). El
   * consumo —marcar `usedAt` de forma atómica— es del service, dentro de la
   * transacción de la operación, para que un token no quede quemado por un
   * request que después falla la validación de negocio.
   */
  async authenticate(bearer: string): Promise<AgentAuthInfo> {
    if (bearer.startsWith(AGENT_CREDENTIAL_PREFIX)) {
      const agent = await this.prisma
        .unscoped('agent-auth')
        .localAgent.findFirst({ where: { agentCredentialHash: hashToken(bearer) } });
      if (!agent) throw this.invalidToken();
      return { agent, kind: 'credential' };
    }

    if (bearer.startsWith(DEVICE_TOKEN_PREFIX)) {
      const token = await this.prisma.unscoped('agent-auth').deviceToken.findUnique({
        where: { tokenHash: hashToken(bearer) },
        include: { localAgent: true },
      });
      if (!token || token.usedAt !== null || token.expiresAt.getTime() <= Date.now()) {
        throw this.invalidToken();
      }
      return {
        agent: token.localAgent,
        kind: 'device',
        deviceToken: {
          id: token.id,
          scope: token.scope,
          subjectMemberId: token.subjectMemberId,
          enrollmentId: token.enrollmentId,
        },
      };
    }

    throw this.invalidToken();
  }

  /**
   * `POST /agent/pair` — intercambia installationId + secreto por la
   * credencial de larga vida. Público (no hay nada que autenticar todavía);
   * la seguridad es el secreto de un solo uso mostrado una vez en el CRM.
   */
  async pair(input: AgentPairRequest): Promise<AgentPairResponse> {
    const db = this.prisma.unscoped('agent-pair');
    const agent = await db.localAgent.findFirst({
      where: { installationId: input.installationId },
    });

    // Respuesta idéntica para "no existe", "secreto incorrecto" y "ya
    // pareado": distinguirlas le regala información a quien está probando.
    if (!agent || !hashesMatch(agent.enrollmentSecretHash, hashToken(input.secret))) {
      throw AppError.unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Pareo inválido.');
    }
    if (agent.agentCredentialHash !== null) {
      throw AppError.unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Pareo inválido.');
    }
    if (agent.status === 'REVOKED' || agent.status === 'DISABLED') {
      throw AppError.forbidden(ErrorCode.AGENT_REVOKED, 'El agente fue revocado.');
    }

    const credential = generateToken(AGENT_CREDENTIAL_PREFIX);
    await db.localAgent.update({
      where: { id: agent.id },
      data: {
        agentCredentialHash: hashToken(credential),
        machineFingerprint: input.machineFingerprint,
        agentVersion: input.agentVersion,
        osVersion: input.osVersion,
        lastSeenAt: new Date(),
      },
    });

    return { agentCredential: credential, agentId: agent.id };
  }

  private invalidToken(): AppError {
    return AppError.unauthorized(
      ErrorCode.INVALID_DEVICE_TOKEN,
      'Credencial de dispositivo inválida.',
    );
  }
}
