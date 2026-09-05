import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@pulso/db';

export async function inventoryProductFixture(raw: PrismaClient, gymId: string) {
  return raw.inventoryProduct.create({ data: { gymId, name: 'Agua mineral', sku: randomUUID(), costPrice: '50.25', salePrice: '123.45' } });
}

export async function inventoryCheckoutFixture(raw: PrismaClient, gymId: string, branchId: string, userId?: string) {
  const owner = userId ?? (await raw.user.findFirstOrThrow({ where: { gymId, roleAssignments: { some: { role: { code: 'OWNER' } } } } })).id;
  const method = await raw.paymentMethod.upsert({ where: { gymId_code: { gymId, code: 'CASH' } }, update: {},
    create: { gymId, code: 'CASH', name: 'Efectivo', countsAsCash: true } });
  const concept = await raw.cashConcept.upsert({ where: { gymId_code: { gymId, code: 'INVENTORY_SALE' } }, update: {},
    create: { gymId, code: 'INVENTORY_SALE', name: 'Venta de productos', type: 'INCOME', isSystem: true } });
  let session = await raw.cashSession.findFirst({ where: { gymId, openedByUserId: owner, status: 'OPEN' } });
  if (!session) {
    const register = await raw.cashRegister.create({ data: { gymId, branchId, name: `Caja ${randomUUID()}` } });
    session = await raw.cashSession.create({ data: { gymId, branchId, cashRegisterId: register.id,
      openedByUserId: owner, openingAmount: '0.00', businessDate: new Date('2026-09-04') } });
  }
  return { session, method, concept, userId: owner };
}

export async function inventorySaleFixture(raw: PrismaClient, gymId: string, branchId: string) {
  const product = await inventoryProductFixture(raw, gymId);
  const checkout = await inventoryCheckoutFixture(raw, gymId, branchId);
  const cash = await raw.cashMovement.create({ data: { gymId, cashSessionId: checkout.session.id,
    type: 'INCOME', amount: product.salePrice, paymentMethodId: checkout.method.id,
    cashConceptId: checkout.concept.id, createdByUserId: checkout.userId } });
  const sale = await raw.inventorySale.create({ data: { gymId, branchId, cashMovementId: cash.id,
    total: product.salePrice, createdByUserId: checkout.userId } });
  await raw.inventorySaleItem.create({ data: { gymId, saleId: sale.id, productId: product.id,
    productName: product.name, sku: product.sku, quantity: 1, unitPrice: product.salePrice,
    unitCost: product.costPrice, lineTotal: product.salePrice } });
  return sale;
}
