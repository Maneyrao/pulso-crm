import { Module } from '@nestjs/common';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { MemberPaymentController } from './member-payment.controller.js';
import { MemberPaymentService } from './member-payment.service.js';

@Module({
  controllers: [MembersController, MemberPaymentController],
  providers: [MembersService, MemberPaymentService],
  exports: [MembersService],
})
export class MembersModule {}
