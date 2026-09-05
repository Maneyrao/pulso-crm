import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { InventoryCashReversalInterceptor } from './inventory-cash-reversal.interceptor.js';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, { provide: APP_INTERCEPTOR, useClass: InventoryCashReversalInterceptor }],
})
export class InventoryModule {}
