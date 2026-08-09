import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextStore } from './logger.js';
import { TenantContextStore } from '../auth/tenant-context.js';

/**
 * Abre el contexto de request y el de tenant para toda la vida del request.
 *
 * Tiene que ser middleware y no guard ni interceptor: es lo único que envuelve
 * `next()` de punta a punta, y el AsyncLocalStorage necesita esa envoltura para
 * seguir vigente en el handler y en las consultas de Prisma.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Se acepta un requestId entrante para poder correlacionar con el frontend,
    // pero se valida: un header arbitrario termina en los logs.
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming)
        ? incoming
        : RequestContextStore.newRequestId();

    res.setHeader('X-Request-Id', requestId);

    RequestContextStore.run({ requestId }, () => {
      TenantContextStore.open(() => {
        next();
      });
    });
  }
}
