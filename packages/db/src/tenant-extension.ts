import { Prisma } from '@prisma/client';

/**
 * Aislamiento multi-tenant, capa 1 (ADR-009).
 *
 * Toda consulta a un modelo tenant-scoped lleva `gymId` automáticamente, tomado
 * del contexto de la sesión (ADR-008). Sin contexto, la consulta LANZA en vez
 * de devolver todo: un filtro que falla en silencio es exactamente cómo un
 * gimnasio termina viendo los datos de otro.
 *
 * Esto no reemplaza a RLS (capa 2, Etapa 13). Es la defensa que tenemos hoy.
 */

/** Modelos con columna `gymId`. Agregar uno nuevo al schema obliga a listarlo acá. */
export const TENANT_SCOPED_MODELS = [
  'Branch',
  'GymFeatureOverride',
  'User',
  'Role',
  'UserRoleAssignment',
  'UserBranchAccess',
  'RefreshToken',
  'AuditEvent',
  'IdempotencyKey',
  'OutboxEvent',
  'MemberCounter',
  'Member',
  'MemberDocument',
  'LedgerEntry',
  'Activity',
  'Plan',
  'PlanActivity',
  'PlanBranch',
  'Membership',
  'PaymentMethod',
  'CashConcept',
  'CashRegister',
  'CashSession',
  'CashSessionClosingDetail',
  'CashMovement',
  'CashOperationRequest',
  'AccessAttempt',
  'Attendance',
  'MessageTemplate',
  'MessageJob',
  'LocalAgent',
  'AccessDevice',
  'BiometricConsent',
  'BiometricEnrollment',
  'BiometricCredential',
  'AgentAuditEvent',
  'DeviceToken',
  'TenantBiometricKey',
] as const;

/** Modelos deliberadamente globales: no tienen gymId y no deben filtrarse. */
export const GLOBAL_MODELS = ['SaasPlan', 'Gym'] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

const TENANT_SET: ReadonlySet<string> = new Set(TENANT_SCOPED_MODELS);

export function isTenantScoped(model: string | undefined): model is TenantScopedModel {
  return !!model && TENANT_SET.has(model);
}

export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Se intentó ${operation} sobre ${model} sin contexto de tenant. ` +
        `Toda operación sobre un modelo tenant-scoped tiene que correr dentro de ` +
        `TenantContext.run(). Si es una operación de plataforma legítima, usá ` +
        `prisma.unscoped() y declarala en la allowlist.`,
    );
    this.name = 'MissingTenantContextError';
  }
}

export class CrossTenantWriteError extends Error {
  constructor(model: string, attempted: string, actual: string) {
    super(
      `Se intentó escribir en ${model} con gymId=${attempted} desde una sesión ` +
        `del gimnasio ${actual}. La operación fue rechazada.`,
    );
    this.name = 'CrossTenantWriteError';
  }
}

/** Devuelve el gymId activo, o null si no hay contexto. */
export type TenantResolver = () => string | null;

/** Operaciones cuyo `where` es un filtro libre: se compone con AND. */
const FILTER_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'updateMany',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Operaciones cuyo `where` tiene que conservar el campo único en el nivel
 * superior. Prisma 5+ permite agregar filtros extra al lado (extendedWhereUnique),
 * pero envolver todo en un AND rompería el ruteo del índice único.
 */
const UNIQUE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
]);

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

function andGym(where: unknown, gymId: string): Record<string, unknown> {
  const base = (where ?? {}) as Record<string, unknown>;
  // AND explícito en vez de sobrescribir: si el llamador ya filtró por otro
  // gymId, el resultado es vacío en vez de datos ajenos.
  return { AND: [base, { gymId }] };
}

function mergeGym(where: unknown, gymId: string): Record<string, unknown> {
  return { ...((where ?? {}) as Record<string, unknown>), gymId };
}

function injectGymIntoData(data: unknown, gymId: string, model: string): unknown {
  if (Array.isArray(data)) return data.map((d) => injectGymIntoData(d, gymId, model));
  const row = (data ?? {}) as Record<string, unknown>;
  const declared = row['gymId'];
  if (typeof declared === 'string' && declared !== gymId) {
    throw new CrossTenantWriteError(model, declared, gymId);
  }
  // La relación `gym: { connect: ... }` es la otra forma de setear el tenant.
  const gymRelation = row['gym'] as { connect?: { id?: string } } | undefined;
  if (gymRelation?.connect?.id && gymRelation.connect.id !== gymId) {
    throw new CrossTenantWriteError(model, gymRelation.connect.id, gymId);
  }
  if (gymRelation) return row;
  return { ...row, gymId };
}

/**
 * Extensión de cliente. Se aplica una vez y cubre todos los modelos.
 *
 * `resolveGymId` es una función y no un valor porque el tenant cambia por
 * request: se lee del AsyncLocalStorage en el momento de la consulta.
 */
export function tenantExtension(resolveGymId: TenantResolver) {
  return Prisma.defineExtension({
    name: 'pulso-tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantScoped(model)) return query(args);

          const gymId = resolveGymId();
          if (!gymId) throw new MissingTenantContextError(model, operation);

          const a = (args ?? {}) as Record<string, unknown>;

          // El tipo de `query` es específico por modelo y operación; acá se
          // trabaja de forma genérica, así que el cast es inevitable. La
          // seguridad la dan las funciones de arriba, no el tipo.
          const run = query as (a: unknown) => Promise<unknown>;

          if (FILTER_OPS.has(operation)) {
            return run({ ...a, where: andGym(a['where'], gymId) });
          }

          if (UNIQUE_OPS.has(operation)) {
            return run({ ...a, where: mergeGym(a['where'], gymId) });
          }

          if (CREATE_OPS.has(operation)) {
            return run({ ...a, data: injectGymIntoData(a['data'], gymId, model) });
          }

          if (operation === 'upsert') {
            return run({
              ...a,
              where: mergeGym(a['where'], gymId),
              create: injectGymIntoData(a['create'], gymId, model),
            });
          }

          // Operación no contemplada: se falla ruidosamente en vez de dejarla pasar
          // sin filtro. Si aparece una nueva en Prisma, queremos enterarnos acá y
          // no por un incidente de fuga entre tenants.
          throw new Error(
            `La extensión de tenant no contempla la operación "${operation}" sobre ${model}. ` +
              `Agregala a tenant-extension.ts antes de usarla.`,
          );
        },
      },
    },
  });
}

/**
 * Marca datos de creación cuyo `gymId` inyecta la extensión en tiempo de
 * ejecución.
 *
 * Prisma exige `gymId` en el tipo generado porque la columna es NOT NULL, pero
 * pasarlo a mano en cada `create` sería justamente la puerta al cross-tenant
 * que la extensión evita. Este helper concentra ese hueco de tipos en un solo
 * lugar, con nombre, en vez de esparcir `as never` por el código.
 */
export function scoped<T extends Record<string, unknown>>(data: T): T & { gymId: string } {
  return data as T & { gymId: string };
}
