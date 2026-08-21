/**
 * Biometría — Etapas 7-8 (API_CONTRACTS.md §10, DATA_MODEL.md §7,
 * docs/biometrics/BIOMETRIC_SECURITY.md).
 *
 * Dos superficies que nunca comparten credenciales:
 *  - **CRM** (usuarios con sesión): gestión de agentes, consentimiento,
 *    enrolamientos y credenciales. Las credenciales exponen sólo metadatos —
 *    el template cifrado jamás sale del backend.
 *  - **Agente** (`Authorization: Bearer <credencial|deviceToken>`): pair,
 *    heartbeat, eventos, enroll-complete e identify. Las formas son espejo de
 *    `apps/local-agent/src/Pulso.Agent.Backend/Http/HttpDtos.cs` — cambiar un
 *    lado exige cambiar el otro. La respuesta de identify es `{resolved:true}`
 *    y nada más: el agente nunca recibe identidad del socio.
 */
import { z } from 'zod';
import {
  isoInstantSchema,
  offsetPaginatedResponseSchema,
  offsetPaginationQuerySchema,
  uuidSchema,
} from './common.js';

// ─────────────────────────────────────────────────────────────────────────
// Enums (DATA_MODEL.md §7 — deben coincidir 1:1 con los enums de Prisma)
// ─────────────────────────────────────────────────────────────────────────

export const LOCAL_AGENT_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'REVOKED'] as const;
export const localAgentStatusSchema = z.enum(LOCAL_AGENT_STATUSES);
export type LocalAgentStatus = z.infer<typeof localAgentStatusSchema>;

export const ACCESS_DEVICE_KINDS = ['FINGERPRINT_READER', 'CARD_READER', 'BARRIER'] as const;
export const accessDeviceKindSchema = z.enum(ACCESS_DEVICE_KINDS);
export type AccessDeviceKind = z.infer<typeof accessDeviceKindSchema>;

export const ACCESS_DEVICE_VENDORS = ['HID_DIGITALPERSONA', 'OTHER'] as const;
export const accessDeviceVendorSchema = z.enum(ACCESS_DEVICE_VENDORS);
export type AccessDeviceVendor = z.infer<typeof accessDeviceVendorSchema>;

export const ACCESS_DEVICE_STATUSES = ['ONLINE', 'OFFLINE', 'ERROR', 'DISABLED'] as const;
export const accessDeviceStatusSchema = z.enum(ACCESS_DEVICE_STATUSES);
export type AccessDeviceStatus = z.infer<typeof accessDeviceStatusSchema>;

export const FINGER_POSITIONS = [
  'RIGHT_THUMB',
  'RIGHT_INDEX',
  'RIGHT_MIDDLE',
  'RIGHT_RING',
  'RIGHT_LITTLE',
  'LEFT_THUMB',
  'LEFT_INDEX',
  'LEFT_MIDDLE',
  'LEFT_RING',
  'LEFT_LITTLE',
] as const;
export const fingerPositionSchema = z.enum(FINGER_POSITIONS);
export type FingerPosition = z.infer<typeof fingerPositionSchema>;

export const BIOMETRIC_CONSENT_METHODS = ['IN_PERSON_SIGNED', 'DIGITAL'] as const;
export const biometricConsentMethodSchema = z.enum(BIOMETRIC_CONSENT_METHODS);
export type BiometricConsentMethod = z.infer<typeof biometricConsentMethodSchema>;

export const BIOMETRIC_ENROLLMENT_STATUSES = [
  'STARTED',
  'CAPTURING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
] as const;
export const biometricEnrollmentStatusSchema = z.enum(BIOMETRIC_ENROLLMENT_STATUSES);
export type BiometricEnrollmentStatus = z.infer<typeof biometricEnrollmentStatusSchema>;

export const BIOMETRIC_TEMPLATE_FORMATS = [
  'ANSI_378_2004',
  'ISO_19794_2_2005',
  'VENDOR_DIGITALPERSONA',
] as const;
export const biometricTemplateFormatSchema = z.enum(BIOMETRIC_TEMPLATE_FORMATS);
export type BiometricTemplateFormat = z.infer<typeof biometricTemplateFormatSchema>;

export const BIOMETRIC_CREDENTIAL_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export const biometricCredentialStatusSchema = z.enum(BIOMETRIC_CREDENTIAL_STATUSES);
export type BiometricCredentialStatus = z.infer<typeof biometricCredentialStatusSchema>;

