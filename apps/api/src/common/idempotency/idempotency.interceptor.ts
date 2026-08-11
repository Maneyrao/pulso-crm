import { createHash } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { from, of, switchMap, tap } from 'rxjs';
import type { Observable } from 'rxjs';
import { scoped } from '@pulso/db';
import { type PrismaService } from '../../infra/prisma/prisma.service.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { serialize } from '../money/decimal.serializer.js';

export const IDEMPOTENT_KEY = 'pulso:idempotent';

/**
 * Marca una operación como idempotente (ADR-016).
 *
 * Toda operación con efecto sobre dinero, membresías o mensajería la lleva.
 * El cliente manda `Idempotency-Key` y un doble click, un reintento por timeout
 * o un reenvío del navegador producen un solo efecto.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);

/** Cuánto se conserva la respuesta guardada para poder repetirla. */
const RETENTION_HOURS = 24;

/**
 * Si un request queda IN_PROGRESS más que esto, se asume que el proceso murió
 * a mitad y se permite reintentar. Sin este rescate, un crash dejaría la clave
 * trabada para siempre.
 */
const STALE_LOCK_MINUTES = 5;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isIdempotent) return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || key.trim().length < 8) {
      throw new AppError(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        400,
        'Falta el header Idempotency-Key.',
        {
          detail:
            'Esta operación exige un header Idempotency-Key de al menos 8 caracteres, ' +
            'para que un reintento no la ejecute dos veces.',
        },
      );
    }

    const endpoint = `${req.method} ${req.route?.path ?? req.path}`;
    const requestHash = hashBody(req.body);

    return from(this.claim(key.trim(), endpoint, requestHash)).pipe(
      switchMap((claim) => {
        if (claim.kind === 'replay') {
          res.setHeader('Idempotency-Replayed', 'true');
          res.status(claim.status);
          return of(claim.body);
        }

        return next.handle().pipe(
          tap({
            next: (body) => {
              void this.complete(claim.id, res.statusCode, serialize(body));
            },
            error: () => {
              // Un fallo libera la clave: el cliente puede corregir y reintentar
              // con la misma. Si quedara COMPLETED, un error transitorio dejaría
              // la operación imposible de repetir.
              void this.fail(claim.id);
            },
          }),
        );
      }),
    );
  }

  /**
   * Toma la clave o detecta que ya se usó.
   *
   * El insert con unique(gymId, key) es el que resuelve la carrera: si dos
   * requests concurrentes llegan con la misma clave, uno inserta y el otro
   * choca contra el índice.
   */
  private async claim(
    key: string,
    endpoint: string,
    requestHash: string,
  ): Promise<
    | { kind: 'claimed'; id: string }
    | { kind: 'replay'; status: number; body: unknown }
  > {
    const db = this.prisma.client;
    const expiresAt = new Date(Date.now() + RETENTION_HOURS * 3_600_000);

    try {
      const created = await db.idempotencyKey.create({
        data: scoped({ key, endpoint, requestHash, expiresAt, status: 'IN_PROGRESS' as const }),
      });
      return { kind: 'claimed', id: created.id };
    } catch {
      // Ya existe: puede ser un replay legítimo, un conflicto o un lock vencido.
    }

    const existing = await db.idempotencyKey.findFirst({ where: { key } });
    if (!existing) {
      // Desapareció entre el insert fallido y la lectura (expiración).
      // Reintentar una vez es razonable; si vuelve a fallar, que explote.
      const created = await db.idempotencyKey.create({
        data: scoped({ key, endpoint, requestHash, expiresAt, status: 'IN_PROGRESS' as const }),
      });
      return { kind: 'claimed', id: created.id };
    }

    if (existing.requestHash !== requestHash) {
      throw AppError.conflict(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'Esa clave de idempotencia ya se usó con otros datos. Generá una nueva.',
      );
    }

    if (existing.status === 'COMPLETED') {
      return {
        kind: 'replay',
        status: existing.responseStatus ?? 200,
        body: existing.responseBody,
      };
    }

    if (existing.status === 'FAILED') {
      await db.idempotencyKey.update({
        where: { id: existing.id },
        data: { status: 'IN_PROGRESS', lockedAt: new Date() },
      });
      return { kind: 'claimed', id: existing.id };
    }

    // IN_PROGRESS
    const stale = Date.now() - existing.lockedAt.getTime() > STALE_LOCK_MINUTES * 60_000;
    if (stale) {
      await db.idempotencyKey.update({
        where: { id: existing.id },
        data: { lockedAt: new Date() },
      });
      return { kind: 'claimed', id: existing.id };
    }

    throw AppError.conflict(
      ErrorCode.IDEMPOTENCY_IN_PROGRESS,
      'La misma operación se está procesando. Esperá el resultado antes de reintentar.',
    );
  }

  private async complete(id: string, status: number, body: unknown): Promise<void> {
    await this.prisma.client.idempotencyKey
      .update({
        where: { id },
        data: {
          status: 'COMPLETED',
          responseStatus: status,
          responseBody: body as never,
        },
      })
      .catch(() => undefined);
  }

  private async fail(id: string): Promise<void> {
    await this.prisma.client.idempotencyKey
      .update({ where: { id }, data: { status: 'FAILED' } })
      .catch(() => undefined);
  }
}

/** Hash estable del cuerpo: el orden de las claves no debe cambiar el resultado. */
function hashBody(body: unknown): string {
  return createHash('sha256').update(stableStringify(body)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
