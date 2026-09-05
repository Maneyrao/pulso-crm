import { Injectable } from '@nestjs/common';
import type { Prisma, PulsoTransactionClient } from '@pulso/db';
import { scoped } from '@pulso/db';
import type {
  CreateUserRequest,
  CreateUserResponse,
  ListUsersQuery,
  ListUsersResponse,
  ResetPasswordResponse,
  UpdateUserRequest,
  User,
} from '@pulso/contracts/iam';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService, diff } from '../../common/audit/audit.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PasswordService } from '../../common/auth/password.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { isUniqueViolation } from '../../common/db/db-errors.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { serializeUser, type UserWithAssignments } from './user-serializer.js';

const OWNER_ROLE_CODE = 'OWNER';
const USER_WRITE_PERMISSION = 'user:write';

/**
 * `User` (API_CONTRACTS §5 "IAM").
 *
 * Reglas de negocio que el schema Zod no puede expresar (documentadas en
 * `packages/contracts/src/iam.ts`, aplicadas acá):
 *  - No se puede desactivar al último `OWNER` activo (`409 LAST_OWNER`) — ni
 *    directamente (`deactivate`) ni indirectamente quitándole el rol por
 *    `update` (mismo invariante, mismo código). Ambos chequeos corren DENTRO
 *    de la transacción, después de tomar un lock sobre la fila de `Role`
 *    OWNER, para que dos llamadas concurrentes (deactivate de dos OWNERs
 *    distintos, o un deactivate y un update en simultáneo) no puedan las dos
 *    pasar el chequeo y dejar el gimnasio sin ningún OWNER activo.
 *  - Un usuario no puede quitarse `user:write` a sí mismo por `update`
 *    (API_CONTRACTS §5, packages/contracts/src/iam.ts).
 *  - La creación NO acepta password del cliente: se genera una temporal
 *    (`PasswordService.generateTemporary()`) y se marca `mustChangePassword`.
 *  - Desactivar o resetear la contraseña revoca las sesiones vigentes del
 *    usuario (TEST_STRATEGY §4.2 "desactivar un usuario invalida su sesión").
 */