export const AGENT_AUDIT_EVENT_TYPES = [
  'AGENT_STARTED',
  'AGENT_STOPPED',
  'DEVICE_CONNECTED',
  'DEVICE_DISCONNECTED',
  'CAPTURE_STARTED',
  'CAPTURE_TIMEOUT',
  'CAPTURE_CANCELLED',
  'QUALITY_REJECTED',
  'IDENTIFY_SENT',
  'ENROLL_SENT',
  'AUTH_FAILED',
  'PROTOCOL_ERROR',
  'UPDATE_APPLIED',
] as const;
export const agentAuditEventTypeSchema = z.enum(AGENT_AUDIT_EVENT_TYPES);
export type AgentAuditEventType = z.infer<typeof agentAuditEventTypeSchema>;

export const AGENT_AUDIT_SEVERITIES = ['INFO', 'WARN', 'ERROR'] as const;
export const agentAuditSeveritySchema = z.enum(AGENT_AUDIT_SEVERITIES);
export type AgentAuditSeverity = z.infer<typeof agentAuditSeveritySchema>;

export const DEVICE_TOKEN_SCOPES = ['ENROLL', 'IDENTIFY'] as const;
export const deviceTokenScopeSchema = z.enum(DEVICE_TOKEN_SCOPES);
export type DeviceTokenScope = z.infer<typeof deviceTokenScopeSchema>;

/** Template biométrico serializado: base64 no vacío, con tope anti-abuso. */
const templateBase64Schema = z.string().min(1).max(512 * 1024).base64();

// ─────────────────────────────────────────────────────────────────────────
// Superficie CRM — agentes (device:manage)
// ─────────────────────────────────────────────────────────────────────────

export const localAgentSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  branchId: uuidSchema,
  name: z.string(),
  installationId: uuidSchema,
  agentVersion: z.string().nullable(),
  osVersion: z.string().nullable(),
  status: localAgentStatusSchema,
  lastSeenAt: isoInstantSchema.nullable(),
  approvedAt: isoInstantSchema.nullable(),
  revokedAt: isoInstantSchema.nullable(),
  revokeReason: z.string().nullable(),
  createdAt: isoInstantSchema,
});
export type LocalAgent = z.infer<typeof localAgentSchema>;

export const listAgentsQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  status: localAgentStatusSchema.optional(),
});
export type ListAgentsQuery = z.infer<typeof listAgentsQuerySchema>;

export const listAgentsResponseSchema = z.object({ data: z.array(localAgentSchema) });
export type ListAgentsResponse = z.infer<typeof listAgentsResponseSchema>;

export const createAgentRequestSchema = z.object({
  branchId: uuidSchema,
  name: z.string().min(2).max(120),
});
export type CreateAgentRequest = z.infer<typeof createAgentRequestSchema>;

/** El `pairingSecret` se muestra UNA sola vez; el backend guarda sólo su hash. */
export const createAgentResponseSchema = z.object({
  agent: localAgentSchema,
  pairingSecret: z.string(),
});
export type CreateAgentResponse = z.infer<typeof createAgentResponseSchema>;

export const approveAgentResponseSchema = z.object({ agent: localAgentSchema });
export type ApproveAgentResponse = z.infer<typeof approveAgentResponseSchema>;

export const revokeAgentRequestSchema = z.object({
  reason: z.string().min(5).max(500),
});
export type RevokeAgentRequest = z.infer<typeof revokeAgentRequestSchema>;

export const revokeAgentResponseSchema = z.object({ agent: localAgentSchema });
export type RevokeAgentResponse = z.infer<typeof revokeAgentResponseSchema>;

export const agentAuditEventSchema = z.object({
  id: uuidSchema,
  branchId: uuidSchema,
  localAgentId: uuidSchema,
  deviceId: uuidSchema.nullable(),
  type: agentAuditEventTypeSchema,
  severity: agentAuditSeveritySchema,
  message: z.string(),
  metadata: z.record(z.string()).nullable(),
  occurredAt: isoInstantSchema,
  receivedAt: isoInstantSchema,
});
export type AgentAuditEvent = z.infer<typeof agentAuditEventSchema>;

export const listAgentEventsQuerySchema = offsetPaginationQuerySchema.extend({
  severity: agentAuditSeveritySchema.optional(),
  type: agentAuditEventTypeSchema.optional(),
  from: isoInstantSchema.optional(),
  to: isoInstantSchema.optional(),
});
export type ListAgentEventsQuery = z.infer<typeof listAgentEventsQuerySchema>;

export const listAgentEventsResponseSchema = offsetPaginatedResponseSchema(agentAuditEventSchema);
export type ListAgentEventsResponse = z.infer<typeof listAgentEventsResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Superficie CRM — dispositivos (device:manage)
// ─────────────────────────────────────────────────────────────────────────

export const accessDeviceSchema = z.object({
  id: uuidSchema,
  branchId: uuidSchema,
  localAgentId: uuidSchema,
  kind: accessDeviceKindSchema,
  vendor: accessDeviceVendorSchema,
  model: z.string(),
  serialNumber: z.string().nullable(),
  status: accessDeviceStatusSchema,
  lastSeenAt: isoInstantSchema.nullable(),
  createdAt: isoInstantSchema,
});
export type AccessDevice = z.infer<typeof accessDeviceSchema>;

