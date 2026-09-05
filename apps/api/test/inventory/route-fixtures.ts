import { randomUUID } from 'node:crypto';
import type { ResourceFixture } from '../tenancy/resource-fixtures.js';
import { inventoryCheckoutFixture, inventoryProductFixture, inventorySaleFixture } from './fixtures.js';

export const INVENTORY_ROUTE_FIXTURES: Record<string, ResourceFixture> = {
  'inventory/products': {
    createId: async (raw, gymId) => (await inventoryProductFixture(raw, gymId)).id,
    createBody: async () => ({ name: 'Producto nuevo', sku: randomUUID(), costPrice: '1.10', salePrice: '2.20' }),
    readRaw: (raw, id) => raw.inventoryProduct.findUnique({ where: { id } }),
  },
  'inventory/sales': {
    createId: async (raw, gymId, branchId) => (await inventorySaleFixture(raw, gymId, branchId)).id,
    createBody: async (raw, gymId, branchId) => {
      const product = await inventoryProductFixture(raw, gymId);
      const checkout = await inventoryCheckoutFixture(raw, gymId, branchId);
      await raw.inventoryStock.create({ data: { gymId, branchId, productId: product.id, quantity: 1 } });
      return { branchId, paymentMethodId: checkout.method.id, items: [{ productId: product.id, quantity: 1 }] };
    },
    readRaw: (raw, id) => raw.inventorySale.findUnique({ where: { id } }),
  },
  'inventory/stock/movements': {
    createId: async (raw, gymId, branchId) => {
      const product = await inventoryProductFixture(raw, gymId);
      const user = await raw.user.findFirstOrThrow({ where: { gymId } });
      return (await raw.inventoryStockMovement.create({ data: { gymId, branchId, productId: product.id,
        quantity: 1, balanceAfter: 1, type: 'RESTOCK', reason: 'Stock inicial', createdByUserId: user.id } })).id;
    },
    createBody: async (raw, gymId, branchId) => ({ branchId, productId: (await inventoryProductFixture(raw, gymId)).id,
      quantity: 1, type: 'RESTOCK', reason: 'Reposicion de prueba' }),
    readRaw: (raw, id) => raw.inventoryStockMovement.findUnique({ where: { id } }),
  },
  // Checkout exposes the caller's open session, so the foreign fixture is an actual open cash session.
  'inventory/checkout': {
    createId: async (raw, gymId, branchId) => (await inventoryCheckoutFixture(raw, gymId, branchId)).session.id,
    readRaw: (raw, id) => raw.cashSession.findUnique({ where: { id } }),
  },
};
