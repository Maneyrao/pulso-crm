import { Controller, Get, Headers, Patch, Post } from '@nestjs/common';
import type { z } from 'zod';
import { inventoryHistoryQuerySchema, inventoryProductInputSchema, inventoryProductUpdateSchema,
  inventoryQuerySchema, inventoryReverseInputSchema, inventorySaleInputSchema, inventoryStockInputSchema } from '@pulso/contracts/inventory';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest constructor metadata
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('products')
  @RequiresPermission('product:read')
  products(@ZodQuery(inventoryQuerySchema) query: z.infer<typeof inventoryQuerySchema>) { return this.service.products(query); }

  @Get('products/:id')
  @RequiresPermission('product:read')
  product(@ZodParam('id', uuidSchema) id: string, @ZodQuery(inventoryQuerySchema) query: z.infer<typeof inventoryQuerySchema>) { return this.service.product(id, query); }

  @Post('products')
  @RequiresPermission('product:write')
  create(@ZodBody(inventoryProductInputSchema) body: z.infer<typeof inventoryProductInputSchema>, @Headers('idempotency-key') key?: string) { return this.service.createProduct(body, key); }

  @Patch('products/:id')
  @RequiresPermission('product:write')
  update(@ZodParam('id', uuidSchema) id: string, @ZodBody(inventoryProductUpdateSchema) body: z.infer<typeof inventoryProductUpdateSchema>, @Headers('idempotency-key') key?: string) { return this.service.updateProduct(id, body, key); }

  @Get('checkout')
  @RequiresPermission('product:sell', 'cash:operate')
  checkout(@ZodQuery(inventoryQuerySchema) query: z.infer<typeof inventoryQuerySchema>) { return this.service.checkout(query); }

  @Get('stock/movements')
  @RequiresPermission('product:read')
  movements(@ZodQuery(inventoryHistoryQuerySchema) query: z.infer<typeof inventoryHistoryQuerySchema>) { return this.service.movements(query); }

  @Post('stock/movements')
  @RequiresPermission('product:write')
  adjust(@ZodBody(inventoryStockInputSchema) body: z.infer<typeof inventoryStockInputSchema>, @Headers('idempotency-key') key?: string) { return this.service.adjust(body, key); }

  @Get('sales')
  @RequiresPermission('product:read')
  sales(@ZodQuery(inventoryQuerySchema) query: z.infer<typeof inventoryQuerySchema>) { return this.service.sales(query); }

  @Get('sales/:id')
  @RequiresPermission('product:read')
  sale(@ZodParam('id', uuidSchema) id: string) { return this.service.sale(id); }

  @Post('sales')
  @RequiresPermission('product:sell', 'cash:operate')
  sell(@ZodBody(inventorySaleInputSchema) body: z.infer<typeof inventorySaleInputSchema>, @Headers('idempotency-key') key?: string) { return this.service.sell(body, key); }

  @Post('sales/:id/reverse')
  @RequiresPermission('product:sell', 'cash:operate')
  reverse(@ZodParam('id', uuidSchema) id: string, @ZodBody(inventoryReverseInputSchema) body: z.infer<typeof inventoryReverseInputSchema>, @Headers('idempotency-key') key?: string) { return this.service.reverse(id, body, key); }
}