export const listDevicesQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  status: accessDeviceStatusSchema.optional(),
});
export type ListDevicesQuery = z.infer<typeof listDevicesQuerySchema>;

export const listDevicesResponseSchema = z.object({ data: z.array(accessDeviceSchema) });
export type ListDevicesResponse = z.infer<typeof listDevicesResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Superficie CRM — consentimiento (biometrics:enroll / biometrics:revoke)
// ─────────────────────────────────────────────────────────────────────────

export const biometricConsentSchema = z.object({
  id: uuidSchema,
  memberId: uuidSchema,
  version: z.string(),
  grantedAt: isoInstantSchema,
  grantedMethod: biometricConsentMethodSchema,
  capturedByUserId: uuidSchema,
  documentKey: z.string().nullable(),
  revokedAt: isoInstantSchema.nullable(),
  revokedByUserId: uuidSchema.nullable(),
  revokeReason: z.string().nullable(),
});
export type BiometricConsent = z.infer<typeof biometricConsentSchema>;

export const grantConsentRequestSchema = z.object({
  /** Versión del texto de consentimiento que firmó el socio. */
  version: z.string().min(1).max(50),
  grantedMethod: biometricConsentMethodSchema,
  /** Clave del documento firmado escaneado, si existe. */
  documentKey: z.string().min(1).max(500).optional(),
});
export type GrantConsentRequest = z.infer<typeof grantConsentRequestSchema>;

export const grantConsentResponseSchema = z.object({ consent: biometricConsentSchema });
export type GrantConsentResponse = z.infer<typeof grantConsentResponseSchema>;

/**
 * La revocación de consentimiento revoca TODAS las credenciales activas del
 * socio en la misma transacción (API_CONTRACTS.md §10).
 */
export const revokeConsentResponseSchema = z.object({
  consent: biometricConsentSchema,
  revokedCredentials: z.number().int().min(0),
});
export type RevokeConsentResponse = z.infer<typeof revokeConsentResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Superficie CRM — enrolamientos (biometrics:enroll / biometrics:read)
// ─────────────────────────────────────────────────────────────────────────

export const biometricEnrollmentSchema = z.object({
  id: uuidSchema,
  branchId: uuidSchema,
  memberId: uuidSchema,
  localAgentId: uuidSchema,
  deviceId: uuidSchema,
  fingerPosition: fingerPositionSchema,
  status: biometricEnrollmentStatusSchema,
  samplesRequired: z.number().int().min(1),
  samplesCaptured: z.number().int().min(0),
  qualityScores: z.array(z.number().int()),
  failureReason: z.string().nullable(),
  startedByUserId: uuidSchema,
  startedAt: isoInstantSchema,
  completedAt: isoInstantSchema.nullable(),
  expiresAt: isoInstantSchema,
});
export type BiometricEnrollment = z.infer<typeof biometricEnrollmentSchema>;

export const startEnrollmentRequestSchema = z.object({
  localAgentId: uuidSchema,
  deviceId: uuidSchema,
  fingerPosition: fingerPositionSchema,
});
export type StartEnrollmentRequest = z.infer<typeof startEnrollmentRequestSchema>;

/**
 * El `deviceToken` es de un solo uso, scope ENROLL, atado al socio y con TTL
 * corto (120 s). El frontend se lo pasa al agente por el WS local y NUNCA lo
 * persiste (ni localStorage, ni estado global serializado).
 */
export const startEnrollmentResponseSchema = z.object({
  enrollmentId: uuidSchema,
  deviceToken: z.string(),
  expiresAt: isoInstantSchema,
  samplesRequired: z.number().int().min(1),
  minQuality: z.number().int().min(0).max(100),
});
export type StartEnrollmentResponse = z.infer<typeof startEnrollmentResponseSchema>;

export const getEnrollmentResponseSchema = z.object({ enrollment: biometricEnrollmentSchema });
export type GetEnrollmentResponse = z.infer<typeof getEnrollmentResponseSchema>;

export const cancelEnrollmentResponseSchema = z.object({ enrollment: biometricEnrollmentSchema });
export type CancelEnrollmentResponse = z.infer<typeof cancelEnrollmentResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Superficie CRM — credenciales (biometrics:read / biometrics:revoke)
// ─────────────────────────────────────────────────────────────────────────

