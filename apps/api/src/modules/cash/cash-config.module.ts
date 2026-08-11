import { Module } from '@nestjs/common';
import { CashConfigController } from './cash-config.controller.js';
import { CashConfigService } from './cash-config.service.js';

@Module({
  controllers: [CashConfigController],
  providers: [CashConfigService],
  exports: [CashConfigService],
})
export class CashConfigModule {}
