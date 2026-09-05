import type { InventoryCheckout, InventoryHistoryQuery, InventoryMovement, InventoryPage,
  InventoryProduct, InventoryProductInput, InventoryProductUpdate, InventoryQuery,
  InventoryReverseInput, InventorySale, InventorySaleInput, InventoryStockInput } from '@pulso/contracts/inventory';
import { apiFetch, toQueryString } from './client.js';

export const listInventoryProducts = (query: Partial<InventoryQuery>) =>
  apiFetch<InventoryPage<InventoryProduct>>(`/inventory/products${toQueryString(query)}`);
export const createInventoryProduct = (body: InventoryProductInput, idempotencyKey: string) =>
  apiFetch<InventoryProduct>('/inventory/products', { method: 'POST', body, idempotencyKey });
export const updateInventoryProduct = (id: string, body: InventoryProductUpdate, idempotencyKey: string) =>
  apiFetch<InventoryProduct>(`/inventory/products/${id}`, { method: 'PATCH', body, idempotencyKey });
export const getInventoryCheckout = (branchId: string) =>
  apiFetch<InventoryCheckout>(`/inventory/checkout${toQueryString({ branchId })}`);
export const adjustInventoryStock = (body: InventoryStockInput, idempotencyKey: string) =>
  apiFetch<InventoryMovement>('/inventory/stock/movements', { method: 'POST', body, idempotencyKey });
export const listInventoryMovements = (query: Partial<InventoryHistoryQuery>) =>
  apiFetch<InventoryPage<InventoryMovement>>(`/inventory/stock/movements${toQueryString(query)}`);
export const listInventorySales = (query: Partial<InventoryQuery>) =>
  apiFetch<InventoryPage<InventorySale>>(`/inventory/sales${toQueryString(query)}`);
export const createInventorySale = (body: InventorySaleInput, idempotencyKey: string) =>
  apiFetch<InventorySale>('/inventory/sales', { method: 'POST', body, idempotencyKey });
export const reverseInventorySale = (id: string, body: InventoryReverseInput, idempotencyKey: string) =>
  apiFetch<InventorySale>(`/inventory/sales/${id}/reverse`, { method: 'POST', body, idempotencyKey });
