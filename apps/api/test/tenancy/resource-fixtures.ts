import type { PrismaClient } from '@pulso/db';

/**
 * Registro de fixtures por recurso (T-2.8).
 *
 * La suite de cross-tenant DESCUBRE las rutas sola (`route-discovery.ts`),
 * pero para probar de verdad "un recurso creado en A no es visible desde B"
 * hace falta saber CÓMO crear un recurso de cada tipo. Esta es la única
 * lista mantenida a mano de la suite — a propósito, es la allowlist que
 * describe MASTER_IMPLEMENTATION_PLAN.md (T-2.8, "Riesgos"): una ruta nueva
 * cuyo prefijo no está acá hace fallar el test de cobertura en vez de
 * pasarse por alto en silencio.
 *
 * `key` = segmentos de la ruta hasta el primer `:param` (sin `/api/v1`), p.ej.
 * `branches`, `users`, `cash/payment-methods`.
 */
export interface ResourceFixture {
  /** Crea una fila de este recurso en el gimnasio dado y devuelve su id. */
  createId(raw: PrismaClient, gymId: string, branchId: string): Promise<string>;
}

let counter = 0;
function unique(): number {
  counter += 1;
  return Date.now() % 1_000_000 + counter;
}

export const RESOURCE_FIXTURES: Record<string, ResourceFixture> = {
  branches: {
    async createId(raw, gymId) {
      const branch = await raw.branch.create({
        data: { gymId, name: `Sede cross-tenant ${unique()}` },
      });
      return branch.id;
    },
  },
  users: {
    async createId(raw, gymId, branchId) {
      const role = await raw.role.findFirst({ where: { gymId, code: 'RECEPTIONIST' } });
      const user = await raw.user.create({
        data: {
          gymId,
          email: `cross-tenant-${unique()}@fixture.test`,
          passwordHash: 'x',
          firstName: 'Fixture',
          lastName: 'User',
          ...(role
            ? { roleAssignments: { create: { gymId, roleId: role.id } } }
            : {}),
          branchAccess: { create: { gymId, branchId } },
        },
      });
      return user.id;
    },
  },
  roles: {
    async createId(raw, gymId) {
      const role = await raw.role.create({
        data: {
          gymId,
          code: `CUSTOM_${unique()}`,
          name: 'Rol de prueba',
          isSystem: false,
          permissions: ['member:read'],
        },
      });
      return role.id;
    },
  },
  members: {
    async createId(raw, gymId, branchId) {
      const member = await raw.member.create({
        data: {
          gymId,
          branchId,
          memberNumber: unique(),
          firstName: 'Fixture',
          lastName: 'Member',
          documentType: 'DNI',
          documentNumber: String(90_000_000 + unique()),
        },
      });
      return member.id;
    },
  },
  'cash/payment-methods': {
    async createId(raw, gymId) {
      const row = await raw.paymentMethod.create({
        data: { gymId, code: `PM_${unique()}`, name: 'Método de prueba' },
      });
      return row.id;
    },
  },
  'cash/concepts': {
    async createId(raw, gymId) {
      const row = await raw.cashConcept.create({
        data: { gymId, code: `CC_${unique()}`, name: 'Concepto de prueba', type: 'INCOME' },
      });
      return row.id;
    },
  },
  'cash/registers': {
    async createId(raw, gymId, branchId) {
      const row = await raw.cashRegister.create({
        data: { gymId, branchId, name: `Caja de prueba ${unique()}` },
      });
      return row.id;
    },
  },
};

/**
 * Rutas que NO son cross-tenant por diseño, con el motivo documentado —
 * es la "allowlist explícita y comentada" que pide T-2.8 para evitar falsos
 * positivos (endpoints públicos, de sesión, o singleton sin `:id`).
 */
export const NON_TENANT_ALLOWLIST: Record<string, string> = {
  AuthController: 'endpoints de sesión (login/refresh/logout/me/select-branch); select-branch ya tiene su propio test de cross-tenant en test/auth.spec.ts',
  HealthController: 'público, sin concepto de tenant',
  GymController: 'singleton: no tiene :id, opera siempre sobre el gimnasio de la sesión (ctx.gymId), nunca sobre un id que llegue del cliente',
};
