import type {
  CancelMembershipRequest,
  CreateMembershipRequest,
  CreateMembershipResponse,
  ListMemberMembershipsResponse,
  Membership,
} from '@pulso/contracts/memberships';
import { apiFetch } from './client.js';

export function listMemberMemberships(memberId: string): Promise<ListMemberMembershipsResponse> {
  return apiFetch<ListMemberMembershipsResponse>(`/members/${memberId}/memberships`);
}

export function createMembership(
  memberId: string,
  payload: CreateMembershipRequest,
  idempotencyKey: string,
): Promise<CreateMembershipResponse> {
  return apiFetch<CreateMembershipResponse>(`/members/${memberId}/memberships`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function cancelMembership(
  membershipId: string,
  payload: CancelMembershipRequest,
): Promise<Membership> {
  return apiFetch<Membership>(`/memberships/${membershipId}/cancel`, {
    method: 'POST',
    body: payload,
  });
}
