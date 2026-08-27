import { describe, expect, it } from 'vitest';
import {
  AccessDeviceKind as PrismaAccessDeviceKind,
  AccessDeviceStatus as PrismaAccessDeviceStatus,
  AccessDeviceVendor as PrismaAccessDeviceVendor,
  AgentAuditEventType as PrismaAgentAuditEventType,
  AgentAuditSeverity as PrismaAgentAuditSeverity,
  BiometricConsentMethod as PrismaBiometricConsentMethod,
  BiometricCredentialStatus as PrismaBiometricCredentialStatus,
  BiometricEnrollmentStatus as PrismaBiometricEnrollmentStatus,
  BiometricTemplateFormat as PrismaBiometricTemplateFormat,
  DeviceTokenScope as PrismaDeviceTokenScope,
  FingerPosition as PrismaFingerPosition,
  LocalAgentStatus as PrismaLocalAgentStatus,
} from '@prisma/client';

import {
  accessDeviceKindSchema,
  accessDeviceStatusSchema,
  accessDeviceVendorSchema,
  agentAuditEventTypeSchema,
  agentAuditSeveritySchema,
  biometricConsentMethodSchema,
  biometricCredentialStatusSchema,
  biometricEnrollmentStatusSchema,
  biometricTemplateFormatSchema,
  deviceTokenScopeSchema,
  fingerPositionSchema,
  localAgentStatusSchema,
} from './biometrics.js';
import {
  agentEnrollCompleteRequestSchema,
  agentHeartbeatRequestSchema,
  agentIdentifyRequestSchema,
  agentIdentifyResponseSchema,
  agentPairRequestSchema,
  agentSendEventsRequestSchema,
  biometricCredentialSchema,
  createAgentRequestSchema,
  grantConsentRequestSchema,
  revokeAgentRequestSchema,
  revokeConsentResponseSchema,
  startIdentificationRequestSchema,
  startIdentificationResponseSchema,
  startEnrollmentRequestSchema,
  startEnrollmentResponseSchema,
} from './biometrics.js';

const UUID = '018f1e2a-0000-7000-8000-000000000000';
const INSTANT = '2026-08-21T10:00:00.000-03:00';
// SHA-256 en base64 — largo típico de un template del FakeSensor.
const TEMPLATE_B64 = 'q83vEjRWeJq83vEjRWeJq83vEjRWeJq83vEjRWeJq82rzQ==';

function expectMatchesPrismaEnum(zodEnum: { options: readonly string[] }, prismaEnum: Record<string, string>) {
  expect([...zodEnum.options].sort()).toEqual(Object.values(prismaEnum).sort());
}

describe('biometrics — enums 1:1 con Prisma (DATA_MODEL.md §7)', () => {
  it('todos los enums del contrato coinciden con los de la base', () => {
    expectMatchesPrismaEnum(localAgentStatusSchema, PrismaLocalAgentStatus);
    expectMatchesPrismaEnum(accessDeviceKindSchema, PrismaAccessDeviceKind);
    expectMatchesPrismaEnum(accessDeviceVendorSchema, PrismaAccessDeviceVendor);
    expectMatchesPrismaEnum(accessDeviceStatusSchema, PrismaAccessDeviceStatus);
    expectMatchesPrismaEnum(fingerPositionSchema, PrismaFingerPosition);
    expectMatchesPrismaEnum(biometricConsentMethodSchema, PrismaBiometricConsentMethod);
    expectMatchesPrismaEnum(biometricEnrollmentStatusSchema, PrismaBiometricEnrollmentStatus);
    expectMatchesPrismaEnum(biometricTemplateFormatSchema, PrismaBiometricTemplateFormat);
    expectMatchesPrismaEnum(biometricCredentialStatusSchema, PrismaBiometricCredentialStatus);
    expectMatchesPrismaEnum(agentAuditEventTypeSchema, PrismaAgentAuditEventType);
    expectMatchesPrismaEnum(agentAuditSeveritySchema, PrismaAgentAuditSeverity);
    expectMatchesPrismaEnum(deviceTokenScopeSchema, PrismaDeviceTokenScope);
  });
});

