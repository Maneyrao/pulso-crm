/**
 * `packages/contracts/src/cash.ts` define la forma de `CashRegister` (la
 * entidad) pero no los request/response de su CRUD — a diferencia de
 * `PaymentMethod` y `CashConcept`, que sí los tienen. Como no se puede tocar
 * `packages/**` en esta tarea, estos schemas quedan acá, siguiendo exactamente
 * la misma forma que `createPaymentMethodRequestSchema` /
 * `updatePaymentMethodRequestSchema` para no introducir una convención nueva.
 */
import { z } from 'zod';
import { uuidSchema } from '@pulso/contracts/common';

export const createCashRegisterRequestSchema = z.object({
  branchId: uuidSchema,
  name: z.string().min(1),
});
export type CreateCashRegisterRequest = z.infer<typeof createCashRegisterRequestSchema>;

export const updateCashRegisterRequestSchema = z
  .object({
    name: z.string().min(1),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateCashRegisterRequest = z.infer<typeof updateCashRegisterRequestSchema>;

export const listCashRegistersQuerySchema = z.object({
  branchId: uuidSchema.optional(),
});
export type ListCashRegistersQuery = z.infer<typeof listCashRegistersQuerySchema>;
