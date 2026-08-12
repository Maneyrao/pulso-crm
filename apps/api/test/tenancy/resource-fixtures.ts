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
  /** Crea una fila de este recurso DIRECTO por Prisma (bypassea HTTP) y devuelve su id. */
  createId(raw: PrismaClient, gymId: string, branchId: string): Promise<string>;
  /**
   * Body válido para el `POST` de alta de este recurso — a diferencia de
   * `createId`, éste SÍ pasa por HTTP. Sólo lo necesitan los recursos cuyo
   * `POST` no tiene `:id` (no entran en el bucle de cross-tenant por id): la
   * suite lo usa para el chequeo de "self-scoping" — el recurso creado por
   * el gimnasio B nace con el `gymId` de B, nunca forjable a otro.
   */
  createBody?(raw: PrismaClient, gymId: string, branchId: string): Promise<Record<string, unknown>>;
  /** Dónde vive `gymId` en la respuesta de creación. Por defecto, `body.gymId`. */
  extractGymId?(body: unknown): string | undefined;
  /**
   * Relee la fila por id, directo por Prisma. Usado por el test de
   * cross-tenant WRITE para verificar que un intento de mutación desde otro
   * gimnasio no sólo devuelve 404 sino que además NO TOCÓ la fila (TEST_STRATEGY
   * §4.1 `cross-tenant-write.spec.ts`: "el recurso no cambia").
   */
  readRaw(raw: PrismaClient, id: string): Promise<unknown>;
}

let counter = 0;
function unique(): number {
  counter += 1;
  return (Date.now() % 1_000_000) + counter;
}

export const RESOURCE_FIXTURES: Record<string, ResourceFixture> = {
  branches: {
    async createId(raw, gymId) {
      const branch = await raw.branch.create({
        data: { gymId, name: `Sede cross-tenant ${unique()}` },
      });
      return branch.id;
    },
    async createBody() {
      return { name: `Sede create-route ${unique()}`, timezone: 'America/Argentina/Buenos_Aires' };
    },
    readRaw: (raw, id) => raw.branch.findUnique({ where: { id } }),
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
    async createBody(raw, gymId) {
      const role = await raw.role.findFirst({ where: { gymId, code: 'RECEPTIONIST' } });
      return {
        email: `create-route-${unique()}@fixture.test`,
        firstName: 'CreateRoute',
        lastName: 'User',
        roleIds: role ? [role.id] : [],
        branchIds: [],
      };
    },
    // POST /users responde { user: {...}, temporaryPassword }, no un User
    // plano — gymId vive un nivel más adentro.
    extractGymId(body) {
      return (body as { user?: { gymId?: string } } | undefined)?.user?.gymId;
    },
    readRaw: (raw, id) => raw.user.findUnique({ where: { id } }),
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
    async createBody() {
      return { code: `CREATE_ROUTE_${unique()}`, name: 'Rol create-route', permissions: ['member:read'] };
    },
    readRaw: (raw, id) => raw.role.findUnique({ where: { id } }),
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
    readRaw: (raw, id) => raw.member.findUnique({ where: { id } }),
  },
  'cash/payment-methods': {
    async createId(raw, gymId) {
      const row = await raw.paymentMethod.create({
        data: { gymId, code: `PM_${unique()}`, name: 'Método de prueba' },
      });
      return row.id;
    },
    async createBody() {
      return { code: `PM_CREATE_${unique()}`, name: 'Método create-route' };
    },
    readRaw: (raw, id) => raw.paymentMethod.findUnique({ where: { id } }),
  },
  'cash/concepts': {
    async createId(raw, gymId) {
      const row = await raw.cashConcept.create({
        data: { gymId, code: `CC_${unique()}`, name: 'Concepto de prueba', type: 'INCOME' },
      });
      return row.id;
    },
    async createBody() {
      return { code: `CC_CREATE_${unique()}`, name: 'Concepto create-route', type: 'INCOME' };
    },
    readRaw: (raw, id) => raw.cashConcept.findUnique({ where: { id } }),
  },
  'cash/registers': {
    async createId(raw, gymId, branchId) {
      const row = await raw.cashRegister.create({
        data: { gymId, branchId, name: `Caja de prueba ${unique()}` },
      });
      return row.id;
    },
    async createBody(_raw, _gymId, branchId) {
      return { branchId, name: `Caja create-route ${unique()}` };
    },
    readRaw: (raw, id) => raw.cashRegister.findUnique({ where: { id } }),
  },
};

/**
 * Rutas que NO son cross-tenant por diseño, con el motivo documentado —
 * es la "allowlist explícita y comentada" que pide T-2.8 para evitar falsos
 * positivos. Clave = `METODO /ruta` EXACTA (no el controller): así un
 * endpoint nuevo agregado a un controller ya listado acá (Auth, Gym) NO
 * queda exento por asociación — sólo la ruta puntual que de verdad no es
 * cross-tenant-por-id.
 *
 * Nota: las rutas `@Public()` (login/refresh/logout, health) ni siquiera
 * llegan a esta allowlist — se filtran antes, por `isPublic`. Sólo hace
 * falta declarar acá lo que es "protegido" pero legítimamente no
 * cross-tenant-por-recurso.
 */
export const NON_TENANT_ALLOWLIST: Record<string, string> = {
  'GET /api/v1/auth/me': 'sesión — datos del propio usuario autenticado, no un recurso con :id',
  'POST /api/v1/auth/select-branch':
    'ya tiene su propio test de cross-tenant en test/auth.spec.ts (seleccionar sede de otro gimnasio → 404)',
  'GET /api/v1/gym': 'singleton: opera siempre sobre ctx.gymId, nunca sobre un id que llegue del cliente',
  'PATCH /api/v1/gym': 'singleton: opera siempre sobre ctx.gymId, nunca sobre un id que llegue del cliente',
};
