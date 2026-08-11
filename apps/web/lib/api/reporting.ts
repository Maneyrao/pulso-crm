import type { DashboardResponse } from '@pulso/contracts/reporting';
import { apiFetch } from './client.js';
import { ApiError } from './errors.js';

/**
 * `GET /reports/dashboard` puede no existir todavía (módulo en desarrollo
 * paralelo). Un 404 se trata como "no disponible" — no como error de la
 * pantalla — para que el dashboard pueda mostrar lo que sí puede traer.
 */
export async function getDashboard(): Promise<DashboardResponse | null> {
  try {
    return await apiFetch<DashboardResponse>('/reports/dashboard');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === 'NOT_FOUND')) {
      return null;
    }
    throw error;
  }
}
