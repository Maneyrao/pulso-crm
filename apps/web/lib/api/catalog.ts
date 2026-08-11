import type {
  Activity,
  CreateActivityRequest,
  CreatePlanRequest,
  ListActivitiesResponse,
  ListPlansResponse,
  Plan,
  UpdateActivityRequest,
  UpdatePlanRequest,
} from '@pulso/contracts/catalog';
import { apiFetch } from './client.js';

export function listPlans(): Promise<ListPlansResponse> {
  return apiFetch<ListPlansResponse>('/plans');
}

export function createPlan(payload: CreatePlanRequest): Promise<Plan> {
  return apiFetch<Plan>('/plans', { method: 'POST', body: payload });
}

export function updatePlan(id: string, payload: UpdatePlanRequest): Promise<Plan> {
  return apiFetch<Plan>(`/plans/${id}`, { method: 'PATCH', body: payload });
}

export function deletePlan(id: string): Promise<Plan> {
  return apiFetch<Plan>(`/plans/${id}`, { method: 'DELETE' });
}

export function listActivities(): Promise<ListActivitiesResponse> {
  return apiFetch<ListActivitiesResponse>('/activities');
}

export function createActivity(payload: CreateActivityRequest): Promise<Activity> {
  return apiFetch<Activity>('/activities', { method: 'POST', body: payload });
}

export function updateActivity(id: string, payload: UpdateActivityRequest): Promise<Activity> {
  return apiFetch<Activity>(`/activities/${id}`, { method: 'PATCH', body: payload });
}
