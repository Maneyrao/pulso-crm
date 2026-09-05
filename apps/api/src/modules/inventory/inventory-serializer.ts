import type { Prisma } from '@pulso/db';
import type { InventoryProduct, InventorySale, InventoryMovement } from '@pulso/contracts/inventory';

export const saleInclude = { items: true, cashMovement: { include: { paymentMethod: true } } } as const;

export function serializeProduct(
  row: Prisma.InventoryProductGetPayload<{ include: { stocks: true } }>,
  branchId: string,
): InventoryProduct {
  return { id: row.id, name: row.name, sku: row.sku, costPrice: row.costPrice.toFixed(2),
    salePrice: row.salePrice.toFixed(2), isActive: row.isActive, branchId,
    stock: row.stocks.find((s) => s.branchId === branchId)?.quantity ?? 0 };
}

export function serializeSale(row: Prisma.InventorySaleGetPayload<{ include: typeof saleInclude }>): InventorySale {
  return { id: row.id, branchId: row.branchId, total: row.total.toFixed(2),
    status: row.reversedAt ? 'REVERSED' : 'COMPLETED', cashMovementId: row.cashMovementId,
    reversalMovementId: row.reversalMovementId, createdAt: row.createdAt.toISOString(),
    reversedAt: row.reversedAt?.toISOString() ?? null, reversalReason: row.reversalReason,
    paymentMethodName: row.cashMovement.paymentMethod.name,
    items: row.items.map((i) => ({ productId: i.productId, productName: i.productName, sku: i.sku,
      quantity: i.quantity, unitPrice: i.unitPrice.toFixed(2), unitCost: i.unitCost.toFixed(2),
      lineTotal: i.lineTotal.toFixed(2) })) };
}

export function serializeMovement(row: Prisma.InventoryStockMovementGetPayload<{ include: { product: true } }>): InventoryMovement {
  return { id: row.id, branchId: row.branchId, productId: row.productId,
    productName: row.product.name, sku: row.product.sku, saleId: row.saleId,
    type: row.type, quantity: row.quantity, balanceAfter: row.balanceAfter,
    reason: row.reason, createdAt: row.createdAt.toISOString() };
}
