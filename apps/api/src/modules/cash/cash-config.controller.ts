import { Controller, Get, Patch, Post } from '@nestjs/common';
import { type z } from 'zod';
import {
  createCashConceptRequestSchema,
  createPaymentMethodRequestSchema,
  updateCashConceptRequestSchema,
  updatePaymentMethodRequestSchema,
} from '@pulso/contracts/cash';
import { uuidSchema } from '@pulso/contracts/common';
import { RequiresPermission } from '../../common/auth/decorators.js';
import { ZodBody, ZodParam, ZodQuery } from '../../common/validation/zod.pipe.js';
// Import de VALOR: dependencia del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { CashConfigService } from './cash-config.service.js';
import {
  createCashRegisterRequestSchema,
  listCashRegistersQuerySchema,
  updateCashRegisterRequestSchema,
} from './schemas/cash-register.schemas.js';

/**
 * Configuración de caja (API_CONTRACTS §8 "Resto de caja").
 *
 * Lectura con `cash:read`, escritura con `config:write` — el mismo criterio
 * que el resto de la configuración del gimnasio, no un permiso propio de
 * caja: dar de alta un método de pago es una decisión administrativa, no
 * operativa.
 */
@Controller('cash')
export class CashConfigController {
  constructor(private readonly service: CashConfigService) {}

  // ── PaymentMethod ─────────────────────────────────────────────────────

  @RequiresPermission('cash:read')
  @Get('payment-methods')
  async listPaymentMethods() {
    const data = await this.service.listPaymentMethods();
    return { data };
  }

  @RequiresPermission('config:write')
  @Post('payment-methods')
  async createPaymentMethod(
    @ZodBody(createPaymentMethodRequestSchema)
    body: z.infer<typeof createPaymentMethodRequestSchema>,
  ) {
    return this.service.createPaymentMethod(body);
  }

  @RequiresPermission('config:write')
  @Patch('payment-methods/:id')
  async updatePaymentMethod(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updatePaymentMethodRequestSchema)
    body: z.infer<typeof updatePaymentMethodRequestSchema>,
  ) {
    return this.service.updatePaymentMethod(id, body);
  }

  // ── CashConcept ───────────────────────────────────────────────────────

  @RequiresPermission('cash:read')
  @Get('concepts')
  async listCashConcepts() {
    const data = await this.service.listCashConcepts();
    return { data };
  }

  @RequiresPermission('config:write')
  @Post('concepts')
  async createCashConcept(
    @ZodBody(createCashConceptRequestSchema) body: z.infer<typeof createCashConceptRequestSchema>,
  ) {
    return this.service.createCashConcept(body);
  }

  @RequiresPermission('config:write')
  @Patch('concepts/:id')
  async updateCashConcept(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateCashConceptRequestSchema) body: z.infer<typeof updateCashConceptRequestSchema>,
  ) {
    return this.service.updateCashConcept(id, body);
  }

  // ── CashRegister ──────────────────────────────────────────────────────

  @RequiresPermission('cash:read')
  @Get('registers')
  async listCashRegisters(
    @ZodQuery(listCashRegistersQuerySchema) query: z.infer<typeof listCashRegistersQuerySchema>,
  ) {
    const data = await this.service.listCashRegisters(query.branchId);
    return { data };
  }

  @RequiresPermission('config:write')
  @Post('registers')
  async createCashRegister(
    @ZodBody(createCashRegisterRequestSchema) body: z.infer<typeof createCashRegisterRequestSchema>,
  ) {
    return this.service.createCashRegister(body);
  }

  @RequiresPermission('config:write')
  @Patch('registers/:id')
  async updateCashRegister(
    @ZodParam('id', uuidSchema) id: string,
    @ZodBody(updateCashRegisterRequestSchema) body: z.infer<typeof updateCashRegisterRequestSchema>,
  ) {
    return this.service.updateCashRegister(id, body);
  }
}
