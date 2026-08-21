import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createPrismaClient, type PulsoPrismaClient } from '@pulso/db';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { getLogger } from '../../common/logging/logger.js';

/**
 * Acceso a la base con aislamiento de tenant aplicado (ADR-009).
 *
 * El `resolveGymId` lee del AsyncLocalStorage en el momento de cada consulta,
 * no en el de construcción: el mismo cliente sirve a todos los requests y cada
 * uno ve sólo su gimnasio.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PulsoPrismaClient;

  constructor() {
    this.client = createPrismaClient({
      resolveGymId: () => TenantContextStore.getGymId(),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }

  /**
   * Cliente SIN filtro de tenant.
   *
   * Allowlist de usos legítimos:
   *  - login: hay que resolver el gimnasio antes de tener contexto
   *  - refresh de token: idem
   *  - health checks
   *  - jobs de plataforma que operan sobre todos los gimnasios
   *  - agent-pair / agent-auth: la superficie del agente local se autentica
   *    por credencial de dispositivo ANTES de tener contexto; el gymId sale
   *    de la fila resuelta, nunca del request (modules/agents/agent-auth.service.ts)
   *
   * Cualquier uso nuevo requiere justificarlo acá.
   */
  unscoped(reason: 'login' | 'refresh' | 'session' | 'health' | 'platform-job' | 'seed' | 'agent-pair' | 'agent-auth') {
    getLogger().debug({ reason }, 'Acceso sin filtro de tenant');
    return this.client.unscoped;
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.unscoped.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /** Cantidad de migraciones aplicadas: sirve para detectar un deploy a medias. */
  async pendingMigrationsCheck(): Promise<{ applied: number }> {
    const rows = await this.client.unscoped.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;
    return { applied: Number(rows[0]?.count ?? 0) };
  }
}
