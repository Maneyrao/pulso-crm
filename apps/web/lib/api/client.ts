import { ApiError, parseProblemDetails } from './errors.js';

const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4001');
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Rutas de auth que nunca deben disparar un refresh-and-retry (evitan loop). */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

function readCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)pulso_csrf=([^;]*)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Promesa compartida del refresh en curso. Si 5 requests fallan con 401 a la
 * vez, las 5 llaman a `refreshSession()` pero sólo la primera dispara el
 * `fetch`: las demás esperan la misma promesa (FRONTEND_PLAN §5).
 */
let inFlightRefresh: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!inFlightRefresh) {
    inFlightRefresh = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        inFlightRefresh = null;
      });
  }
  return inFlightRefresh;
}

/** Sólo para tests: resetea el deduplicador entre casos. */
export function __resetRefreshDedup(): void {
  inFlightRefresh = null;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body' | 'method'> {
  method?: string;
  body?: unknown;
  /** Header `Idempotency-Key`; usar `useIdempotencyKey()` para generarlo. */
  idempotencyKey?: string;
  /** Interno: evita reintentar el refresh más de una vez por request. */
  _isRetry?: boolean;
}

function buildHeaders(options: ApiFetchOptions, method: string): Headers {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (MUTATING_METHODS.has(method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }
  return headers;
}

/**
 * Cliente HTTP único de la app: cookies de sesión (`credentials: 'include'`),
 * CSRF por double-submit, parseo de errores RFC-7807 a `ApiError`, y
 * refresh-and-retry automático (una sola vez) ante `401`.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const { body, idempotencyKey: _key, _isRetry, ...rest } = options;
  void _key;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      method,
      credentials: 'include',
      headers: buildHeaders(options, method),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw ApiError.network();
  }

  const skipRefresh = NO_REFRESH_PATHS.some((p) => path.startsWith(p));
  if (response.status === 401 && !_isRetry && !skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, _isRetry: true });
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const json: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new ApiError(parseProblemDetails(response.status, json));
  }

  return json as T;
}

/** Arma un query string omitiendo `undefined`/`null`/`''`, sin tocar el resto de la app. */
export function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export { ApiError } from './errors.js';
