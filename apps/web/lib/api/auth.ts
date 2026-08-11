import type { AuthBranch, AuthGym, AuthUser, LoginRequest } from '@pulso/contracts/auth';
import type { Permission } from '@pulso/contracts/permissions';
import { apiFetch } from './client.js';

/**
 * Shape real de `POST /auth/login`, `GET /auth/me` y `POST /auth/refresh`
 * (ver `AuthController.publicSession()` en la API): trae `activeBranchId`.
 * `authSessionSchema` de `@pulso/contracts` documenta en cambio
 * `defaultBranchId` — desvío conocido entre contrato y controlador actual.
 * Se tipa acá el shape observado y se tolera cualquiera de los dos nombres.
 */
export interface AuthSessionResponse {
  user: AuthUser;
  gym: AuthGym;
  branches: readonly AuthBranch[];
  permissions: readonly Permission[];
  activeBranchId?: string;
  defaultBranchId?: string;
}

export function resolveActiveBranchId(session: AuthSessionResponse): string | null {
  return session.activeBranchId ?? session.defaultBranchId ?? session.branches[0]?.id ?? null;
}

export function login(payload: LoginRequest): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/auth/login', { method: 'POST', body: payload });
}

export function fetchMe(): Promise<AuthSessionResponse> {
  return apiFetch<AuthSessionResponse>('/auth/me');
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' });
}

export function selectBranch(branchId: string): Promise<{ activeBranchId: string }> {
  return apiFetch('/auth/select-branch', { method: 'POST', body: { branchId } });
}
