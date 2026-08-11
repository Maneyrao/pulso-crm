import { Module } from '@nestjs/common';
import { GymController } from './gym.controller.js';
import { GymService } from './gym.service.js';
import { BranchController } from './branch.controller.js';
import { BranchService } from './branch.service.js';

/** T-2.6 — API_CONTRACTS §4 "Tenancy": gimnasio y sedes. */
@Module({
  controllers: [GymController, BranchController],
  providers: [GymService, BranchService],
  exports: [GymService, BranchService],
})
export class TenancyModule {}