describe('biometrics — superficie CRM', () => {
  it('createAgentRequest exige branchId uuid y nombre razonable', () => {
    expect(createAgentRequestSchema.safeParse({ branchId: UUID, name: 'Recepción principal' }).success).toBe(true);
    expect(createAgentRequestSchema.safeParse({ branchId: 'no-uuid', name: 'Recepción' }).success).toBe(false);
    expect(createAgentRequestSchema.safeParse({ branchId: UUID, name: 'x' }).success).toBe(false);
  });

  it('revokeAgentRequest exige motivo de al menos 5 caracteres', () => {
    expect(revokeAgentRequestSchema.safeParse({ reason: 'PC comprometida' }).success).toBe(true);
    expect(revokeAgentRequestSchema.safeParse({ reason: 'x' }).success).toBe(false);
    expect(revokeAgentRequestSchema.safeParse({}).success).toBe(false);
  });

  it('grantConsentRequest acepta con y sin documentKey', () => {
    expect(
      grantConsentRequestSchema.safeParse({ version: 'v1', grantedMethod: 'IN_PERSON_SIGNED' }).success,
    ).toBe(true);
    expect(
      grantConsentRequestSchema.safeParse({
        version: 'v1',
        grantedMethod: 'DIGITAL',
        documentKey: 'consents/2026/abc.pdf',
      }).success,
    ).toBe(true);
    expect(grantConsentRequestSchema.safeParse({ version: 'v1', grantedMethod: 'ORAL' }).success).toBe(false);
  });

  it('revokeConsentResponse informa cuántas credenciales cayeron en cascada', () => {
    const result = revokeConsentResponseSchema.safeParse({
      consent: {
        id: UUID,
        memberId: UUID,
        version: 'v1',
        grantedAt: INSTANT,
        grantedMethod: 'IN_PERSON_SIGNED',
        capturedByUserId: UUID,
        documentKey: null,
        revokedAt: INSTANT,
        revokedByUserId: UUID,
        revokeReason: 'Pedido del socio',
      },
      revokedCredentials: 2,
    });
    expect(result.success).toBe(true);
    expect(revokeConsentResponseSchema.safeParse({ revokedCredentials: -1 }).success).toBe(false);
  });

  it('startEnrollmentRequest exige agente, lector y dedo del catálogo', () => {
    expect(
      startEnrollmentRequestSchema.safeParse({ localAgentId: UUID, deviceId: UUID, fingerPosition: 'RIGHT_INDEX' })
        .success,
    ).toBe(true);
    expect(
      startEnrollmentRequestSchema.safeParse({ localAgentId: UUID, deviceId: UUID, fingerPosition: 'RIGHT_EAR' })
        .success,
    ).toBe(false);
  });

  it('startEnrollmentResponse trae deviceToken efímero y parámetros de captura', () => {
    expect(
      startEnrollmentResponseSchema.safeParse({
        enrollmentId: UUID,
        deviceToken: 'tok_abc',
        expiresAt: INSTANT,
        samplesRequired: 4,
        minQuality: 60,
      }).success,
    ).toBe(true);
    expect(
      startEnrollmentResponseSchema.safeParse({
        enrollmentId: UUID,
        deviceToken: 'tok_abc',
        expiresAt: INSTANT,
        samplesRequired: 0,
        minQuality: 60,
      }).success,
    ).toBe(false);
  });

  it('startIdentification emite un token efímero para una sede válida', () => {
    expect(startIdentificationRequestSchema.safeParse({ branchId: UUID }).success).toBe(true);
    expect(startIdentificationRequestSchema.safeParse({ branchId: 'no-uuid' }).success).toBe(false);

    expect(
      startIdentificationResponseSchema.safeParse({
        deviceToken: 'pdt_abc',
        deviceId: UUID,
        expiresAt: INSTANT,
        minQuality: 60,
      }).success,
    ).toBe(true);
    expect(
      startIdentificationResponseSchema.safeParse({
        deviceToken: 'pdt_abc',
        deviceId: UUID,
        expiresAt: INSTANT,
        minQuality: 101,
      }).success,
    ).toBe(false);
  });

  it('biometricCredential expone sólo metadatos — sin campos de template', () => {
    const shape = biometricCredentialSchema.shape as Record<string, unknown>;
    for (const forbidden of ['templateCiphertext', 'templateNonce', 'templateAuthTag', 'dekWrapped', 'templateHash', 'template']) {
      expect(shape[forbidden], `el schema no debe exponer '${forbidden}'`).toBeUndefined();
    }
  });
});

