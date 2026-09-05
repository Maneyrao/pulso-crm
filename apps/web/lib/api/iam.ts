import type {
  CreateRoleRequest,
  CreateUserRequest,
  CreateUserResponse,
  ListRolesResponse,
  ListUsersQuery,
  ListUsersResponse,
  ResetPasswordResponse,
  Role,
  UpdateRoleRequest,
  UpdateUserRequest,
  User,
} from '@pulso/contracts/iam';
import { apiFetch, toQueryString } from './client.js';

export function listUsers(query: Partial<ListUsersQuery> = {}): Promise<ListUsersResponse> {
  return apiFetch<ListUsersResponse>(`/users${toQueryString(query)}`);
}

export function getUser(id: string): Promise<User> {
  return apiFetch<User>(`/users/${id}`);
}

export function createUser(payload: CreateUserRequest): Promise<CreateUserResponse> {
  return apiFetch<CreateUserResponse>('/users', { method: 'POST', body: payload });
}

export function updateUser(id: string, payload: UpdateUserRequest): Promise<User> {
  return apiFetch<User>(`/users/${id}`, { method: 'PATCH', body: payload });
}

export function deactivateUser(id: string): Promise<User> {
  return apiFetch<User>(`/users/${id}/deactivate`, { method: 'POST' });
}

export function deleteUser(id: string): Promise<User> {
  return apiFetch<User>(`/users/${id}`, { method: 'DELETE' });
}

export function resetUserPassword(id: string): Promise<ResetPasswordResponse> {
  return apiFetch<ResetPasswordResponse>(`/users/${id}/reset-password`, { method: 'POST' });
}

export function listRoles(): Promise<ListRolesResponse> {
  return apiFetch<ListRolesResponse>('/roles');
}

export function createRole(payload: CreateRoleRequest): Promise<Role> {
  return apiFetch<Role>('/roles', { method: 'POST', body: payload });
}

export function updateRole(id: string, payload: UpdateRoleRequest): Promise<Role> {
  return apiFetch<Role>(`/roles/${id}`, { method: 'PATCH', body: payload });
}
