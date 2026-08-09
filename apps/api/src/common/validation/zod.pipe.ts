import {
  type ArgumentMetadata,
  Body,
  Injectable,
  Param,
  type PipeTransform,
  Query,
} from '@nestjs/common';
import { type ZodError, type ZodSchema } from 'zod';
import { AppError, type FieldError } from '../errors/app-error.js';

/**
 * Validación con Zod (SECURITY_MODEL §5).
 *
 * Todo input del cliente pasa por acá: body, query y params. Lo que no está en
 * el esquema no llega al servicio; Zod hace strip de las claves de más, así que
 * un campo extra en el JSON no puede sobrescribir nada.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw AppError.validation(toFieldErrors(result.error));
  }
}

export function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((i) => ({
    field: i.path.join('.') || '(raíz)',
    code: i.code,
    message: i.message,
  }));
}

/** `@ZodBody(schema)` — valida y tipa el cuerpo. */
export const ZodBody = (schema: ZodSchema) => Body(new ZodValidationPipe(schema));

/** `@ZodQuery(schema)` — valida y tipa la query string. */
export const ZodQuery = (schema: ZodSchema) => Query(new ZodValidationPipe(schema));

/** `@ZodParam('id', schema)` — valida un parámetro de ruta. */
export const ZodParam = (name: string, schema: ZodSchema) =>
  Param(name, new ZodValidationPipe(schema));
