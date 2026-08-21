import type {
  CashConcept,
  CashRegister,
  CashSession,
  CloseCashSessionRequest,
  CloseCashSessionResponse,
  CreateCashConceptRequest,
  CreateCashMovementRequest,
  CreateCashMovementResponse,
  CreatePaymentMethodRequest,
  DaybookQuery,
  DaybookResponse,
  ListCashMovementsQuery,
  ListCashMovementsResponse,
  ListCashOperationsResponse,
  ListCashSessionsQuery,
  ListCashSessionsResponse,
  ListPaymentMethodsResponse,
  ListCashConceptsResponse,
  OpenCashSessionRequest,
  OpenCashSessionResponse,
  PaymentMethod,
  ReverseCashMovementRequest,
  ReverseCashMovementResponse,
  UpdateCashConceptRequest,
  UpdatePaymentMethodRequest,
} from '@pulso/contracts/cash';
import { apiFetch, toQueryString } from './client.js';

/**
 * Cliente HTTP de Caja (API_CONTRACTS §8).
 *
 * Los endpoints operativos (`open`, `close`, `create movement`, `reverse`)
 * viajan con `Idempotency-Key` obligatoria: `apiFetch` la coloca como header,
 * el hook `useIdempotencyKey` la genera y la reusa entre reintentos del
 * MISMO intento (ADR-016).
 *
 * Nota: la sesión y la sede activas viven en el `TenantContextStore` del
 * backend (cookies + branchId de la sesión), por eso `getCurrentCashSession`
 * no toma parámetros: el backend devuelve la sesión OPEN del usuario en la
 * sede activa, o `null`.
 */

// ── Sesiones ────────────────────────────────────────────────────────────

export async function getCurrentCashSession(): Promise<CashSession | null> {
  // Sin caja abierta el backend responde 204 y el cliente devuelve undefined;
  // TanStack Query prohíbe `undefined` como dato, así que se normaliza a null.
  return (await apiFetch<CashSession | null>('/cash/sessions/current')) ?? null;
}

export function listCashSessions(
  query: Partial<ListCashSessionsQuery> = {},
): Promise<ListCashSessionsResponse> {
  return apiFetch<ListCashSessionsResponse>(`/cash/sessions${toQueryString(query)}`);
}

export function openCashSession(
  payload: OpenCashSessionRequest,
  idempotencyKey: string,
): Promise<OpenCashSessionResponse> {
  return apiFetch<OpenCashSessionResponse>('/cash/sessions/open', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function closeCashSession(
  payload: CloseCashSessionRequest,
  idempotencyKey: string,
): Promise<CloseCashSessionResponse> {
  return apiFetch<CloseCashSessionResponse>('/cash/sessions/close', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

// ── Movements ───────────────────────────────────────────────────────────

export function listCashMovements(
  query: Partial<ListCashMovementsQuery>,
): Promise<ListCashMovementsResponse> {
  return apiFetch<ListCashMovementsResponse>(`/cash/movements${toQueryString(query)}`);
}

export function createCashMovement(
  payload: CreateCashMovementRequest,
  idempotencyKey: string,
): Promise<CreateCashMovementResponse> {
  return apiFetch<CreateCashMovementResponse>('/cash/movements', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function reverseCashMovement(
  id: string,
  payload: ReverseCashMovementRequest,
  idempotencyKey: string,
): Promise<ReverseCashMovementResponse> {
  return apiFetch<ReverseCashMovementResponse>(`/cash/movements/${id}/reverse`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

// ── Configuración (payment methods, concepts, registers) ────────────────

export function listPaymentMethods(): Promise<ListPaymentMethodsResponse> {
  return apiFetch<ListPaymentMethodsResponse>('/cash/payment-methods');
}

export function createPaymentMethod(payload: CreatePaymentMethodRequest): Promise<PaymentMethod> {
  return apiFetch<PaymentMethod>('/cash/payment-methods', { method: 'POST', body: payload });
}

export function updatePaymentMethod(
  id: string,
  payload: UpdatePaymentMethodRequest,
): Promise<PaymentMethod> {
  return apiFetch<PaymentMethod>(`/cash/payment-methods/${id}`, { method: 'PATCH', body: payload });
}

export function listCashConcepts(): Promise<ListCashConceptsResponse> {
  return apiFetch<ListCashConceptsResponse>('/cash/concepts');
}

export function createCashConcept(payload: CreateCashConceptRequest): Promise<CashConcept> {
  return apiFetch<CashConcept>('/cash/concepts', { method: 'POST', body: payload });
}

export function updateCashConcept(id: string, payload: UpdateCashConceptRequest): Promise<CashConcept> {
  return apiFetch<CashConcept>(`/cash/concepts/${id}`, { method: 'PATCH', body: payload });
}

/**
 * `GET /cash/registers?branchId=...`. El contrato público no exporta un schema
 * de listado (viven en `apps/api/src/modules/cash/schemas/cash-register.schemas.ts`)
 * pero el shape del ítem sí es contrato: se tipa con `CashRegister`.
 */
export function listCashRegisters(branchId?: string): Promise<{ data: CashRegister[] }> {
  return apiFetch<{ data: CashRegister[] }>(`/cash/registers${toQueryString({ branchId })}`);
}

export function listCashOperations(
  branchId: string | null,
  status = 'PENDING',
): Promise<ListCashOperationsResponse> {
  return apiFetch<ListCashOperationsResponse>(`/cash/operations${toQueryString({ branchId, status })}`);
}

// ── Daybook ─────────────────────────────────────────────────────────────

export function getDaybook(query: DaybookQuery): Promise<DaybookResponse> {
  return apiFetch<DaybookResponse>(`/cash/daybook${toQueryString(query)}`);
}
