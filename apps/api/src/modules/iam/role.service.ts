import { Injectable } from '@nestjs/common';
import { scoped } from '@pulso/db';
import type { CreateRoleRequest, UpdateRoleRequest } from '@pulso/contracts/iam';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService, diff } from '../../common/audit/audit.service.js';
import { isUniqueViolation } from '../../common/db/db-errors.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/**
 * `Role` (API_CONTRACTS §5 "GET/POST/PATCH /roles").
 *
 * Los roles de sistema (`isSystem: true`, sembrados en T-2.9) no se editan:
 * para partir de uno, el cliente clona sus permisos y los manda a `POST
 * /roles` (que siempre crea `isSystem: false`). Editar del lado del cliente
 * un catálogo de permisos "libre" está fuera de alcance de T-2.6 — acá el
 * backend valida que la lista venga del catálogo tipado (Zod ya lo hace vía
 * `permissionSchema`), no que la UI ofrezca un editor visual.
 */
@Injectable()
export class RoleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const roles = await this.prisma.client.role.findMany({ orderBy: { name: 'asc' } });
    return { data: roles };
  }

  async create(input: CreateRoleRequest) {
    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const created = await tx.role.create({
          data: scoped({
            code: input.code.trim(),
            name: input.name.trim(),
            description: input.description ?? null,
            isSystem: false,
            permissions: input.permissions,
          }),
        });

        await this.audit.recordIn(tx, {
          action: 'ROLE_UPDATED',
          resourceType: 'Role',
          resourceId: created.id,
          after: created,
        });

        return created;
      });
    } catch (err) {
      throw this.translateWriteError(err);
    }
  }

  async update(id: string, input: UpdateRoleRequest) {
    const existing = await this.prisma.client.role.findFirst({ where: { id } });
    if (!existing) throw AppError.notFound('El rol');
    if (existing.isSystem) {
      throw AppError.conflict(
        ErrorCode.CONFLICT,
        'Los roles de sistema no se editan. Cloná sus permisos en un rol nuevo con POST /roles.',
      );
    }

    const patch: { name?: string; description?: string | null; permissions?: string[] } = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.description !== undefined) patch.description = input.description;
    if (input.permissions !== undefined) patch.permissions = input.permissions;

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.role.update({ where: { id }, data: patch });

      const { before, after } = diff(existing, patch);
      await this.audit.recordIn(tx, {
        action: 'ROLE_UPDATED',
        resourceType: 'Role',
        resourceId: id,
        before,
        after,
      });

      return updated;
    });
  }

  private translateWriteError(err: unknown): unknown {
    if (isUniqueViolation(err)) {
      return AppError.conflict(ErrorCode.CONFLICT, 'Ya existe un rol con ese código en este gimnasio.');
    }
    return err;
  }
}
