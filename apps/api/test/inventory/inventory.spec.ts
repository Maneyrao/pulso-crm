import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@pulso/db';
import type { InventorySale } from '@pulso/contracts/inventory';
import { TestClient, createTestApp, seedGymWithUsers, type TestApp } from '../harness.js';
import { inventoryCheckoutFixture, inventoryProductFixture } from './fixtures.js';

let ctx: TestApp;
let a: Awaited<ReturnType<typeof seedGymWithUsers>>;
let b: typeof a;
let owner: TestClient;
let foreign: TestClient;
let checkout: Awaited<ReturnType<typeof inventoryCheckoutFixture>>;
const idem = () => ({ 'Idempotency-Key': randomUUID() });
const productInput = () => ({ name: 'Bebida', sku: randomUUID(), costPrice: '10.01', salePrice: '20.03', isActive: true });

async function login(gym: typeof a, role = 'OWNER') {
  const client = new TestClient(ctx.baseUrl);
  expect((await client.post('/api/v1/auth/login', { email: gym.users[role]!.email, password: gym.password })).status).toBe(200);
  return client;
}

async function stocked(quantity = 5) {
  const product = await inventoryProductFixture(ctx.db.raw, a.gym.id);
  const result = await owner.post('/api/v1/inventory/stock/movements', { branchId: a.branch.id,
    productId: product.id, quantity, type: 'RESTOCK', reason: 'Reposicion inicial' }, idem());
  expect(result.status).toBe(201);
  return product;
}

const saleInput = (id: string, quantity = 1) => ({ branchId: a.branch.id, paymentMethodId: checkout.method.id, items: [{ productId: id, quantity }] });
async function quantityOf(productId: string) {
  return (await ctx.db.raw.inventoryStock.findFirst({ where: { gymId: a.gym.id, branchId: a.branch.id, productId } }))?.quantity ?? 0;
}

beforeAll(async () => {
  ctx = await createTestApp('inventory');
  a = await seedGymWithUsers(ctx.db, { slug: 'inventory-a' });
  b = await seedGymWithUsers(ctx.db, { slug: 'inventory-b' });
  owner = await login(a);
  foreign = await login(b);
  checkout = await inventoryCheckoutFixture(ctx.db.raw, a.gym.id, a.branch.id);
}, 180_000);
afterAll(async () => { await ctx?.close(); });

