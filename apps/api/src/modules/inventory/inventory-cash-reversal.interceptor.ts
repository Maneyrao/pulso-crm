import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest constructor metadata
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { CashMovementController } from '../cash/cash-movement.controller.js';

/** A linked sale must be reversed through inventory, with stock and cash in the same commit. */
@Injectable()
export class InventoryCashReversalInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getClass() === CashMovementController && context.getHandler() === CashMovementController.prototype.reverse) {
      const req = context.switchToHttp().getRequest<Request>();
      const id = req.params['id'];
      if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) {
        const sale = await this.prisma.client.inventorySale.findFirst({ where: { cashMovementId: id } });
        if (sale) {
          if (!TenantContextStore.require().branchIds.includes(sale.branchId)) throw AppError.notFound('El movimiento de caja');
          throw AppError.conflict(ErrorCode.CONFLICT, 'Esta venta debe revertirse desde Inventario para devolver tambien el stock.');
        }
      }
    }
    return next.handle();
  }
}
