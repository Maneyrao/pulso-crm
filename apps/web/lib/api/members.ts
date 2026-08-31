import type {
  CreateLedgerAdjustmentRequest,
  CreateMemberRequest,
  DeactivateMemberRequest,
  GetMemberLedgerResponse,
  ListDebtorsQuery,
  ListDebtorsResponse,
  ListMemberPaymentsQuery,
  ListMemberPaymentsResponse,
  ListMembersQuery,
  ListMembersResponse,
  Member,
  MemberDetail,
  UpdateMemberRequest,
} from '@pulso/contracts/members';
import { apiFetch, toQueryString } from './client.js';

export function listMembers(query: Partial<ListMembersQuery>): Promise<ListMembersResponse> {
  return apiFetch<ListMembersResponse>(`/members${toQueryString(query)}`);
}

export function getMember(id: string): Promise<MemberDetail> {
  return apiFetch<MemberDetail>(`/members/${id}`);
}

export function createMember(
  payload: CreateMemberRequest,
  idempotencyKey: string,
): Promise<Member> {
  return apiFetch<Member>('/members', { method: 'POST', body: payload, idempotencyKey });
}

export function updateMember(id: string, payload: UpdateMemberRequest): Promise<Member> {
  return apiFetch<Member>(`/members/${id}`, { method: 'PATCH', body: payload });
}

export function deactivateMember(id: string, payload: DeactivateMemberRequest): Promise<Member> {
  return apiFetch<Member>(`/members/${id}/deactivate`, { method: 'POST', body: payload });
}

export function getMemberLedger(id: string): Promise<GetMemberLedgerResponse> {
  return apiFetch<GetMemberLedgerResponse>(`/members/${id}/ledger`);
}

export function listMemberPayments(
  id: string,
  query: ListMemberPaymentsQuery,
): Promise<ListMemberPaymentsResponse> {
  return apiFetch<ListMemberPaymentsResponse>(`/members/${id}/payments${toQueryString(query)}`);
}

export function createLedgerAdjustment(
  id: string,
  payload: CreateLedgerAdjustmentRequest,
  idempotencyKey: string,
) {
  return apiFetch(`/members/${id}/ledger`, { method: 'POST', body: payload, idempotencyKey });
}

export function listDebtors(query: Partial<ListDebtorsQuery>): Promise<ListDebtorsResponse> {
  return apiFetch<ListDebtorsResponse>(`/members/debtors${toQueryString(query)}`);
}