/** Sólo metadatos. El template cifrado no tiene representación en la API. */
export const biometricCredentialSchema = z.object({
  id: uuidSchema,
  memberId: uuidSchema,
  branchId: uuidSchema.nullable(),
  fingerPosition: fingerPositionSchema,
  templateFormat: biometricTemplateFormatSchema,
  quality: z.number().int(),
  status: biometricCredentialStatusSchema,
  enrollmentId: uuidSchema,
  createdAt: isoInstantSchema,
  revokedAt: isoInstantSchema.nullable(),
  revokeReason: z.string().nullable(),
});
export type BiometricCredential = z.infer<typeof biometricCredentialSchema>;

export const listMemberCredentialsResponseSchema = z.object({
  data: z.array(biometricCredentialSchema),
});
export type ListMemberCredentialsResponse = z.infer<typeof listMemberCredentialsResponseSchema>;

export const revokeCredentialResponseSchema = z.object({ credential: biometricCredentialSchema });
export type RevokeCredentialResponse = z.infer<typeof revokeCredentialResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Superficie agente — espejo de Pulso.Agent.Backend/Http/HttpDtos.cs
// ─────────────────────────────────────────────────────────────────────────

export const agentPairRequestSchema = z.object({
  installationId: uuidSchema,
  secret: z.string().min(1),
  machineFingerprint: z.string().min(1).max(200),
  agentVersion: z.string().min(1).max(50),
  osVersion: z.string().min(1).max(200),
});
export type AgentPairRequest = z.infer<typeof agentPairRequestSchema>;

export const agentPairResponseSchema = z.object({
  agentCredential: z.string(),
  agentId: uuidSchema,
});
export type AgentPairResponse = z.infer<typeof agentPairResponseSchema>;

export const agentHeartbeatRequestSchema = z.object({
  /** Estado interno del agente (AgentState de Pulso.Agent.Core), texto libre. */
  agentState: z.string().min(1).max(50),
  agentVersion: z.string().min(1).max(50),
  deviceStatus: z.string().min(1).max(50).optional(),
});
export type AgentHeartbeatRequest = z.infer<typeof agentHeartbeatRequestSchema>;

export const AGENT_HEARTBEAT_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'REVOKED', 'BLOCKED'] as const;
export const agentHeartbeatStatusSchema = z.enum(AGENT_HEARTBEAT_STATUSES);
export type AgentHeartbeatStatus = z.infer<typeof agentHeartbeatStatusSchema>;

export const agentHeartbeatResponseSchema = z.object({
  status: agentHeartbeatStatusSchema,
  reason: z.string().nullable().optional(),
});
export type AgentHeartbeatResponse = z.infer<typeof agentHeartbeatResponseSchema>;

export const agentEventInputSchema = z.object({
  type: agentAuditEventTypeSchema,
  severity: agentAuditSeveritySchema,
  message: z.string().min(1).max(1000),
  /** Prohibido: imágenes, templates o documento del socio (DATA_MODEL.md §7). */
  metadata: z.record(z.string().max(500)).optional(),
  occurredAt: isoInstantSchema,
});
export type AgentEventInput = z.infer<typeof agentEventInputSchema>;

export const agentSendEventsRequestSchema = z.object({
  events: z.array(agentEventInputSchema).min(1).max(100),
});
export type AgentSendEventsRequest = z.infer<typeof agentSendEventsRequestSchema>;

export const agentSendEventsResponseSchema = z.object({
  accepted: z.number().int().min(0),
});
export type AgentSendEventsResponse = z.infer<typeof agentSendEventsResponseSchema>;

export const agentEnrollCompleteRequestSchema = z.object({
  enrollmentId: uuidSchema,
  template: templateBase64Schema,
  templateFormat: biometricTemplateFormatSchema,
  quality: z.number().int().min(0).max(100),
});
export type AgentEnrollCompleteRequest = z.infer<typeof agentEnrollCompleteRequestSchema>;

export const agentEnrollCompleteResponseSchema = z.object({ ok: z.literal(true) });
export type AgentEnrollCompleteResponse = z.infer<typeof agentEnrollCompleteResponseSchema>;

export const agentIdentifyRequestSchema = z.object({
  branchId: uuidSchema,
  deviceId: uuidSchema,
  template: templateBase64Schema,
  templateFormat: biometricTemplateFormatSchema,
  quality: z.number().int().min(0).max(100),
  capturedAt: isoInstantSchema,
});
export type AgentIdentifyRequest = z.infer<typeof agentIdentifyRequestSchema>;

/**
 * `{resolved:true}` y NADA más — el agente jamás recibe la identidad del
 * socio ni el resultado de la autorización (BIOMETRIC_SECURITY.md). El
 * resultado con PII viaja por WS `access.resolved` al navegador del CRM.
 */
export const agentIdentifyResponseSchema = z.object({ resolved: z.literal(true) });
export type AgentIdentifyResponse = z.infer<typeof agentIdentifyResponseSchema>;
