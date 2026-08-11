import { Injectable } from '@nestjs/common';
import { scoped } from '@pulso/db';
import type {
  CreatePaymentMethodRequest,
  UpdatePaymentMethodRequest,
  CreateCashConceptRequest,
  UpdateCashConceptRequest,
} from '@pulso/contracts/cash';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService } from '../../common/audit/audit.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { translateCashConstraintError } from './lib/pg-errors.js';
import type { CreateCashRegisterRequest, UpdateCashRegisterRequest } from './schemas/cash-register.schemas.js';

/**
 * Configuración de caja: `PaymentMethod`, `CashConcept`, `CashRegister`.
 *
 * Son las tres tablas de catálogo de las que dependen sesiones y
 * movimientos. CRUD simple, sin transacción compuesta: cada escritura es un
 * solo `UPDATE`/`INSERT` más su auditoría.
 */
@Injectable()
export class CashConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // ── PaymentMethod ─────────────────────────────────────────────────────

  async listPaymentMethods() {
    return this.db.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async createPaymentMethod(input: CreatePaymentMethodRequest) {
    try {
      const created = await this.db.paymentMethod.create({
        data: scoped({
          code: input.code,
          name: input.name,
          countsAsCash: input.countsAsCash,
          sortOrder: input.sortOrder,
        }),
      });
      await this.audit.record({
        action: 'CASH_CONFIG_CHANGED',
        resourceType: 'PaymentMethod',
        resourceId: created.id,
        after: created,
      });
      return created;
    } catch (err) {
      throw translateCashConstraintError(err) ?? err;
    }
  }

  async updatePaymentMethod(id: string, input: UpdatePaymentMethodRequest) {
    const before = await this.db.paymentMethod.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('El método de pago');

    const updated = await this.db.paymentMethod.update({ where: { id }, data: input });
    await this.audit.record({
      action: 'CASH_CONFIG_CHANGED',
      resourceType: 'PaymentMethod',
      resourceId: id,
      before,
      after: updated,
    });
    return updated;
  }

  // ── CashConcept ───────────────────────────────────────────────────────

  async listCashConcepts() {
    return this.db.cashConcept.findMany({ orderBy: { name: 'asc' } });
  }

  async createCashConcept(input: CreateCashConceptRequest) {
    try {
      const created = await this.db.cashConcept.create({
        data: scoped({ code: input.code, name: input.name, type: input.type }),
      });
      await this.audit.record({
        action: 'CASH_CONFIG_CHANGED',
        resourceType: 'CashConcept',
        resourceId: created.id,
        after: created,
      });
      return created;
    } catch (err) {
      throw translateCashConstraintError(err) ?? err;
    }
  }

  async updateCashConcept(id: string, input: UpdateCashConceptRequest) {
    const before = await this.db.cashConcept.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('El concepto de caja');

    const updated = await this.db.cashConcept.update({ where: { id }, data: input });
    await this.audit.record({
      action: 'CASH_CONFIG_CHANGED',
      resourceType: 'CashConcept',
      resourceId: id,
      before,
      after: updated,
    });
    return updated;
  }

  // ── CashRegister ──────────────────────────────────────────────────────

  async listCashRegisters(branchId?: string) {
    const validatedBranchId = branchId ? TenantContextStore.requireBranch(branchId) : undefined;
    return this.db.cashRegister.findMany({
      where: validatedBranchId ? { branchId: validatedBranchId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async createCashRegister(input: CreateCashRegisterRequest) {
    const branchId = TenantContextStore.requireBranch(input.branchId);
    try {
      const created = await this.db.cashRegister.create({ data: scoped({ branchId, name: input.name }) });
      await this.audit.record({
        action: 'CASH_CONFIG_CHANGED',
        resourceType: 'CashRegister',
        resourceId: created.id,
        after: created,
      });
      return created;
    } catch (err) {
      throw translateCashConstraintError(err) ?? err;
    }
  }

  async updateCashRegister(id: string, input: UpdateCashRegisterRequest) {
    const before = await this.db.cashRegister.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('La caja');

    const updated = await this.db.cashRegister.update({ where: { id }, data: input });
    await this.audit.record({
      action: 'CASH_CONFIG_CHANGED',
      resourceType: 'CashRegister',
      resourceId: id,
      before,
      after: updated,
    });
    return updated;
  }
}