describe('inventario real: catalogo, stock y caja', () => {
  it('crea/edita/desactiva productos, conserva dinero string y SKU unique case insensitive por tenant', async () => {
    const input = productInput();
    const headers = idem();
    const created = await owner.post('/api/v1/inventory/products', input, headers);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...input, stock: 0, branchId: a.branch.id });
    expect((await owner.post('/api/v1/inventory/products', input, headers)).body).toEqual(created.body);
    expect((await owner.post('/api/v1/inventory/products', { ...input, sku: input.sku.toUpperCase() }, idem())).status).toBe(409);
    expect((await foreign.post('/api/v1/inventory/products', input, idem())).status).toBe(201);
    const id = (created.body as { id: string }).id;
    const patch = await owner.patch(`/api/v1/inventory/products/${id}`, { salePrice: '25.67', isActive: false }, idem());
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ salePrice: '25.67', isActive: false });
    expect((await owner.post('/api/v1/inventory/sales', saleInput(id), idem())).status).toBe(409);
    expect((await owner.post('/api/v1/inventory/products', { ...productInput(), salePrice: 20 }, idem())).status).toBe(422);
    expect((await owner.post('/api/v1/inventory/products', { ...productInput(), costPrice: '-1' }, idem())).status).toBe(422);
  });

  it('vende varias lineas en una transaccion con precios congelados, stock y auditoria', async () => {
    const first = await stocked(6);
    const second = await stocked(4);
    const response = await owner.post('/api/v1/inventory/sales', { ...saleInput(first.id, 2),
      items: [{ productId: first.id, quantity: 2 }, { productId: second.id, quantity: 3 }] }, idem());
    expect(response.status).toBe(201);
    const sale = response.body as InventorySale;
    expect(sale.total).toBe('617.25');
    expect(sale.items).toHaveLength(2);
    expect(await quantityOf(first.id)).toBe(4);
    expect(await quantityOf(second.id)).toBe(1);
    const cash = await ctx.db.raw.cashMovement.findUniqueOrThrow({ where: { id: sale.cashMovementId } });
    expect(cash.type).toBe('INCOME');
    expect(cash.amount.toFixed(2)).toBe(sale.total);
    expect(cash.cashSessionId).toBe(checkout.session.id);
    expect(await ctx.db.raw.inventoryStockMovement.count({ where: { saleId: sale.id, type: 'SALE' } })).toBe(2);
    expect(await ctx.db.raw.auditEvent.count({ where: { resourceId: sale.id, action: 'PRODUCT_SOLD' } })).toBe(1);
    await owner.patch(`/api/v1/inventory/products/${first.id}`, { salePrice: '999.99', name: 'Nuevo nombre' }, idem());
    const receipt = await owner.get(`/api/v1/inventory/sales/${sale.id}`);
    expect((receipt.body as InventorySale).items.find((i) => i.productId === first.id)?.unitPrice).toBe('123.45');
    expect((receipt.body as InventorySale).items.find((i) => i.productId === first.id)?.productName).toBe(first.name);
  });

  it('stock insuficiente revierte TODO, incluso caja, recibo y el descuento de otra linea', async () => {
    const first = await stocked(3);
    const second = await stocked(1);
    const cashBefore = await ctx.db.raw.cashMovement.count();
    const salesBefore = await ctx.db.raw.inventorySale.count();
    const response = await owner.post('/api/v1/inventory/sales', { ...saleInput(first.id),
      items: [{ productId: first.id, quantity: 2 }, { productId: second.id, quantity: 2 }] }, idem());
    expect(response.status).toBe(409);
    expect(await quantityOf(first.id)).toBe(3);
    expect(await quantityOf(second.id)).toBe(1);
    expect(await ctx.db.raw.cashMovement.count()).toBe(cashBefore);
    expect(await ctx.db.raw.inventorySale.count()).toBe(salesBefore);
  });

  it('5 ventas concurrentes con stock 3: exactamente 3 cobran y 2 rechazan', async () => {
    const product = await stocked(3);
    const results = await Promise.all(Array.from({ length: 5 }, () => owner.post('/api/v1/inventory/sales', saleInput(product.id), idem())));
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 409, 409]);
    expect(await quantityOf(product.id)).toBe(0);
    const sales = await ctx.db.raw.inventorySale.findMany({ where: { items: { some: { productId: product.id } } }, include: { cashMovement: true } });
    expect(sales).toHaveLength(3);
    expect(sales.reduce((n, s) => n.plus(s.cashMovement.amount), new Prisma.Decimal(0)).toFixed(2)).toBe('370.35');
  });

  it('idempotencia concurrente y persistida, payload/ruta/actor distintos no pueden reutilizar clave', async () => {
    const product = await stocked(5);
    const headers = idem();
    const body = saleInput(product.id, 2);
    const responses = await Promise.all(Array.from({ length: 3 }, () => owner.post('/api/v1/inventory/sales', body, headers)));
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(responses[1]!.body).toEqual(responses[0]!.body);
    expect(await quantityOf(product.id)).toBe(3);
    expect((await owner.post('/api/v1/inventory/sales', body, headers)).body).toEqual(responses[0]!.body);
    expect((await owner.post('/api/v1/inventory/sales', saleInput(product.id, 1), headers)).status).toBe(409);
    expect((await owner.post('/api/v1/inventory/products', productInput(), headers)).status).toBe(409);
    const receptionist = await login(a, 'RECEPTIONIST');
    expect((await receptionist.post('/api/v1/inventory/sales', body, headers)).status).toBe(409);
    expect((await owner.post('/api/v1/inventory/sales', body)).status).toBe(400);
  });

  it('reposicion/ajuste exigen motivo, no dejan negativo, conservan historial append-only', async () => {
    const product = await stocked(5);
    const body = { branchId: a.branch.id, productId: product.id, type: 'ADJUSTMENT', quantity: -2, reason: 'Envases rotos' };
    const headers = idem();
    const response = await owner.post('/api/v1/inventory/stock/movements', body, headers);
    expect(response.status).toBe(201);
    expect((await owner.post('/api/v1/inventory/stock/movements', body, headers)).body).toEqual(response.body);
    expect(await quantityOf(product.id)).toBe(3);
    expect((await owner.post('/api/v1/inventory/stock/movements', { ...body, quantity: -4 }, idem())).status).toBe(409);
    expect((await owner.post('/api/v1/inventory/stock/movements', { ...body, reason: '' }, idem())).status).toBe(422);
    expect((await owner.post('/api/v1/inventory/stock/movements', { ...body, type: 'RESTOCK' }, idem())).status).toBe(422);
    const history = await owner.get(`/api/v1/inventory/stock/movements?productId=${product.id}`);
    expect(history.status).toBe(200);
    expect((history.body as { data: unknown[] }).data).toHaveLength(2);
    await expect(ctx.db.raw.inventoryStockMovement.update({ where: { id: (response.body as { id: string }).id }, data: { reason: 'Cambio ilegal' } })).rejects.toThrow();
    await expect(ctx.db.raw.inventoryStock.updateMany({ where: { productId: product.id }, data: { quantity: -1 } })).rejects.toThrow();
  });

  it('reversa atomica devuelve stock y EXPENSE; guard generico y doble reversa concurrente', async () => {
    const product = await stocked(3);
    const created = await owner.post('/api/v1/inventory/sales', saleInput(product.id, 2), idem());
    const sale = created.body as InventorySale;
    const generic = await owner.post(`/api/v1/cash/movements/${sale.cashMovementId}/reverse`, { reason: 'Venta anulada' }, idem());
    expect(generic.status).toBe(409);
    expect(await quantityOf(product.id)).toBe(1);
    // The database guard also rejects bypassing the HTTP guard through a raw generic reversal.
    await expect(ctx.db.raw.$transaction(async (tx) => {
      const cash = await tx.cashMovement.findUniqueOrThrow({ where: { id: sale.cashMovementId } });
      await tx.cashMovement.create({ data: { gymId: a.gym.id, cashSessionId: cash.cashSessionId,
        type: 'EXPENSE', amount: cash.amount, paymentMethodId: cash.paymentMethodId, cashConceptId: cash.cashConceptId,
        reversalOfId: cash.id, reversalReason: 'Solo caja incorrecto', createdByUserId: checkout.userId } });
      await tx.cashMovement.update({ where: { id: cash.id }, data: { isReversed: true } });
    })).rejects.toThrow();
    const results = await Promise.all(Array.from({ length: 2 }, () => owner.post(`/api/v1/inventory/sales/${sale.id}/reverse`, { reason: 'Venta anulada' }, idem())));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await quantityOf(product.id)).toBe(3);
    const reversed = results.find((r) => r.status === 201)!.body as InventorySale;
    expect(reversed.status).toBe('REVERSED');
    const cash = await ctx.db.raw.cashMovement.findUniqueOrThrow({ where: { id: reversed.reversalMovementId! } });
    expect(cash.type).toBe('EXPENSE');
    expect(cash.amount.toFixed(2)).toBe('246.90');
    expect(cash.reversalOfId).toBe(sale.cashMovementId);
  });

  it('caja propia obligatoria, medios activos sin hardcode (QR) y stock separado por sede', async () => {
    const product = await stocked(3);
    const reception = await login(a, 'RECEPTIONIST');
    expect((await reception.post('/api/v1/inventory/sales', saleInput(product.id), idem())).status).toBe(409);
    const otherBranch = await ctx.db.raw.branch.create({ data: { gymId: a.gym.id, name: 'Otra sede inventario' } });
    await ctx.db.raw.userBranchAccess.create({ data: { gymId: a.gym.id, userId: checkout.userId, branchId: otherBranch.id } });
    const refreshed = await login(a);
    const restock = await refreshed.post('/api/v1/inventory/stock/movements', { productId: product.id, branchId: otherBranch.id, type: 'RESTOCK', quantity: 10, reason: 'Entrega sucursal' }, idem());
    expect(restock.status).toBe(201);
    expect((await refreshed.post('/api/v1/inventory/sales', { ...saleInput(product.id), branchId: otherBranch.id }, idem())).status).toBe(409);
    expect((await refreshed.get(`/api/v1/inventory/products/${product.id}?branchId=${otherBranch.id}`)).body).toMatchObject({ stock: 10 });
    expect(await quantityOf(product.id)).toBe(3);
    const qr = await ctx.db.raw.paymentMethod.create({ data: { gymId: a.gym.id, code: 'QR', name: 'Billetera' } });
    const paid = await owner.post('/api/v1/inventory/sales', { ...saleInput(product.id), paymentMethodId: qr.id }, idem());
    expect(paid.status).toBe(201);
    await ctx.db.raw.paymentMethod.update({ where: { id: qr.id }, data: { isActive: false } });
    expect((await owner.post('/api/v1/inventory/sales', { ...saleInput(product.id), paymentMethodId: qr.id }, idem())).status).toBe(404);
  });

  it('rechaza cantidades invalidas/duplicadas y overflow de dinero sin cobrar', async () => {
    const product = await stocked(3);
    for (const quantity of [0, -1, 0.5]) expect((await owner.post('/api/v1/inventory/sales', saleInput(product.id, quantity), idem())).status).toBe(422);
    expect((await owner.post('/api/v1/inventory/sales', { ...saleInput(product.id), items: [saleInput(product.id).items[0], saleInput(product.id).items[0]] }, idem())).status).toBe(422);
    await owner.patch(`/api/v1/inventory/products/${product.id}`, { salePrice: '999999999999.99' }, idem());
    expect((await owner.post('/api/v1/inventory/sales', saleInput(product.id, 2), idem())).status).toBe(409);
    expect(await quantityOf(product.id)).toBe(3);
  });
});

