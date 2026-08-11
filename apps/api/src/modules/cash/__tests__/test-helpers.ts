import type { PrismaClient, PulsoPrismaClient } from '@pulso/db';
import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import type { TenantContext } from '../../../common/auth/tenant-context.js';

/**
 * Helpers de test compartidos por el módulo de caja.
 *
 * Los servicios de este módulo dependen de `PrismaService` (para que la
 * inyección de Nest funcione en producción), pero los tests de integración
 * corren contra una base de test aislada (`createTestDatabase`), no contra la
 * `PrismaService` real (que resuelve `DATABASE_URL` del entorno). Esta
 * función arma un objeto con la misma forma que `PrismaService` — mismo
 * prototipo, mismo campo `.client` — apuntando al cliente de test. No es un
 * mock: es el `PulsoPrismaClient` real, contra Postgres real.
 */
export function fakePrismaService(client: PulsoPrismaClient): PrismaService {
  const instance = Object.create(PrismaService.prototype) as PrismaService & { client: PulsoPrismaClient };
  instance.client = client;
  return instance;
}

/** `AuditService` real; sólo necesita `.client` para el método `record()` (fuera de transacción). */
export function testAuditService(client: PulsoPrismaClient): AuditService {
  return new AuditService(fakePrismaService(client));
}

let userCounter = 0;

/** Usuario mínimo, para las FK `openedByUserId` / `createdByUserId` / etc. */
export async function createTestUser(
  raw: PrismaClient,
  gymId: string,
  overrides: Partial<{ email: string; firstName: string; lastName: string }> = {},
) {
  userCounter += 1;
  return raw.user.create({
    data: {
      gymId,
      email: overrides.email ?? `cash-test-user-${userCounter}-${Date.now()}@test.local`,
      passwordHash: 'x',
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? `User${userCounter}`,
    },
  });
}

let memberCounter = 0;

export async function createTestMember(
  raw: PrismaClient,
  gymId: string,
  overrides: Partial<{ documentNumber: string; balance: string; branchId: string }> = {},
) {
  memberCounter += 1;
  return raw.member.create({
    data: {
      gymId,
      memberNumber: 900_000 + memberCounter,
      firstName: 'Socia',
      lastName: `De Prueba ${memberCounter}`,
      documentType: 'DNI',
      documentNumber: overrides.documentNumber ?? `8${Date.now()}${memberCounter}`.slice(0, 10),
      balance: overrides.balance ?? '0.00',
      branchId: overrides.branchId ?? null,
    },
  });
}

/** Contexto de tenant listo para `TenantContextStore.runWith`. */
export function buildTenantContext(input: {
  gymId: string;
  userId: string;
  branchIds: string[];
  activeBranchId?: string | null;
  permissions?: string[];
}): TenantContext {
  return {
    gymId: input.gymId,
    userId: input.userId,
    branchIds: input.branchIds,
    activeBranchId: input.activeBranchId ?? input.branchIds[0] ?? null,
    permissions: new Set(input.permissions ?? []),
    features: new Set(['cash']),
    requestId: `test-${Math.random().toString(36).slice(2)}`,
  };
}

export const ALL_CASH_PERMISSIONS = [
  'cash:read',
  'cash:operate',
  'cash:open_close',
  'cash:reverse',
  'cash:approve',
  'payment:collect',
  'payment:refund',
  'config:read',
  'config:write',
];
