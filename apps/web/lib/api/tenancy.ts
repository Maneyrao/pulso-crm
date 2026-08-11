import type {
  Branch,
  CreateBranchRequest,
  Gym,
  ListBranchesResponse,
  UpdateBranchRequest,
  UpdateGymRequest,
} from '@pulso/contracts/tenancy';
import { apiFetch } from './client.js';

export function getGym(): Promise<Gym> {
  return apiFetch<Gym>('/gym');
}

export function updateGym(payload: UpdateGymRequest): Promise<Gym> {
  return apiFetch<Gym>('/gym', { method: 'PATCH', body: payload });
}

export function listBranches(): Promise<ListBranchesResponse> {
  return apiFetch<ListBranchesResponse>('/branches');
}

export function createBranch(payload: CreateBranchRequest): Promise<Branch> {
  return apiFetch<Branch>('/branches', { method: 'POST', body: payload });
}

export function updateBranch(id: string, payload: UpdateBranchRequest): Promise<Branch> {
  return apiFetch<Branch>(`/branches/${id}`, { method: 'PATCH', body: payload });
}

export function deactivateBranch(id: string): Promise<Branch> {
  return apiFetch<Branch>(`/branches/${id}`, { method: 'DELETE' });
}
