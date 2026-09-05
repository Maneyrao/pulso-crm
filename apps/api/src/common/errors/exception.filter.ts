import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, type FieldError } from './app-error.js';
import { ErrorCode, type ErrorCodeValue } from './error-codes.js';
import { RequestContextStore, getLogger } from '../logging/logger.js';

/** Respuesta de error, formato RFC-7807 extendido con `code` (API_CONTRACTS §1.4). */
interface ProblemDetails {
  type: string;
  code: ErrorCodeValue | string;
  title: string;
  status: number;
  detail: string;
  requestId: string;
  errors?: FieldError[];
  [key: string]: unknown;
}

const TITLES: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  403: 'Sin permiso',
  404: 'No encontrado',
  409: 'Conflicto',
  415: 'Tipo de contenido no soportado',
  422: 'Datos inválidos',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
  503: 'Servicio no disponible',
};

/** Errores de Prisma que tienen una traducción de negocio razonable. */
function fromPrisma(err: { code?: string; meta?: Record<string, unknown> }): AppError | null {
  switch (err.code) {
    case 'P2002': {
      const target = String(err.meta?.['target'] ?? '');
      if (target.includes('document')) {
        return AppError.conflict(
          ErrorCode.DUPLICATE_DOCUMENT,
          'Ya existe un socio con ese documento en este gimnasio. Buscalo en el segmento "Todos" antes de crear otro.',
        );
      }
      if (target.includes('card')) {
        return AppError.conflict(ErrorCode.DUPLICATE_CARD, 'Esa tarjeta ya está asignada.');
      }
      return AppError.conflict(ErrorCode.CONFLICT, 'Ya existe un registro con esos datos.');
    }
    case 'P2025':
      return AppError.notFound('El recurso');
    case 'P2003':
      return AppError.conflict(
        ErrorCode.CONFLICT,
        'La operación referencia un registro que no existe.',
      );
    default:
      return null;
  }
}

/** Violaciones de constraints que Prisma no clasifica pero la base sí. */
function fromPostgres(message: string): AppError | null {
  if (message.includes('memberships_no_overlap')) {
    return AppError.conflict(
      ErrorCode.MEMBERSHIP_OVERLAP,
      'El socio ya tiene una membresía activa que cubre esas fechas.',
    );
  }
  if (message.includes('cash_sessions_one_open_per_register')) {
    return AppError.conflict(ErrorCode.CASH_REGISTER_BUSY, 'Esa caja ya tiene una sesión abierta.');
  }
  if (message.includes('cash_sessions_one_open_per_user')) {
    return AppError.conflict(
      ErrorCode.USER_HAS_OPEN_SESSION,
      'Ya tenés una caja abierta. Cerrala antes de abrir otra.',
    );
  }
  if (message.includes('cash_movements_amount_positive')) {
    return AppError.unprocessable(
      ErrorCode.VALIDATION_ERROR,
      'El importe tiene que ser mayor a cero.',
    );
  }
  if (message.includes('append-only') || message.includes('inmutable')) {
    return AppError.conflict(
      ErrorCode.CONFLICT,
      'Ese registro es inmutable. Corregilo con una reversa.',
    );
  }
  return null;
}

function zodToFieldErrors(err: ZodError): FieldError[] {
  return err.issues.map((i) => ({
    field: i.path.join('.') || '(raíz)',
    code: i.code,
    message: i.message,
  }));
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = RequestContextStore.get()?.requestId ?? 'unknown';

    const problem = this.toProblem(exception, requestId);

    // 5xx se loguea como error con el stack; 4xx es información, no falla nuestra.
    const log = getLogger();
    if (problem.status >= 500) {
      log.error({ err: exception, path: req.url, method: req.method }, 'Error no controlado');
    } else {
      log.info(
        { code: problem.code, status: problem.status, path: req.url, method: req.method },
        'Solicitud rechazada',
      );
    }

    res.status(problem.status).type('application/problem+json').send(problem);
  }

  private toProblem(exception: unknown, requestId: string): ProblemDetails {
    const build = (
      code: ErrorCodeValue | string,
      status: number,
      detail: string,
      extra: Record<string, unknown> = {},
    ): ProblemDetails => ({
      type: `https://docs.pulso.app/errors/${String(code).toLowerCase()}`,
      code,
      title: TITLES[status] ?? 'Error',
      status,
      detail,
      requestId,
      ...extra,
    });

    if (exception instanceof AppError) {
      return build(
        exception.code,
        exception.status,
        exception.options.detail ?? exception.message,
        {
          ...(exception.options.errors ? { errors: exception.options.errors } : {}),
          ...(exception.options.meta ?? {}),
        },
      );
    }

    if (exception instanceof ZodError) {
      return build(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Revisá los datos ingresados.',
        { errors: zodToFieldErrors(exception) },
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const detail =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
      const code =
        status === 404
          ? ErrorCode.NOT_FOUND
          : status === 401
            ? ErrorCode.SESSION_EXPIRED
            : status === 403
              ? ErrorCode.FORBIDDEN
              : status === 429
                ? ErrorCode.RATE_LIMITED
                : ErrorCode.VALIDATION_ERROR;
      return build(code, status, Array.isArray(detail) ? detail.join('. ') : String(detail));
    }

    if (typeof exception === 'object' && exception !== null) {
      const e = exception as { code?: string; message?: string; name?: string };

      if (e.name === 'MissingTenantContextError' || e.name === 'CrossTenantWriteError') {
        // Es un bug nuestro, no del cliente: se loguea como 500 y no se filtra
        // ningún detalle del aislamiento hacia afuera.
        return build(ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, 'Error interno.');
      }

      const prismaMapped = e.code?.startsWith('P') ? fromPrisma(e) : null;
      if (prismaMapped) return this.toProblem(prismaMapped, requestId);

      const pgMapped = e.message ? fromPostgres(e.message) : null;
      if (pgMapped) return this.toProblem(pgMapped, requestId);
    }

    // Nunca se expone el mensaje de un error no clasificado: puede contener
    // fragmentos de SQL, rutas del servidor o datos de otro tenant.
    return build(ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, 'Error interno.');
  }
}
