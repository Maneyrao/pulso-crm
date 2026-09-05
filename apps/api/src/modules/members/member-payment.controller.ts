import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { memberPaymentQuoteQuerySchema, payDebtRequestSchema, type PayDebtRequest } from '@pulso/contracts/cash';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest constructor injection
import { MemberPaymentService } from './member-payment.service.js';

@Controller('members')
export class MemberPaymentController {
  constructor(private readonly payments: MemberPaymentService) {}

  @Get(':id/payment-quote')
  @RequiresPermission('member:read', 'cash:operate', 'payment:collect')
  quote(@ZodParam('id', uuidSchema) id: string, @ZodQuery(memberPaymentQuoteQuerySchema) query: { paymentMethodId?: string }) {
    return this.payments.quote(id, query.paymentMethodId);
  }

  @Post(':id/pay-debt')
  @HttpCode(201)
  @RequiresPermission('member:read', 'cash:operate', 'payment:collect')
  @Idempotent()
  pay(@ZodParam('id', uuidSchema) id: string, @ZodBody(payDebtRequestSchema) body: PayDebtRequest) {
    return this.payments.pay(id, body);
  }
}
