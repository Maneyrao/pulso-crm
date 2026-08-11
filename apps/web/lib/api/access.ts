import type { AccessCheckRequest, AccessCheckResponse, ListAccessAttemptsResponse } from '@pulso/contracts/access';
import { apiFetch, toQueryString } from './client.js';

export function checkAccess(payload: AccessCheckRequest): Promise<AccessCheckResponse> {
  return apiFetch<AccessCheckResponse>('/access/check', { method: 'POST', body: payload });
}

export function listAccessAttempts(branchId: string | null, limit = 10): Promise<ListAccessAttemptsResponse> {
  return apiFetch<ListAccessAttemptsResponse>(`/access/attempts${toQueryString({ branchId, limit })}`);
}
