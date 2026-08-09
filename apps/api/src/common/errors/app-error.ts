import { HttpStatus } from '@nestjs/common';
import { ErrorCode, type ErrorCodeValue } from './error-codes.js';

/** Detalle de un campo que no validó. */
export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * Error de dominio con código estable.
 *
 * Todo error que sale al cliente pasa por acá o por el filtro global. La regla
 * es que el `code` sea suficiente para que el frontend decida qué hacer, sin
 * parsear el mensaje.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCodeValue,
    public readonly status: number,
    message: string,
    public readonly options: {
      /** Texto orientado al usuario. Si falta, se usa `message`. */
      detail?: string;
      errors?: FieldError[];
      /** Datos extra del contrato del endpoint (p.ej. pendingOperations). */
      meta?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
  }

  static validation(errors: FieldError[], detail = 'Revisá los datos ingresados.') {
    return new AppError(ErrorCode.VALIDATION_ERROR, HttpStatus.UNPROCESSABLE_ENTITY, detail, {
      errors,
    });
  }

  static notFound(resource: string) {
    // Deliberadamente genérico: distinguir "no existe" de "es de otro gimnasio"
    // le confirmaría a un atacante que el id existe en algún lado.
    return new AppError(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, `${resource} no encontrado.`, {
      detail: 'El recurso no existe o no tenés acceso.',
    });
  }

  static forbidden(code: ErrorCodeValue = ErrorCode.FORBIDDEN, detail = 'No tenés permiso para esta acción.') {
    return new AppError(code, HttpStatus.FORBIDDEN, detail, { detail });
  }

  static conflict(code: ErrorCodeValue, detail: string, meta?: Record<string, unknown>) {
    return new AppError(code, HttpStatus.CONFLICT, detail, { detail, ...(meta ? { meta } : {}) });
  }

  static unauthorized(code: ErrorCodeValue, detail: string) {
    return new AppError(code, HttpStatus.UNAUTHORIZED, detail, { detail });
  }

  static unprocessable(code: ErrorCodeValue, detail: string, meta?: Record<string, unknown>) {
    return new AppError(code, HttpStatus.UNPROCESSABLE_ENTITY, detail, {
      detail,
      ...(meta ? { meta } : {}),
    });
  }
}
