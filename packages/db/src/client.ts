import { PrismaClient } from '@prisma/client';
import { type TenantResolver, tenantExtension } from './tenant-extension.js';

export type PulsoPrismaClient = ReturnType<typeof createPrismaClient>;

/**
 * Tipo del cliente que reciben los callbacks de `PulsoPrismaClient.$transaction()`.
 *
 * No es `Prisma.TransactionClient`: ese tipo corresponde al cliente SIN
 * extender, y los delegados por modelo del cliente extendido (filtro de
 * tenant) usan una restricción genérica distinta (`Exact` en vez de
 * `SelectSubset`), así que uno no es asignable al otro pese a comportarse
 * igual en tiempo de ejecución. Se deriva acá, de la firma real, para que
 * cualquier helper que reciba un `tx` de una transacción de
 * `PulsoPrismaClient` tenga el tipo correcto en vez de `Prisma.TransactionClient`.
 */
export type PulsoTransactionClient = Parameters<PulsoPrismaClient['$transaction']>[0] extends (
  tx: infer TX,
) => unknown
  ? TX
  : never;

export interface CreatePrismaOptions {
  /** Devuelve el gymId activo. Null fuera de un request con sesión. */
  resolveGymId: TenantResolver;
  datasourceUrl?: string;
  log?: boolean;
}

/**
 * Cliente con aislamiento de tenant aplicado.
 *
 * El cliente crudo queda accesible como `unscoped` para las pocas operaciones
 * legítimamente globales (login, que necesita resolver el gimnasio antes de
 * tener contexto; jobs de plataforma). Cada uso se declara en una allowlist y
 * se audita.
 */
export function createPrismaClient(opts: CreatePrismaOptions) {
  const base = new PrismaClient({
    ...(opts.datasourceUrl ? { datasourceUrl: opts.datasourceUrl } : {}),
    log: opts.log ? ['warn', 'error'] : ['error'],
  });

  const scoped = base.$extends(tenantExtension(opts.resolveGymId));

  return Object.assign(scoped, {
    /**
     * Cliente SIN filtro de tenant. Usar sólo donde el aislamiento no aplica y
     * está documentado por qué. Todo uso nuevo requiere revisión.
     */
    unscoped: base,
  });
}

export { PrismaClient };
