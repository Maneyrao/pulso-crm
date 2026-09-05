import { z } from 'zod';
import { isoInstantSchema, moneySchema, uuidSchema } from './common.js';

const nonNegativeMoney = moneySchema.refine((v) => !v.startsWith('-'), 'El importe no puede ser negativo.');
const positiveMoney = nonNegativeMoney.refine((v) => /[1-9]/.test(v), 'El precio debe ser mayor a cero.');
const quantity = z.number().int().min(1).max(1_000_000);
const reason = z.string().trim().min(5).max(500);

export const inventoryProductInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  sku: z.string().trim().min(1).max(64),
  costPrice: nonNegativeMoney,
  salePrice: positiveMoney,
  isActive: z.boolean().default(true),
}).strict();
export const inventoryProductUpdateSchema = inventoryProductInputSchema.partial();
export const inventoryQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  search: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export const inventoryHistoryQuerySchema = inventoryQuerySchema.extend({ productId: uuidSchema.optional() });
export const inventoryStockInputSchema = z.object({
  branchId: uuidSchema,
  productId: uuidSchema,
  type: z.enum(['RESTOCK', 'ADJUSTMENT']),
  quantity: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0),
  reason,
}).strict().refine((v) => v.type !== 'RESTOCK' || v.quantity > 0, {
  path: ['quantity'], message: 'La reposicion debe sumar unidades.',
});
export const inventorySaleInputSchema = z.object({
  branchId: uuidSchema,
  paymentMethodId: uuidSchema,
  items: z.array(z.object({ productId: uuidSchema, quantity }).strict()).min(1).max(50),
}).strict().refine((v) => new Set(v.items.map((i) => i.productId)).size === v.items.length, {
  path: ['items'], message: 'No repitas un producto en la venta.',
});
export const inventoryReverseInputSchema = z.object({ reason }).strict();
export const inventoryProductSchema = inventoryProductInputSchema.extend({
  id: uuidSchema,
  branchId: uuidSchema,
  stock: z.number().int().nonnegative(),
});
export const inventorySaleSchema = z.object({
  id: uuidSchema,
  branchId: uuidSchema,
  total: moneySchema,
  status: z.enum(['COMPLETED', 'REVERSED']),
  cashMovementId: uuidSchema,
  reversalMovementId: uuidSchema.nullable(),
  createdAt: isoInstantSchema,
  reversedAt: isoInstantSchema.nullable(),
  reversalReason: z.string().nullable(),
  paymentMethodName: z.string(),
  items: z.array(z.object({
    productId: uuidSchema, productName: z.string(), sku: z.string(), quantity,
    unitPrice: moneySchema, unitCost: moneySchema, lineTotal: moneySchema,
  })),
});
export const inventoryMovementSchema = z.object({
  id: uuidSchema, branchId: uuidSchema, productId: uuidSchema,
  productName: z.string(), sku: z.string(), saleId: uuidSchema.nullable(),
  type: z.enum(['RESTOCK', 'ADJUSTMENT', 'SALE', 'REVERSAL']),
  quantity: z.number().int(), balanceAfter: z.number().int().nonnegative(),
  reason: z.string(), createdAt: isoInstantSchema,
});
export type InventoryProductInput = z.infer<typeof inventoryProductInputSchema>;
export type InventoryProductUpdate = z.infer<typeof inventoryProductUpdateSchema>;
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;
export type InventoryHistoryQuery = z.infer<typeof inventoryHistoryQuerySchema>;
export type InventoryStockInput = z.infer<typeof inventoryStockInputSchema>;
export type InventorySaleInput = z.infer<typeof inventorySaleInputSchema>;
export type InventoryReverseInput = z.infer<typeof inventoryReverseInputSchema>;
export type InventoryProduct = z.infer<typeof inventoryProductSchema>;
export type InventorySale = z.infer<typeof inventorySaleSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
export interface InventoryPage<T> { data: T[]; total: number; page: number; pageSize: number }
export interface InventoryCheckout {
  branchId: string;
  session: { id: string } | null;
  paymentMethods: { id: string; name: string }[];
}
