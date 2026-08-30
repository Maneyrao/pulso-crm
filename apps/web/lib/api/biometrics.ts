import type {
  ApproveAgentResponse,
  CancelEnrollmentResponse,
  CompleteHidEnrollmentRequest,
  CompleteHidEnrollmentResponse,
  CreateAgentRequest,
  CreateAgentResponse,
  GetEnrollmentResponse,
  GrantConsentRequest,
  GrantConsentResponse,
  IdentifyHidRequest,
  ListAgentsResponse,
  ListDevicesResponse,
  ListMemberCredentialsResponse,
  RevokeAgentRequest,
  RevokeAgentResponse,
  RevokeConsentResponse,
  RevokeCredentialResponse,
  StartEnrollmentRequest,
  StartEnrollmentResponse,
  StartHidEnrollmentRequest,
  StartHidEnrollmentResponse,
  RecordHidCaptureEventsRequest,
  RecordHidCaptureEventsResponse,
  StartIdentificationRequest,
  StartIdentificationResponse,
} from '@pulso/contracts/biometrics';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { apiFetch, toQueryString } from './client.js';

export function listAgents(branchId?: string | null): Promise<ListAgentsResponse> {
  return apiFetch<ListAgentsResponse>(`/agents${toQueryString({ branchId })}`);
}

export function createAgent(payload: CreateAgentRequest): Promise<CreateAgentResponse> {
  return apiFetch<CreateAgentResponse>('/agents', { method: 'POST', body: payload });
}

export function approveAgent(id: string): Promise<ApproveAgentResponse> {
  return apiFetch<ApproveAgentResponse>(`/agents/${id}/approve`, { method: 'POST' });
}

export function revokeAgent(id: string, payload: RevokeAgentRequest): Promise<RevokeAgentResponse> {
  return apiFetch<RevokeAgentResponse>(`/agents/${id}/revoke`, { method: 'POST', body: payload });
}

export function listDevices(branchId?: string | null): Promise<ListDevicesResponse> {
  return apiFetch<ListDevicesResponse>(`/devices${toQueryString({ branchId })}`);
}

export function grantConsent(
  memberId: string,
  payload: GrantConsentRequest,
): Promise<GrantConsentResponse> {
  return apiFetch<GrantConsentResponse>(`/members/${memberId}/biometrics/consent`, {
    method: 'POST',
    body: payload,
  });
}

/** Revoca el consentimiento Y todas las credenciales, en una transacción. */
export function revokeConsent(memberId: string): Promise<RevokeConsentResponse> {
  return apiFetch<RevokeConsentResponse>(`/members/${memberId}/biometrics/consent`, {
    method: 'DELETE',
  });
}

/**
 * El `deviceToken` de la respuesta va DIRECTO al agente por el WS local y no
 * se persiste en ningún estado que sobreviva a la operación.
 */
export function startEnrollment(
  memberId: string,
  payload: StartEnrollmentRequest,
  idempotencyKey: string,
): Promise<StartEnrollmentResponse> {
  return apiFetch<StartEnrollmentResponse>(`/members/${memberId}/biometrics/enrollments`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function startHidEnrollment(
  memberId: string,
  payload: StartHidEnrollmentRequest,
  idempotencyKey: string,
): Promise<StartHidEnrollmentResponse> {
  return apiFetch<StartHidEnrollmentResponse>(`/members/${memberId}/biometrics/hid-enrollments`, {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function completeHidEnrollment(
  enrollmentId: string,
  payload: CompleteHidEnrollmentRequest,
): Promise<CompleteHidEnrollmentResponse> {
  return apiFetch<CompleteHidEnrollmentResponse>(
    `/biometrics/hid-enrollments/${enrollmentId}/complete`,
    {
      method: 'POST',
      body: payload,
    },
  );
}

export function getEnrollment(id: string): Promise<GetEnrollmentResponse> {
  return apiFetch<GetEnrollmentResponse>(`/biometrics/enrollments/${id}`);
}

export function cancelEnrollment(id: string): Promise<CancelEnrollmentResponse> {
  return apiFetch<CancelEnrollmentResponse>(`/biometrics/enrollments/${id}/cancel`, {
    method: 'POST',
  });
}

export function listMemberCredentials(memberId: string): Promise<ListMemberCredentialsResponse> {
  return apiFetch<ListMemberCredentialsResponse>(`/members/${memberId}/biometrics/credentials`);
}

export function revokeCredential(id: string): Promise<RevokeCredentialResponse> {
  return apiFetch<RevokeCredentialResponse>(`/biometrics/credentials/${id}`, { method: 'DELETE' });
}

export function startIdentification(
  payload: StartIdentificationRequest,
  idempotencyKey: string,
): Promise<StartIdentificationResponse> {
  return apiFetch<StartIdentificationResponse>('/biometrics/identifications', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

export function identifyHid(
  payload: IdentifyHidRequest,
  idempotencyKey: string,
): Promise<AccessCheckResponse> {
  return apiFetch<AccessCheckResponse>('/biometrics/hid-identifications', {
    method: 'POST',
    body: payload,
    idempotencyKey,
  });
}

/**
 * Bitácora de captura del navegador (estados, errores de ADC, timeouts). Sólo
 * metadatos: la muestra biométrica nunca pasa por acá.
 */
export function recordHidCaptureEvents(
  payload: RecordHidCaptureEventsRequest,
): Promise<RecordHidCaptureEventsResponse> {
  return apiFetch<RecordHidCaptureEventsResponse>('/biometrics/hid-capture-events', {
    method: 'POST',
    body: payload,
  });
}
