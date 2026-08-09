import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@pulso/db';
import { map } from 'rxjs/operators';
import type { Observable } from 'rxjs';

/**
 * Serializa los importes como string decimal (ADR-010).
 *
 * `Prisma.Decimal` se convertiría en `{"s":1,"e":4,"d":[...]}` con el
 * `JSON.stringify` por defecto, y si alguien "arregla" eso con `.toNumber()`
 * vuelve el problema del float. Este interceptor lo resuelve en un solo lugar
 * para todas las respuestas.
 *
 * `Date` se serializa como ISO-8601. Los campos de tipo `date` puro
 * (`startDate`, `occurredOn`) los normaliza cada módulo, porque sólo ahí se
 * sabe que son días de negocio y no instantes.
 */
@Injectable()
export class DecimalSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => serialize(data)));
  }
}

const MAX_DEPTH = 12;

export function serialize(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value;
  if (value === null || value === undefined) return value;

  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toFixed(2);
  }

  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) return value.map((v) => serialize(v, depth + 1));

  if (typeof value === 'object') {
    // Buffer y tipos binarios se dejan como están: no son datos de dominio.
    if (Buffer.isBuffer(value)) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v, depth + 1);
    }
    return out;
  }

  return value;
}
