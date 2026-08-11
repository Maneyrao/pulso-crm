import { Injectable } from '@nestjs/common';
import type { Prisma } from '@pulso/db';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TenantContextStore } from '../auth/tenant-context.js';
import { RequestContextStore } from '../logging/logger.js';
import { redact } from '../logging/redaction.js';
import { serialize } from '../money/decimal.serializer.js';

/**
 * Auditoría append-only (ADR-017).
 *
 * Se escribe DENTRO de la transacción de negocio cuando hay una: un cambio
 * auditado que se revierte no debe dejar rastro de algo que no pasó, y un
 * cambio que ocurrió no puede quedar sin registro.
 */
export type AuditAction =
  // Sesión
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'SECURITY_REFRESH_REUSE'
  // Tenancy e IAM
  | 'GYM_UPDATED'
  | 'BRANCH_CREATED'
  | 'BRANCH_UPDATED'
  | 'BRANCH_DELETED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_PASSWORD_RESET'
  | 'ROLE_UPDATED'
  // Socios
  | 'MEMBER_CREATED'
  | 'MEMBER_UPDATED'
  | 'MEMBER_DEACTIVATED'
  | 'MEMBER_DOCUMENT_VIEWED'
  | 'MEMBER_DOCUMENT_UPLOADED'
  // Catálogo
  | 'ACTIVITY_CREATED'
  | 'ACTIVITY_UPDATED'
  | 'PLAN_CREATED'
  | 'PLAN_UPDATED'
  | 'PLAN_DEACTIVATED'
  // Membresías
  | 'MEMBERSHIP_CREATED'
  | 'MEMBERSHIP_CANCELLED'
  // Caja
  | 'CASH_SESSION_OPENED'
  | 'CASH_SESSION_CLOSED'
  | 'CASH_MOVEMENT_CREATED'
  | 'CASH_MOVEMENT_REVERSED'
  | 'CASH_OPERATION_REQUESTED'
  | 'CASH_OPERATION_APPROVED'
  | 'CASH_OPERATION_REJECTED'
  | 'PAYMENT_COLLECTED'
  | 'PAYMENT_REFUNDED'
  | 'CASH_CONFIG_CHANGED'
  // Acceso
  | 'ACCESS_MANUAL_OVERRIDE'
  // Mensajería
  | 'MESSAGE_TEMPLATE_UPDATED'
  | 'MESSAGE_BROADCAST_SENT'
  | 'MESSAGING_CONFIGURED';

export interface AuditInput {
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  branchId?: string | null;
}

/**
 * Cliente de Prisma o el de una transacción en curso.
 *
 * Se declara estructuralmente y no como `Prisma.TransactionClient` porque el
 * cliente extendido con el filtro de tenant tiene delegados de otro tipo, y
 * ambos tienen que poder pasarse por acá.
 */
interface Db {
  auditEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra dentro de una transacción existente.
   *
   * Es la forma preferida: si la operación falla, el registro de auditoría se
   * va con ella.
   */
  async recordIn(tx: Db, input: AuditInput): Promise<void> {
    const ctx = TenantContextStore.require();
    await tx.auditEvent.create({
      data: {
        gymId: ctx.gymId,
        actorUserId: ctx.userId,
        actorType: 'USER',
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        branchId: input.branchId ?? ctx.activeBranchId,
        before: prepare(input.before),
        after: prepare(input.after),
        requestId: RequestContextStore.get()?.requestId ?? null,
      },
    });
  }

  /** Registra fuera de transacción. Para acciones sin escritura de dominio. */
  async record(input: AuditInput): Promise<void> {
    await this.recordIn(this.prisma.client, input);
  }
}

/**
 * Prepara un snapshot para guardar: serializa Decimal y Date, y enmascara los
 * campos sensibles. La auditoría registra QUÉ cambió, no el contenido de los
 * datos personales.
 */
function prepare(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return redact(serialize(value)) as Prisma.InputJsonValue;
}

/** Calcula sólo los campos que cambiaron, para no guardar la fila entera. */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    const prev = before[key];
    const next = after[key];
    if (JSON.stringify(serialize(prev)) !== JSON.stringify(serialize(next))) {
      b[key] = prev;
      a[key] = next as T[keyof T];
    }
  }
  return { before: b, after: a };
}