@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
  ) {}

  async list(query: ListUsersQuery): Promise<ListUsersResponse> {
    const where = this.buildListWhere(query);

    const rows = await this.prisma.client.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: { roleAssignments: true, branchAccess: true },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: page.map((row) => serializeUser(row)),
      pageInfo: {
        limit: query.limit,
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        hasMore,
      },
    };
  }

  async create(input: CreateUserRequest): Promise<CreateUserResponse> {
    const roleIds = await this.resolveRoleIds(input.roleIds);
    const branchIds = await this.resolveBranchIds(input.branchIds);

    const temporaryPassword = this.passwords.generateTemporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: scoped({
            email: input.email.trim().toLowerCase(),
            passwordHash,
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            phone: input.phone ?? null,
            mustChangePassword: true,
          }),
        });

        // Se hacen como `createMany` de NIVEL SUPERIOR (no como `roleAssignments:
        // { create: [...] }` anidado en el `user.create`) a propósito: la
        // extensión de tenant sólo inyecta `gymId` en operaciones de nivel
        // superior sobre modelos tenant-scoped (ver tenant-extension.ts,
        // `$allOperations` no recorre relaciones anidadas). Un create anidado
        // dejaría `UserRoleAssignment.gymId` sin valor.
        await tx.userRoleAssignment.createMany({
          data: roleIds.map((roleId) => scoped({ userId: user.id, roleId })),
        });
        await tx.userBranchAccess.createMany({
          data: branchIds.map((branchId) => scoped({ userId: user.id, branchId })),
        });

        await this.audit.recordIn(tx, {
          action: 'USER_CREATED',
          resourceType: 'User',
          resourceId: user.id,
          after: {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roleIds,
            branchIds,
          },
        });

        return {
          ...user,
          roleAssignments: roleIds.map((roleId) => ({ roleId })),
          branchAccess: branchIds.map((branchId) => ({ branchId })),
        };
      });

      return { user: serializeUser(created), temporaryPassword };
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  async getById(id: string): Promise<User> {
    return serializeUser(await this.findActiveOrThrow(id));
  }

  async update(id: string, input: UpdateUserRequest): Promise<User> {
    const existing = await this.findActiveOrThrow(id);
    const ctx = TenantContextStore.require();

    let resolvedRoleIds: string[] | undefined;
    if (input.roleIds !== undefined) {
      resolvedRoleIds = await this.resolveRoleIds(input.roleIds);
    }
    const resolvedBranchIds =
      input.branchIds !== undefined ? await this.resolveBranchIds(input.branchIds) : undefined;

    const patch: Prisma.UserUpdateInput = {};
    if (input.firstName !== undefined) patch.firstName = input.firstName.trim();
    if (input.lastName !== undefined) patch.lastName = input.lastName.trim();
    if (input.phone !== undefined) patch.phone = input.phone;

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        if (resolvedRoleIds) {
          // Lock + chequeos DESPUÉS de tomarlo, no antes de abrir la
          // transacción: ver el comentario de clase sobre la condición de
          // carrera del invariante del último OWNER.
          await this.lockOwnerRole(tx, ctx.gymId);
          await this.assertNotRemovingLastOwnerTx(tx, id, resolvedRoleIds);
          await this.assertNotSelfRemovingUserWriteTx(tx, ctx.userId, id, resolvedRoleIds);
        }

        if (Object.keys(patch).length > 0) {
          await tx.user.update({ where: { id }, data: patch });
        }
        if (resolvedRoleIds) {
          await tx.userRoleAssignment.deleteMany({ where: { userId: id } });
          await tx.userRoleAssignment.createMany({
            data: resolvedRoleIds.map((roleId) => scoped({ userId: id, roleId })),
          });
        }
        if (resolvedBranchIds) {
          await tx.userBranchAccess.deleteMany({ where: { userId: id } });
          await tx.userBranchAccess.createMany({
            data: resolvedBranchIds.map((branchId) => scoped({ userId: id, branchId })),
          });
        }

        const row = await tx.user.findUniqueOrThrow({
          where: { id },
          include: { roleAssignments: true, branchAccess: true },
        });

        const { before, after } = diff(
          existing as unknown as Record<string, unknown>,
          patch as Record<string, unknown>,
        );
        if (resolvedRoleIds) {
          before['roleIds'] = existing.roleAssignments.map((a) => a.roleId);
          after['roleIds'] = resolvedRoleIds;
        }
        if (resolvedBranchIds) {
          before['branchIds'] = existing.branchAccess.map((a) => a.branchId);
          after['branchIds'] = resolvedBranchIds;
        }
        await this.audit.recordIn(tx, {
          action: 'USER_UPDATED',
          resourceType: 'User',
          resourceId: id,
          before,
          after,
        });

        return row;
      });

      return serializeUser(updated);
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  /** `POST /users/:id/deactivate` — `409 LAST_OWNER` si aplica. */
  async deactivate(id: string): Promise<User> {
    const existing = await this.findActiveOrThrow(id);
    const ctx = TenantContextStore.require();

    const updated = await this.prisma.client.$transaction(async (tx) => {
      await this.lockOwnerRole(tx, ctx.gymId);
      await this.assertNotLastOwnerTx(
        tx,
        id,
        'No se puede desactivar al último Owner activo del gimnasio.',
      );

      const row = await tx.user.update({ where: { id }, data: { status: 'INACTIVE' } });

      // Desactivar invalida la sesión (TEST_STRATEGY §4.2): revocar toda
      // familia de refresh vigente, no sólo dejar el status desactualizado.
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'USER_DEACTIVATED' },
      });

      await this.audit.recordIn(tx, {
        action: 'USER_DEACTIVATED',
        resourceType: 'User',
        resourceId: id,
        before: { status: existing.status },
        after: { status: row.status },
      });

      return row;
    });

    return serializeUser({
      ...updated,
      roleAssignments: existing.roleAssignments,
      branchAccess: existing.branchAccess,
    });
  }

  /** Eliminación lógica: desaparece del CRM sin romper auditoría ni historial. */
  async remove(id: string): Promise<User> {
    const existing = await this.findActiveOrThrow(id);
    const ctx = TenantContextStore.require();
    const deletedAt = new Date();

    const removed = await this.prisma.client.$transaction(async (tx) => {
      await this.lockOwnerRole(tx, ctx.gymId);
      await this.assertNotLastOwnerTx(
        tx,
        id,
        'No se puede eliminar al último Owner activo del gimnasio.',
      );

      const row = await tx.user.update({
        where: { id },
        data: { status: 'INACTIVE', deletedAt },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: deletedAt, revokedReason: 'USER_DELETED' },
      });
      await this.audit.recordIn(tx, {
        action: 'USER_DELETED',
        resourceType: 'User',
        resourceId: id,
        before: { status: existing.status, deletedAt: existing.deletedAt },
        after: { status: row.status, deletedAt },
      });
      return row;
    });

    return serializeUser({
      ...removed,
      roleAssignments: existing.roleAssignments,
      branchAccess: existing.branchAccess,
    });
  }

  /** `POST /users/:id/reset-password` — nunca acepta la password del cliente. */
  async resetPassword(id: string): Promise<ResetPasswordResponse> {
    await this.findActiveOrThrow(id);

    const temporaryPassword = this.passwords.generateTemporary();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    await this.prisma.client.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, mustChangePassword: true } });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' },
      });

      await this.audit.recordIn(tx, {
        action: 'USER_PASSWORD_RESET',
        resourceType: 'User',
        resourceId: id,
      });
    });

    return { temporaryPassword };
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private async findActiveOrThrow(id: string): Promise<UserWithAssignments> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
      include: { roleAssignments: true, branchAccess: true },
    });
    if (!user) throw AppError.notFound('El usuario');
    return user;
  }

  private buildListWhere(query: ListUsersQuery): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.roleId) where.roleAssignments = { some: { roleId: query.roleId } };
    if (query.branchId) where.branchAccess = { some: { branchId: query.branchId } };
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /** Valida que cada id pertenezca a este gimnasio (la consulta scoped ya lo garantiza). */
  private async resolveRoleIds(roleIds: string[]): Promise<string[]> {
    const roles = await this.prisma.client.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw AppError.validation([
        { field: 'roleIds', code: 'invalid_reference', message: 'Alguno de los roles no existe.' },
      ]);
    }
    return roles.map((r) => r.id);
  }

  /**
   * Vacío = todas las sedes activas del gimnasio (contrato de `createUserRequestSchema`).
   *
   * Un `branchId` que no pertenece a este gimnasio responde `404`, no un
   * error de validación distinto (API_CONTRACTS §1.3: "si no pertenece, la
   * respuesta es 404, no 403" — no revelar si esa sede existe en otro lado).
   * La consulta ya sale filtrada por tenant (`this.prisma.client`); que
   * falte en el resultado es indistinguible de que no exista.
   */
  private async resolveBranchIds(branchIds: string[]): Promise<string[]> {
    if (branchIds.length === 0) {
      const all = await this.prisma.client.branch.findMany({
        where: { deletedAt: null, isActive: true },
      });
      return all.map((b) => b.id);
    }
    const branches = await this.prisma.client.branch.findMany({
      where: { id: { in: branchIds }, deletedAt: null },
    });
    if (branches.length !== branchIds.length) {
      throw AppError.notFound('La sede');
    }
    return branches.map((b) => b.id);
  }

  /**
   * `SELECT ... FOR UPDATE` sobre la fila del rol OWNER de este gimnasio: no
   * hay una fila "cantidad de OWNERs activos" para bloquear directamente, así
   * que se usa el `Role` OWNER como mutex. Toda operación que pueda dejar al
   * gimnasio sin OWNERs activos (deactivate, update que quita el rol) toma
   * este lock ANTES de contar cuántos OWNERs activos quedan — así dos
   * llamadas concurrentes sobre dos OWNERs distintos se serializan en vez de
   * leer el mismo conteo "todavía hay otro" las dos a la vez.
   */
  private async lockOwnerRole(tx: PulsoTransactionClient, gymId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM roles WHERE "gymId" = ${gymId}::uuid AND code = ${OWNER_ROLE_CODE} FOR UPDATE`;
  }

  private async assertNotLastOwnerTx(
    tx: PulsoTransactionClient,
    userId: string,
    message: string,
  ): Promise<void> {
    const isOwner = await tx.userRoleAssignment.findFirst({
      where: { userId, role: { code: OWNER_ROLE_CODE } },
    });
    if (!isOwner) return;

    const otherActiveOwners = await tx.user.count({
      where: {
        id: { not: userId },
        status: 'ACTIVE',
        deletedAt: null,
        roleAssignments: { some: { role: { code: OWNER_ROLE_CODE } } },
      },
    });
    if (otherActiveOwners === 0) {
      throw AppError.conflict(ErrorCode.LAST_OWNER, message);
    }
  }

  /** Mismo invariante que `deactivate`, disparado por `update` cuando el nuevo set de roles ya no incluye OWNER. */
  private async assertNotRemovingLastOwnerTx(
    tx: PulsoTransactionClient,
    userId: string,
    newRoleIds: string[],
  ): Promise<void> {
    const ownerRole = await tx.role.findFirst({ where: { code: OWNER_ROLE_CODE } });
    if (!ownerRole || newRoleIds.includes(ownerRole.id)) return;
    await this.assertNotLastOwnerTx(
      tx,
      userId,
      'No se puede quitar el rol Owner al último dueño activo del gimnasio.',
    );
  }

  /**
   * API_CONTRACTS §5 / packages/contracts/src/iam.ts: "un usuario no puede
   * auto-quitarse `user:write`". Sólo aplica cuando el usuario autenticado
   * edita su PROPIO registro — nada impide que un OWNER le quite
   * `user:write` a otro usuario.
   */
  private async assertNotSelfRemovingUserWriteTx(
    tx: PulsoTransactionClient,
    actingUserId: string,
    targetUserId: string,
    newRoleIds: string[],
  ): Promise<void> {
    if (actingUserId !== targetUserId) return;

    const roles = await tx.role.findMany({ where: { id: { in: newRoleIds } } });
    const stillHasUserWrite = roles.some((role) =>
      role.permissions.includes(USER_WRITE_PERMISSION),
    );
    if (!stillHasUserWrite) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'No podés quitarte el permiso de administración de usuarios a vos mismo.',
      );
    }
  }

  private translateWriteError(err: unknown): unknown {
    if (isUniqueViolation(err)) {
      return AppError.conflict(
        ErrorCode.CONFLICT,
        'Ya existe un usuario con ese email en este gimnasio.',
      );
    }
    return err;
  }
}