describe('cross-tenant y permisos: todos los endpoints nuevos', () => {
  it('oculta ids de productos/ventas, branchId, paymentMethodId y productId ajenos sin efectos', async () => {
    const product = await stocked(4);
    const sale = (await owner.post('/api/v1/inventory/sales', saleInput(product.id), idem())).body as InventorySale;
    const before = await quantityOf(product.id);
    const actions = [
      () => foreign.get(`/api/v1/inventory/products/${product.id}`),
      () => foreign.patch(`/api/v1/inventory/products/${product.id}`, { name: 'Ajeno' }, idem()),
      () => foreign.get(`/api/v1/inventory/sales/${sale.id}`),
      () => foreign.post(`/api/v1/inventory/sales/${sale.id}/reverse`, { reason: 'Venta ajena' }, idem()),
      () => foreign.post('/api/v1/inventory/stock/movements', { branchId: b.branch.id, productId: product.id, type: 'RESTOCK', quantity: 2, reason: 'Stock ajeno' }, idem()),
    ];
    for (const action of actions) expect((await action()).status).toBe(404);
    for (const path of ['products', 'stock/movements', 'sales', 'checkout']) {
      const list = await foreign.get(`/api/v1/inventory/${path}`);
      expect(list.status).toBe(200);
      expect(JSON.stringify(list.body)).not.toContain(product.id);
      expect(JSON.stringify(list.body)).not.toContain(sale.id);
      expect((await foreign.get(`/api/v1/inventory/${path}?branchId=${a.branch.id}`)).status).toBe(404);
    }
    expect((await foreign.get(`/api/v1/inventory/stock/movements?productId=${product.id}`)).status).toBe(404);
    const ownForeignProduct = await inventoryProductFixture(ctx.db.raw, b.gym.id);
    const bc = await inventoryCheckoutFixture(ctx.db.raw, b.gym.id, b.branch.id);
    expect((await foreign.post('/api/v1/inventory/sales', { branchId: b.branch.id, paymentMethodId: bc.method.id, items: [{ productId: product.id, quantity: 1 }] }, idem())).status).toBe(404);
    expect((await foreign.post('/api/v1/inventory/sales', { branchId: b.branch.id, paymentMethodId: checkout.method.id, items: [{ productId: ownForeignProduct.id, quantity: 1 }] }, idem())).status).toBe(404);
    expect((await foreign.post('/api/v1/inventory/sales', saleInput(product.id), idem())).status).toBe(404);
    expect((await foreign.post('/api/v1/inventory/products', { ...productInput(), gymId: a.gym.id }, idem())).status).toBe(422);
    expect(await quantityOf(product.id)).toBe(before);
  });

  it('cada permiso se exige independientemente; rechaza sede propia sin acceso', async () => {
    const product = await stocked(2);
    const receptionist = await login(a, 'RECEPTIONIST');
    expect((await receptionist.post('/api/v1/inventory/products', productInput(), idem())).status).toBe(403);
    expect((await receptionist.post('/api/v1/inventory/stock/movements', { branchId: a.branch.id, productId: product.id, type: 'RESTOCK', quantity: 1, reason: 'Sin permiso' }, idem())).status).toBe(403);
    const role = await ctx.db.raw.role.findFirstOrThrow({ where: { gymId: b.gym.id, code: 'RECEPTIONIST' } });
    for (const permissions of [['product:sell'], ['cash:operate'], ['product:write']]) {
      await ctx.db.raw.role.update({ where: { id: role.id }, data: { permissions } });
      const restricted = await login(b, 'RECEPTIONIST');
      expect((await restricted.get('/api/v1/inventory/products')).status).toBe(403);
      expect((await restricted.get('/api/v1/inventory/checkout')).status).toBe(403);
      expect((await restricted.post('/api/v1/inventory/sales', { ...saleInput(product.id), branchId: b.branch.id }, idem())).status).toBe(403);
    }
    const branch = await ctx.db.raw.branch.create({ data: { gymId: a.gym.id, name: 'Sede restringida' } });
    expect((await receptionist.get(`/api/v1/inventory/products?branchId=${branch.id}`)).status).toBe(404);
  });
});
