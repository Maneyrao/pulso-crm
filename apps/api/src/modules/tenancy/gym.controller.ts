import { Controller, Get, Patch } from '@nestjs/common';
import { type UpdateGymRequest, updateGymRequestSchema } from '@pulso/contracts/tenancy';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/validation/zod.pipe.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota en infra/redis/redis.service.ts
import { GymService } from './gym.service.js';

@Controller('gym')
export class GymController {
  constructor(private readonly gym: GymService) {}

  @RequiresPermission('config:read')
  @Get()
  get() {
    return this.gym.get();
  }

  @RequiresPermission('config:write')
  @Patch()
  update(@ZodBody(updateGymRequestSchema) body: UpdateGymRequest) {
    return this.gym.update(body);
  }
}
