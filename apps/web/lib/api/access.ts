import type {
  AccessCheckRequest,
  AccessCheckResponse,
  AccessMethod,
  ListAccessAttemptsResponse,
  ListAttendancesQuery,
  ListAttendancesResponse,
} from '@pulso/contracts/access';
import { apiFetch, toQueryString } from './client.js';

export function checkAccess(payload: AccessCheckRequest): Promise<AccessCheckResponse> {
  return apiFetch<AccessCheckResponse>('/access/check', { method: 'POST', body: payload });
}

export function listAccessAttempts(
  branchId: string | null,
  limit = 10,
  filters: { method?: AccessMethod; from?: string; to?: string } = {},
): Promise<ListAccessAttemptsResponse> {
  return apiFetch<ListAccessAttemptsResponse>(
    `/access/attempts${toQueryString({ branchId, limit, ...filters })}`,
  );
}

export function getAccessAttemptResult(id: string): Promise<AccessCheckResponse> {
  return apiFetch<AccessCheckResponse>(`/access/attempts/${id}/result`);
}

export function listAttendances(
  query: Partial<ListAttendancesQuery>,
): Promise<ListAttendancesResponse> {
  return apiFetch<ListAttendancesResponse>(`/attendances${toQueryString(query)}`);
}
