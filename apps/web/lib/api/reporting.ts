import type { DashboardResponse } from '@pulso/contracts/reporting';
import { apiFetch } from './client.js';

/** `GET /reports/dashboard`: siempre devuelve los 6 indicadores del inicio. */
export function getDashboard(): Promise<DashboardResponse> {
  return apiFetch<DashboardResponse>('/reports/dashboard');
}
