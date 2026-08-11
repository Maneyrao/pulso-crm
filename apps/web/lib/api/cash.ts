import type {
  CashSession,
  CloseCashSessionRequest,
  CloseCashSessionResponse,
  CreateCashMovementRequest,
  CreateCashMovementResponse,
  DaybookQuery,
  DaybookResponse,
  ListCashMovementsResponse,
  ListCashOperationsResponse,
  ListPaymentMethodsResponse,
  ListCashConceptsResponse,
  OpenCashSessionRequest,
  OpenCashSessionResponse,
  ReverseCashMovementResponse,
} from '@pulso/contracts/cash';
import { apiFetch, toQueryString } from './client.js';

export function getCurrentCashSession(branchId: string | null): Promise<CashSession | null> {
  return apiFetch<CashSession | null>(`/cash/sessions/current${toQueryString({ branchId })}`);
}

export function openCashSession(
  payload: OpenCashSessionRequest,
  idempotencyKey: string,
): Promise<OpenCashSessionResponse> {
  return apiFetch<OpenCashSessionResponse>('/cash/sessions', { method: 'POST', body: payload, idempotencyKey });
}

export function closeCashSession(
  id: string,
  payload: CloseCashSessionRequest,
  idempotencyKey: string,
): Promise<CloseCashSessionResponse> {
  return apiFetch<CloseCashSessionResponse>(`/cash/sessions/${id}/close`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function listCashMovements(cashSessionId: string): Promise<ListCashMovementsResponse> {
  return apiFetch<ListCashMovementsResponse>(`/cash/movements${toQueryString({ cashSessionId })}`);
}

export function createCashMovement(
  payload: CreateCashMovementRequest,
  idempotencyKey: string,
): Promise<CreateCashMovementResponse> {
  return apiFetch<CreateCashMovementResponse>('/cash/movements', { method: 'POST', body: payload, idempotencyKey });
}

export function reverseCashMovement(
  id: string,
  reason: string,
  idempotencyKey: string,
): Promise<ReverseCashMovementResponse> {
  return apiFetch<ReverseCashMovementResponse>(`/cash/movements/${id}/reverse`, {
    method: 'POST',
    body: { reason },
    idempotencyKey,
  });
}

export function listCashOperations(branchId: string | null, status = 'PENDING'): Promise<ListCashOperationsResponse> {
  return apiFetch<ListCashOperationsResponse>(`/cash/operations${toQueryString({ branchId, status })}`);
}

export function listPaymentMethods(): Promise<ListPaymentMethodsResponse> {
  return apiFetch<ListPaymentMethodsResponse>('/cash/payment-methods');
}

export function listCashConcepts(): Promise<ListCashConceptsResponse> {
  return apiFetch<ListCashConceptsResponse>('/cash/concepts');
}

export function getDaybook(query: DaybookQuery): Promise<DaybookResponse> {
  return apiFetch<DaybookResponse>(`/cash/daybook${toQueryString(query)}`);
}
