import type { ErrorCode, FieldError, ProblemDetails } from '@pulso/contracts/common';

/**
 * Excepción tipada para cualquier error de la API (RFC-7807 extendido,
 * API_CONTRACTS §1.4). El resto de la app hace `match` sobre `code`, nunca
 * sobre `title`/`detail` (son texto para humanos, no contrato).
 */
export class ApiError extends Error {
  readonly code: ErrorCode | string;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly detail: string | undefined;
  readonly fieldErrors: readonly FieldError[] | undefined;

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
    this.code = problem.code;
    this.status = problem.status;
    this.requestId = problem.requestId;
    this.detail = problem.detail;
    this.fieldErrors = problem.errors;
  }

  /** Error de transporte (sin respuesta del servidor): timeout, offline, DNS, etc. */
  static network(
    message = 'No pudimos conectarnos con el servidor. Revisá tu conexión.',
  ): ApiError {
    return new ApiError({
      type: 'about:blank',
      code: 'INTERNAL_ERROR',
      title: 'Sin conexión',
      status: 0,
      detail: message,
    });
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Convierte el body de una respuesta no-2xx en `ProblemDetails`, tolerando que
 * la API todavía no respete el shape exacto del contrato (otros módulos están
 * en desarrollo en simultáneo). Nunca lanza: si el body no es reconocible,
 * devuelve un problema genérico con el `status` HTTP real.
 */
export function parseProblemDetails(status: number, body: unknown): ProblemDetails {
  const obj = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const errors = Array.isArray(obj['errors'])
    ? (obj['errors'] as unknown[])
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map((e) => ({
          // El filtro real de la API hoy emite `field`; el contrato define
          // `path`. Se aceptan ambos para no romper ante ese desvío conocido.
          path: String(e['path'] ?? e['field'] ?? ''),
          code: String(e['code'] ?? 'invalid'),
          message: String(e['message'] ?? ''),
        }))
    : undefined;

  return {
    type: typeof obj['type'] === 'string' ? obj['type'] : 'about:blank',
    code: (typeof obj['code'] === 'string' ? obj['code'] : 'INTERNAL_ERROR') as ErrorCode,
    title: typeof obj['title'] === 'string' ? obj['title'] : 'Error',
    status: typeof obj['status'] === 'number' ? obj['status'] : status,
    detail: typeof obj['detail'] === 'string' ? obj['detail'] : undefined,
    requestId: typeof obj['requestId'] === 'string' ? obj['requestId'] : undefined,
    errors,
  };
}