describe('biometrics — superficie agente (espejo de HttpDtos.cs)', () => {
  it('pair exige installationId uuid y secreto', () => {
    expect(
      agentPairRequestSchema.safeParse({
        installationId: UUID,
        secret: 's3cr3t',
        machineFingerprint: 'fp-hash',
        agentVersion: '1.0.0',
        osVersion: 'Windows 11',
      }).success,
    ).toBe(true);
    expect(
      agentPairRequestSchema.safeParse({
        installationId: 'no-uuid',
        secret: 's3cr3t',
        machineFingerprint: 'fp',
        agentVersion: '1.0.0',
        osVersion: 'w',
      }).success,
    ).toBe(false);
  });

  it('heartbeat acepta deviceStatus opcional', () => {
    expect(agentHeartbeatRequestSchema.safeParse({ agentState: 'Ready', agentVersion: '1.0.0' }).success).toBe(true);
    expect(
      agentHeartbeatRequestSchema.safeParse({ agentState: 'Ready', agentVersion: '1.0.0', deviceStatus: 'ONLINE' })
        .success,
    ).toBe(true);
    expect(agentHeartbeatRequestSchema.safeParse({ agentVersion: '1.0.0' }).success).toBe(false);
  });

  it('events exige lote de 1 a 100 con tipos del catálogo', () => {
    const event = { type: 'AGENT_STARTED', severity: 'INFO', message: 'arrancó', occurredAt: INSTANT };
    expect(agentSendEventsRequestSchema.safeParse({ events: [event] }).success).toBe(true);
    expect(agentSendEventsRequestSchema.safeParse({ events: [] }).success).toBe(false);
    expect(
      agentSendEventsRequestSchema.safeParse({ events: [{ ...event, type: 'INVENTADO' }] }).success,
    ).toBe(false);
  });

  it('enroll-complete exige template base64 y calidad 0-100', () => {
    const valid = {
      enrollmentId: UUID,
      template: TEMPLATE_B64,
      templateFormat: 'VENDOR_DIGITALPERSONA',
      quality: 80,
    };
    expect(agentEnrollCompleteRequestSchema.safeParse(valid).success).toBe(true);
    expect(agentEnrollCompleteRequestSchema.safeParse({ ...valid, template: 'no es base64!!!' }).success).toBe(false);
    expect(agentEnrollCompleteRequestSchema.safeParse({ ...valid, quality: 101 }).success).toBe(false);
  });

  it('identify exige sede, lector, template y capturedAt con offset', () => {
    const valid = {
      branchId: UUID,
      deviceId: UUID,
      template: TEMPLATE_B64,
      templateFormat: 'VENDOR_DIGITALPERSONA',
      quality: 70,
      capturedAt: INSTANT,
    };
    expect(agentIdentifyRequestSchema.safeParse(valid).success).toBe(true);
    expect(agentIdentifyRequestSchema.safeParse({ ...valid, capturedAt: '2026-08-21' }).success).toBe(false);
  });

  it('la respuesta de identify es {resolved:true} y nada más — sin PII', () => {
    expect(agentIdentifyResponseSchema.safeParse({ resolved: true }).success).toBe(true);
    expect(agentIdentifyResponseSchema.safeParse({ resolved: false }).success).toBe(false);
    const parsed = agentIdentifyResponseSchema.parse({ resolved: true });
    expect(Object.keys(parsed)).toEqual(['resolved']);
  });
});
