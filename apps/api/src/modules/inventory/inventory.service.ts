import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, scoped, type PulsoTransactionClient } from '@pulso/db';
import type { InventoryHistoryQuery, InventoryProductInput, InventoryProductUpdate,
  InventoryQuery, InventoryReverseInput, InventorySaleInput, InventoryStockInput } from '@pulso/contracts/inventory';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest constructor metadata
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { redact } from '../../common/logging/redaction.js';
import { serialize } from '../../common/money/decimal.serializer.js';
import { saleInclude, serializeMovement, serializeProduct, serializeSale } from './inventory-serializer.js';

const MAX_MONEY = new Prisma.Decimal('999999999999.99');
const conflict = (message: string) => AppError.conflict(ErrorCode.CONFLICT, message);

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async products(query: InventoryQuery) {
    const branchId = TenantContextStore.requireBranch(query.branchId);
    const where = query.search ? { OR: [
      { name: { contains: query.search, mode: 'insensitive' as const } },
      { sku: { contains: query.search, mode: 'insensitive' as const } },
    ] } : {};
    const data = await this.prisma.client.inventoryProduct.findMany({ where,
      include: { stocks: { where: { branchId } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    const total = await this.prisma.client.inventoryProduct.count({ where });
    return { data: data.map((p) => serializeProduct(p, branchId)), total, page: query.page, pageSize: query.pageSize };
  }

  async product(id: string, query: InventoryQuery) {
    const branchId = TenantContextStore.requireBranch(query.branchId);
    const row = await this.prisma.client.inventoryProduct.findFirst({ where: { id }, include: { stocks: { where: { branchId } } } });
    if (!row) throw AppError.notFound('El producto');
    return serializeProduct(row, branchId);
  }

  createProduct(input: InventoryProductInput, key: string | undefined) {
    const branchId = TenantContextStore.requireBranch();
    return this.mutate(key, 'product:create', { branchId, ...input }, async (tx) => {
      const row = await tx.inventoryProduct.create({ data: scoped(input), include: { stocks: true } });
      const result = serializeProduct(row, branchId);
      await this.audit(tx, 'PRODUCT_CREATED', 'InventoryProduct', row.id, result, branchId);
      return result;
    });
  }

  updateProduct(id: string, input: InventoryProductUpdate, key: string | undefined) {
    const branchId = TenantContextStore.requireBranch();
    return this.mutate(key, `product:update:${id}`, { branchId, ...input }, async (tx) => {
      await this.lockProduct(tx, id);
      const row = await tx.inventoryProduct.update({ where: { id }, data: input, include: { stocks: { where: { branchId } } } });
      const result = serializeProduct(row, branchId);
      await this.audit(tx, 'PRODUCT_UPDATED', 'InventoryProduct', row.id, result, branchId);
      return result;
    });
  }

  async checkout(query: InventoryQuery) {
    const ctx = TenantContextStore.require();
    const branchId = TenantContextStore.requireBranch(query.branchId);
    const session = await this.prisma.client.cashSession.findFirst({
      where: { branchId, openedByUserId: ctx.userId, status: 'OPEN' }, select: { id: true },
    });
    const paymentMethods = await this.prisma.client.paymentMethod.findMany({
      where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true },
    });
    return { branchId, session, paymentMethods };
  }

  async movements(query: InventoryHistoryQuery) {
    const branchId = TenantContextStore.requireBranch(query.branchId);
    if (query.productId) await this.product(query.productId, query);
    const where = { branchId, ...(query.productId ? { productId: query.productId } : {}) };
    const rows = await this.prisma.client.inventoryStockMovement.findMany({ where, include: { product: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    return { data: rows.map(serializeMovement), total: await this.prisma.client.inventoryStockMovement.count({ where }),
      page: query.page, pageSize: query.pageSize };
  }

  adjust(input: InventoryStockInput, key: string | undefined) {
    const branchId = TenantContextStore.requireBranch(input.branchId);
    return this.mutate(key, 'stock:adjust', input, async (tx) => {
      await this.lockProduct(tx, input.productId);
      const row = await this.changeStock(tx, { ...input, branchId });
      const result = serializeMovement(row);
      await this.audit(tx, 'STOCK_ADJUSTED', 'InventoryStockMovement', row.id, result, branchId);
      return result;
    });
  }

  async sales(query: InventoryQuery) {
    const branchId = TenantContextStore.requireBranch(query.branchId);
    const where = { branchId };
    const rows = await this.prisma.client.inventorySale.findMany({ where, include: saleInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize });
    return { data: rows.map(serializeSale), total: await this.prisma.client.inventorySale.count({ where }),
      page: query.page, pageSize: query.pageSize };
  }

  async sale(id: string) {
    return serializeSale(await this.findSale(this.prisma.client, id));
  }

  sell(input: InventorySaleInput, key: string | undefined) {
    const ctx = TenantContextStore.require();
    const branchId = TenantContextStore.requireBranch(input.branchId);
    return this.mutate(key, 'sale:create', input, async (tx) => {
      const session = await this.lockOwnSession(tx, branchId);
      const paymentMethod = await tx.paymentMethod.findFirst({ where: { id: input.paymentMethodId, isActive: true } });
      if (!paymentMethod) throw AppError.notFound('El medio de pago');
      const items = [];
      // All writers lock products in UUID order. Stock and frozen prices are read under these locks.
      for (const item of [...input.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        const product = await this.lockProduct(tx, item.productId);
        if (!product.isActive) throw conflict(`El producto ${product.name} esta inactivo.`);
        const lineTotal = product.salePrice.mul(item.quantity);
        items.push({ productId: product.id, productName: product.name, sku: product.sku,
          quantity: item.quantity, unitPrice: product.salePrice, unitCost: product.costPrice, lineTotal });
      }
      const total = items.reduce((sum, i) => sum.plus(i.lineTotal), new Prisma.Decimal(0));
      if (total.gt(MAX_MONEY)) throw conflict('El total supera el importe permitido.');
      const concept = await tx.cashConcept.upsert({
        where: { gymId_code: { gymId: ctx.gymId, code: 'INVENTORY_SALE' } }, update: {},
        create: scoped({ code: 'INVENTORY_SALE', name: 'Venta de productos', type: 'INCOME', isSystem: true }),
      });
      if (concept.type !== 'INCOME' || !concept.isActive) throw conflict('El concepto de venta de productos no esta disponible.');
      const cash = await tx.cashMovement.create({ data: scoped({ cashSessionId: session.id, type: 'INCOME',
        amount: total, paymentMethodId: paymentMethod.id, cashConceptId: concept.id,
        description: 'Venta de productos', createdByUserId: ctx.userId }) });
      const sale = await tx.inventorySale.create({ data: scoped({ branchId, total,
        cashMovementId: cash.id, createdByUserId: ctx.userId }) });
      for (const item of items) {
        await tx.inventorySaleItem.create({ data: scoped({ ...item, saleId: sale.id }) });
        await this.changeStock(tx, { branchId, productId: item.productId, quantity: -item.quantity,
          type: 'SALE', reason: 'Venta de productos', saleId: sale.id });
      }
      const result = serializeSale(await this.findSale(tx, sale.id));
      await this.audit(tx, 'CASH_MOVEMENT_CREATED', 'CashMovement', cash.id, { saleId: sale.id, amount: total.toFixed(2) }, branchId);
      await this.audit(tx, 'PRODUCT_SOLD', 'InventorySale', sale.id, result, branchId);
      return result;
    });
  }

  async reverse(id: string, input: InventoryReverseInput, key: string | undefined) {
    const ctx = TenantContextStore.require();
    // Always re-authorize the resource before replaying a stored response.
    const own = await this.findSale(this.prisma.client, id);
    return this.mutate(key, `sale:reverse:${id}`, input, async (tx) => {
      const session = await this.lockOwnSession(tx, own.branchId);
      if (session.id !== own.cashMovement.cashSessionId) throw conflict('La reversa requiere la caja original abierta por su titular.');
      await tx.$queryRaw`SELECT id FROM inventory_sales WHERE id = ${id}::uuid AND "gymId" = ${ctx.gymId}::uuid FOR UPDATE`;
      const sale = await this.findSale(tx, id);
      if (sale.reversedAt || sale.cashMovement.isReversed) throw conflict('Esta venta ya fue revertida.');
      for (const item of [...sale.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await this.lockProduct(tx, item.productId);
        await this.changeStock(tx, { branchId: sale.branchId, productId: item.productId,
          quantity: item.quantity, type: 'REVERSAL', reason: input.reason, saleId: id });
      }
      const original = sale.cashMovement;
      const reversal = await tx.cashMovement.create({ data: scoped({ cashSessionId: session.id, type: 'EXPENSE',
        amount: original.amount, paymentMethodId: original.paymentMethodId, cashConceptId: original.cashConceptId,
        reversalOfId: original.id, reversalReason: input.reason, description: input.reason, createdByUserId: ctx.userId }) });
      await tx.cashMovement.update({ where: { id: original.id }, data: { isReversed: true, reversalReason: input.reason } });
      const updated = await tx.inventorySale.update({ where: { id }, data: { reversedAt: new Date(),
        reversalMovementId: reversal.id, reversalReason: input.reason }, include: saleInclude });
      await this.audit(tx, 'CASH_MOVEMENT_REVERSED', 'CashMovement', original.id, { saleId: id, reversalId: reversal.id }, sale.branchId);
      const result = serializeSale(updated);
      await this.audit(tx, 'PRODUCT_SALE_REVERSED', 'InventorySale', id, result, sale.branchId);
      return result;
    });
  }

  private async findSale(tx: Pick<PulsoTransactionClient, 'inventorySale'>, id: string) {
    const row = await tx.inventorySale.findFirst({ where: { id, branchId: { in: TenantContextStore.require().branchIds } }, include: saleInclude });
    if (!row) throw AppError.notFound('La venta');
    return row;
  }

  private async lockProduct(tx: PulsoTransactionClient, id: string) {
    const { gymId } = TenantContextStore.require();
    await tx.$queryRaw`SELECT id FROM inventory_products WHERE id = ${id}::uuid AND "gymId" = ${gymId}::uuid FOR UPDATE`;
    const product = await tx.inventoryProduct.findFirst({ where: { id } });
    if (!product) throw AppError.notFound('El producto');
    return product;
  }

  private async lockOwnSession(tx: PulsoTransactionClient, branchId: string) {
    const ctx = TenantContextStore.require();
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cash_sessions
      WHERE "gymId" = ${ctx.gymId}::uuid AND "branchId" = ${branchId}::uuid
      AND "openedByUserId" = ${ctx.userId}::uuid AND status = 'OPEN' FOR UPDATE`;
    if (!rows[0]) throw AppError.conflict(ErrorCode.NO_OPEN_CASH_SESSION, 'No tenes una caja propia abierta en esta sede.');
    return rows[0];
  }

  private async changeStock(tx: PulsoTransactionClient, input: { branchId: string; productId: string;
    quantity: number; type: 'RESTOCK' | 'ADJUSTMENT' | 'SALE' | 'REVERSAL'; reason: string; saleId?: string }) {
    const ctx = TenantContextStore.require();
    const where = { gymId_branchId_productId: { gymId: ctx.gymId, branchId: input.branchId, productId: input.productId } };
    const stock = await tx.inventoryStock.upsert({ where, update: {},
      create: scoped({ branchId: input.branchId, productId: input.productId, quantity: 0 }) });
    const next = stock.quantity + input.quantity;
    if (next < 0) throw conflict('Stock insuficiente en esta sede.');
    if (next > 2_147_483_647) throw conflict('La cantidad supera el stock permitido.');
    await tx.inventoryStock.update({ where, data: { quantity: next } });
    return tx.inventoryStockMovement.create({ data: scoped({ ...input, balanceAfter: next, createdByUserId: ctx.userId }), include: { product: true } });
  }

  private async audit(tx: PulsoTransactionClient, action: string, resourceType: string,
    resourceId: string, after: unknown, branchId: string) {
    const ctx = TenantContextStore.require();
    // AuditEvent.action is a string in the existing schema; do not change the shared AuditService union.
    await tx.auditEvent.create({ data: scoped({ action, resourceType, resourceId, branchId,
      actorType: 'USER', actorUserId: ctx.userId, requestId: ctx.requestId,
      after: redact(serialize(after)) as Prisma.InputJsonValue }) });
  }

  private async mutate<T>(key: string | undefined, operation: string, input: unknown,
    fn: (tx: PulsoTransactionClient) => Promise<T>): Promise<T> {
    const ctx = TenantContextStore.require();
    if (!key || key.trim().length < 8 || key.length > 200) {
      throw new AppError(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 400, 'Falta una Idempotency-Key valida (8 a 200 caracteres).');
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({ operation, userId: ctx.userId, input })).digest('hex');
    // Bounded retries restart the WHOLE transaction, including the response. No external effects here.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.client.$transaction(async (tx) => {
          const previous = await tx.inventoryOperation.findFirst({ where: { key: key.trim() } });
          if (previous) {
            if (previous.fingerprint !== fingerprint) throw AppError.conflict(ErrorCode.IDEMPOTENCY_KEY_REUSED, 'Esta clave ya se uso para otra operacion.');
            return previous.response as T;
          }
          const result = await fn(tx);
          await tx.inventoryOperation.create({ data: scoped({ key: key.trim(), fingerprint,
            response: result as Prisma.InputJsonValue }) });
          return result;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
      } catch (error) {
        const known = error instanceof Prisma.PrismaClientKnownRequestError ? error : null;
        const sqlCode = known?.meta?.['code'];
        const uniqueKey = known?.code === 'P2002' && String(known.meta?.['target']).includes('key');
        const retry = known?.code === 'P2034' || sqlCode === '40001' || sqlCode === '40P01' || uniqueKey;
        if (retry && attempt < 7) { await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1))); continue; }
        if (retry) throw conflict('Otra operacion modifico el stock. Reintenta con la misma clave.');
        if (known?.code === 'P2002') throw conflict('Ya existe un producto con ese SKU.');
        throw error;
      }
    }
  }
}
