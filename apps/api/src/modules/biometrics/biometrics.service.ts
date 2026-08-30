import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { scoped } from '@pulso/db';
import type {
  BiometricConsent as DbBiometricConsent,
  BiometricCredential as DbBiometricCredential,
  BiometricEnrollment as DbBiometricEnrollment,
  Prisma,
} from '@pulso/db';
import type {
  AgentEnrollCompleteRequest,
  AgentEnrollCompleteResponse,
  AgentIdentifyRequest,
  AgentIdentifyResponse,
  BiometricCaptureStage,
  BiometricConsent,
  BiometricCredential,
  BiometricEnrollment,
  CancelEnrollmentResponse,
  CompleteHidEnrollmentRequest,
  CompleteHidEnrollmentResponse,
  GetEnrollmentResponse,
  GrantConsentRequest,
  GrantConsentResponse,
  HidCaptureTrace,
  HidSample,
  IdentifyHidRequest,
  ListMemberCredentialsResponse,
  RecordHidCaptureEventsRequest,
  RecordHidCaptureEventsResponse,
  RevokeConsentResponse,
  RevokeCredentialResponse,
  StartEnrollmentRequest,
  StartEnrollmentResponse,
  StartHidEnrollmentRequest,
  StartHidEnrollmentResponse,
  StartIdentificationRequest,
  StartIdentificationResponse,
} from '@pulso/contracts/biometrics';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { getLogger } from '../../common/logging/logger.js';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AppConfig } from '../../common/config/app-config.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuditService } from '../../common/audit/audit.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AccessService } from '../access/access.service.js';
import { BiometricCryptoService } from './biometric-crypto.service.js';
import { TenantContextStore } from '../../common/auth/tenant-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  DEVICE_TOKEN_PREFIX,
  generateToken,
  hashToken,
  type AgentAuthInfo,
} from '../agents/agent-auth.service.js';
import {
  BIOMETRIC_MATCHER,
  MatcherRejectedError,
  MatcherUnavailableError,
  resolveMatch,
  type BiometricMatcher,
  type ExtractedTemplate,
  type MatchCandidate,
} from './biometric-matcher.js';

/** Vida de una sesión de enrolamiento completa (captura de N muestras). */
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;

const HID_QUALITY_LABELS: Record<number, string> = {
  0: 'Good',
  1: 'NoImage',
  2: 'TooLight',
  3: 'TooDark',
  4: 'TooNoisy',
  5: 'LowContrast',
  6: 'NotEnoughFeatures',
  7: 'NotCentered',
  8: 'NotAFinger',
  9: 'TooHigh',
  10: 'TooLow',
  11: 'TooLeft',
  12: 'TooRight',
  13: 'TooStrange',
  14: 'TooFast',
  15: 'TooSkewed',
  16: 'TooShort',
  17: 'TooSlow',
  18: 'ReverseMotion',
  19: 'PressureTooHard',
  20: 'PressureTooLight',
  21: 'WetFinger',
  22: 'FakeFinger',
  23: 'TooSmall',
  24: 'RotatedTooMuch',
};

/** Contexto de trazabilidad de una captura HID. Nunca contiene biometría. */
interface CaptureContext {
  branchId: string;
  sessionId: string;
  deviceUid: string | null;
  trace: HidCaptureTrace | null;
  userId: string;
}

interface CaptureEventInput {
  stage: BiometricCaptureStage;
  severity: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
  memberId?: string | null;
  accessAttemptId?: string | null;
  enrollmentId?: string | null;
  occurredAt?: Date;
}

/** Marca de tiempo de la muestra y del inicio de adquisición según el navegador. */
function traceMetadata(trace: HidCaptureTrace | null): Record<string, string | number | null> {
  if (!trace) return {};
  return {
    readerModel: trace.readerModel,
    acquisitionStartedAt: trace.acquisitionStartedAt,
    acquiredAt: trace.acquiredAt,
    sampleBytes: trace.sampleBytes,
    webSdkVersion: trace.webSdkVersion ?? null,
    fingerprintSdkVersion: trace.fingerprintSdkVersion ?? null,
  };
}

function serializeConsent(consent: DbBiometricConsent): BiometricConsent {
  return {
    id: consent.id,
    memberId: consent.memberId,
    version: consent.version,
    grantedAt: consent.grantedAt.toISOString(),
    grantedMethod: consent.grantedMethod,
    capturedByUserId: consent.capturedByUserId,
    documentKey: consent.documentKey,
    revokedAt: consent.revokedAt?.toISOString() ?? null,
    revokedByUserId: consent.revokedByUserId,
    revokeReason: consent.revokeReason,
  };
}

function serializeEnrollment(enrollment: DbBiometricEnrollment): BiometricEnrollment {
  return {
    id: enrollment.id,
    branchId: enrollment.branchId,
    memberId: enrollment.memberId,
    captureProvider: enrollment.captureProvider,
    localAgentId: enrollment.localAgentId,
    deviceId: enrollment.deviceId,
    fingerPosition: enrollment.fingerPosition,
    status: enrollment.status,
    samplesRequired: enrollment.samplesRequired,
    samplesCaptured: enrollment.samplesCaptured,
    qualityScores: enrollment.qualityScores,
    failureReason: enrollment.failureReason,
    startedByUserId: enrollment.startedByUserId,
    startedAt: enrollment.startedAt.toISOString(),
    completedAt: enrollment.completedAt?.toISOString() ?? null,
    expiresAt: enrollment.expiresAt.toISOString(),
  };
}

/** Sólo metadatos: el template cifrado no tiene representación en la API. */
function serializeCredential(credential: DbBiometricCredential): BiometricCredential {
  return {
    id: credential.id,
    memberId: credential.memberId,
    branchId: credential.branchId,
    fingerPosition: credential.fingerPosition,
    templateFormat: credential.templateFormat,
    quality: credential.quality,
    status: credential.status,
    enrollmentId: credential.enrollmentId,
    createdAt: credential.createdAt.toISOString(),
    revokedAt: credential.revokedAt?.toISOString() ?? null,
    revokeReason: credential.revokeReason,
  };
}

/**
 * Consentimiento, enrolamiento, credenciales e identificación 1:N
 * (API_CONTRACTS.md §10, BIOMETRIC_SECURITY.md). El matcher es pluggable
 * (`BIOMETRIC_MATCHER`): SourceAFIS en producción e igualdad sólo con FakeSensor.
 */
@Injectable()
export class BiometricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly crypto: BiometricCryptoService,
    @Inject(BIOMETRIC_MATCHER) private readonly matcher: BiometricMatcher,
  ) {}

  // ── Consentimiento (biometrics:enroll / biometrics:revoke) ────────────

  async grantConsent(memberId: string, input: GrantConsentRequest): Promise<GrantConsentResponse> {
    const ctx = TenantContextStore.require();
    await this.requireMember(memberId);

    const consent = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.biometricConsent.create({
        data: scoped({
          memberId,
          version: input.version,
          grantedMethod: input.grantedMethod,
          capturedByUserId: ctx.userId,
          documentKey: input.documentKey ?? null,
        }),
      });
      await this.audit.recordIn(tx, {
        action: 'BIOMETRIC_CONSENT_GRANTED',
        resourceType: 'BiometricConsent',
        resourceId: created.id,
        after: { memberId, version: input.version, grantedMethod: input.grantedMethod },
      });
      return created;
    });
    return { consent: serializeConsent(consent) };
  }

  /**
   * Revoca el consentimiento vigente Y todas las credenciales activas del
   * socio en la MISMA transacción (BIOMETRIC_SECURITY.md §3.3).
   */
  async revokeConsent(memberId: string): Promise<RevokeConsentResponse> {
    const ctx = TenantContextStore.require();
    await this.requireMember(memberId);

    const active = await this.prisma.client.biometricConsent.findFirst({
      where: { memberId, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });
    if (!active) throw AppError.notFound('El consentimiento');

    const now = new Date();
    const { consent, revokedCredentials } = await this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.biometricConsent.update({
        where: { id: active.id },
        data: {
          revokedAt: now,
          revokedByUserId: ctx.userId,
          revokeReason: 'Revocado desde el CRM',
        },
      });
      const cascade = await tx.biometricCredential.updateMany({
        where: { memberId, status: 'ACTIVE' },
        data: {
          status: 'REVOKED',
          revokedAt: now,
          revokedByUserId: ctx.userId,
          revokeReason: 'Consentimiento revocado',
        },
      });
      await this.audit.recordIn(tx, {
        action: 'BIOMETRIC_CONSENT_REVOKED',
        resourceType: 'BiometricConsent',
        resourceId: active.id,
        after: { memberId, revokedCredentials: cascade.count },
      });
      return { consent: updated, revokedCredentials: cascade.count };
    });

    return { consent: serializeConsent(consent), revokedCredentials };
  }

  // ── Enrolamiento (biometrics:enroll / biometrics:read) ────────────────

  async startEnrollment(
    memberId: string,
    input: StartEnrollmentRequest,
  ): Promise<StartEnrollmentResponse> {
    const ctx = TenantContextStore.require();
    await this.requireMember(memberId);

    // La verificación de consentimiento es del BACKEND; el checkbox del
    // frontend no cuenta (BIOMETRIC_SECURITY.md §3.2).
    const consent = await this.prisma.client.biometricConsent.findFirst({
      where: { memberId, revokedAt: null },
    });
    if (!consent) {
      throw AppError.conflict(
        ErrorCode.NO_BIOMETRIC_CONSENT,
        'El socio no tiene consentimiento biométrico vigente.',
      );
    }

    const existing = await this.prisma.client.biometricCredential.findFirst({
      where: { memberId, fingerPosition: input.fingerPosition, status: 'ACTIVE' },
    });
    if (existing) {
      throw AppError.conflict(
        ErrorCode.FINGER_ALREADY_ENROLLED,
        'Ese dedo ya tiene una credencial activa.',
      );
    }

    const agent = await this.prisma.client.localAgent.findFirst({
      where: { id: input.localAgentId, branchId: { in: ctx.branchIds } },
    });
    if (!agent) throw AppError.notFound('El agente');
    if (agent.status !== 'ACTIVE') {
      throw AppError.conflict(ErrorCode.AGENT_OFFLINE, 'El agente no está activo.');
    }
    const onlineWindowMs = this.config.env.BIOMETRIC_AGENT_ONLINE_WINDOW * 1000;
    if (!agent.lastSeenAt || Date.now() - agent.lastSeenAt.getTime() > onlineWindowMs) {
      throw AppError.conflict(ErrorCode.AGENT_OFFLINE, 'El agente no reporta señales de vida.');
    }

    const device = await this.prisma.client.accessDevice.findFirst({
      where: { id: input.deviceId, localAgentId: agent.id },
    });
    if (!device) throw AppError.notFound('El lector');

    const samplesRequired = this.config.env.BIOMETRIC_ENROLL_SAMPLES;
    const minQuality = this.config.env.BIOMETRIC_MIN_QUALITY;
    const tokenTtlMs = this.config.env.BIOMETRIC_DEVICE_TOKEN_TTL * 1000;
    const now = Date.now();
    const deviceToken = generateToken(DEVICE_TOKEN_PREFIX);
    const tokenExpiresAt = new Date(now + tokenTtlMs);

    const enrollment = await this.prisma.client.$transaction(async (tx) => {
      const created = await tx.biometricEnrollment.create({
        data: scoped({
          branchId: agent.branchId,
          memberId,
          localAgentId: agent.id,
          deviceId: device.id,
          fingerPosition: input.fingerPosition,
          samplesRequired,
          startedByUserId: ctx.userId,
          expiresAt: new Date(now + ENROLLMENT_TTL_MS),
        }),
      });
      await tx.deviceToken.create({
        data: scoped({
          localAgentId: agent.id,
          tokenHash: hashToken(deviceToken),
          scope: 'ENROLL',
          subjectMemberId: memberId,
          enrollmentId: created.id,
          expiresAt: tokenExpiresAt,
        }),
      });
      await this.audit.recordIn(tx, {
        action: 'BIOMETRIC_ENROLLMENT_STARTED',
        resourceType: 'BiometricEnrollment',
        resourceId: created.id,
        after: { memberId, fingerPosition: input.fingerPosition, localAgentId: agent.id },
        branchId: agent.branchId,
      });
      return created;
    });

    return {
      enrollmentId: enrollment.id,
      deviceToken,
      expiresAt: tokenExpiresAt.toISOString(),
      samplesRequired,
      minQuality,
    };
  }

  async startHidEnrollment(
    memberId: string,
    input: StartHidEnrollmentRequest,
  ): Promise<StartHidEnrollmentResponse> {
    const ctx = TenantContextStore.require();
    const branchId = TenantContextStore.requireBranch(input.branchId);
    await this.requireMember(memberId);

    const consent = await this.prisma.client.biometricConsent.findFirst({
      where: { memberId, revokedAt: null },
    });
    if (!consent) {
      throw AppError.conflict(
        ErrorCode.NO_BIOMETRIC_CONSENT,
        'El socio no tiene consentimiento biométrico vigente.',
      );
    }

    const existing = await this.prisma.client.biometricCredential.findFirst({
      where: { memberId, fingerPosition: input.fingerPosition, status: 'ACTIVE' },
    });
    if (existing) {
      throw AppError.conflict(
        ErrorCode.FINGER_ALREADY_ENROLLED,
        'Ese dedo ya tiene una credencial activa.',
      );
    }

    const samplesRequired = this.config.env.BIOMETRIC_HID_ENROLL_SAMPLES;
    const enrollment = await this.prisma.client.biometricEnrollment.create({
      data: scoped({
        branchId,
        memberId,
        captureProvider: 'HID_WEB',
        localAgentId: null,
        deviceId: null,
        fingerPosition: input.fingerPosition,
        samplesRequired,
        startedByUserId: ctx.userId,
        expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS),
      }),
    });

    await this.audit.record({
      action: 'BIOMETRIC_ENROLLMENT_STARTED',
      resourceType: 'BiometricEnrollment',
      resourceId: enrollment.id,
      after: { memberId, fingerPosition: input.fingerPosition, captureProvider: 'HID_WEB' },
      branchId,
    });

    return {
      enrollmentId: enrollment.id,
      samplesRequired,
      minQuality: this.config.env.BIOMETRIC_MIN_QUALITY,
    };
  }

  /**
   * Cierra un enrolamiento HID con 1..3 muestras del mismo dedo. Con más de
   * una muestra se extrae cada plantilla, se cruzan entre sí (la primera como
   * sonda contra las demás) y se exige un score mínimo de consistencia: dos
   * capturas del mismo dedo que no se reconocen entre sí no sirven como
   * credencial. Se guarda sólo la plantilla de mejor calidad, cifrada.
   */
  async completeHidEnrollment(
    id: string,
    input: CompleteHidEnrollmentRequest,
  ): Promise<CompleteHidEnrollmentResponse> {
    const ctx = TenantContextStore.require();
    const enrollment = await this.prisma.client.biometricEnrollment.findFirst({
      where: { id, captureProvider: 'HID_WEB', startedByUserId: ctx.userId },
    });
    if (!enrollment) throw AppError.notFound('El enrolamiento HID');
    if (enrollment.status !== 'STARTED' && enrollment.status !== 'CAPTURING') {
      throw AppError.conflict(ErrorCode.CONFLICT, 'La sesión de enrolamiento ya no está abierta.');
    }
    if (enrollment.expiresAt.getTime() <= Date.now()) {
      await this.prisma.client.biometricEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'EXPIRED', failureReason: 'Sesión vencida', completedAt: new Date() },
      });
      throw AppError.conflict(ErrorCode.CONFLICT, 'La sesión de enrolamiento venció.');
    }
    const consent = await this.prisma.client.biometricConsent.findFirst({
      where: { memberId: enrollment.memberId, revokedAt: null },
    });
    if (!consent) {
      throw AppError.conflict(ErrorCode.NO_BIOMETRIC_CONSENT, 'El consentimiento fue revocado.');
    }

    const samples: HidSample[] =
      input.samples ??
      (input.pngBase64 !== undefined
        ? [{ pngBase64: input.pngBase64, qualityCode: input.qualityCode ?? null }]
        : []);
    const capture: CaptureContext = {
      branchId: enrollment.branchId,
      sessionId: input.capture?.sessionId ?? randomUUID(),
      deviceUid: input.capture?.deviceUid ?? null,
      trace: input.capture ?? null,
      userId: ctx.userId,
    };
    const failEnrollment = async (reason: string, event: CaptureEventInput) => {
      await this.prisma.client.biometricEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'FAILED', failureReason: reason, completedAt: new Date() },
      });
      await this.captureEvent(capture, {
        ...event,
        enrollmentId: enrollment.id,
        memberId: enrollment.memberId,
      });
      await this.audit.record({
        action: 'BIOMETRIC_ENROLLMENT_FAILED',
        resourceType: 'BiometricEnrollment',
        resourceId: enrollment.id,
        after: { memberId: enrollment.memberId, reason },
        branchId: enrollment.branchId,
      });
    };

    for (const [index, sample] of samples.entries()) {
      await this.captureEvent(capture, {
        stage: 'SAMPLE_RECEIVED',
        severity: 'INFO',
        message: `Muestra ${index + 1}/${samples.length} recibida para enrolar`,
        metadata: {
          sampleIndex: index + 1,
          qualityCode: sample.qualityCode,
          qualityLabel:
            sample.qualityCode === null ? null : (HID_QUALITY_LABELS[sample.qualityCode] ?? null),
          byteLength: Buffer.byteLength(sample.pngBase64, 'base64'),
          ...traceMetadata(capture.trace),
        },
        enrollmentId: enrollment.id,
        memberId: enrollment.memberId,
      });
      if (sample.qualityCode !== null && sample.qualityCode !== 0) {
        const label = HID_QUALITY_LABELS[sample.qualityCode] ?? String(sample.qualityCode);
        throw AppError.unprocessable(
          ErrorCode.TEMPLATE_QUALITY_TOO_LOW,
          `HID informó que la muestra ${index + 1} no tiene calidad suficiente (${label}).`,
        );
      }
    }

    const images = samples.map((sample) => Buffer.from(sample.pngBase64, 'base64'));
    const extracted: ExtractedTemplate[] = [];
    try {
      await this.prisma.client.biometricEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'CAPTURING' },
      });

      for (const [index, image] of images.entries()) {
        const startedAt = Date.now();
        try {
          const template = await this.matcher.extract(image);
          extracted.push(template);
          await this.captureEvent(capture, {
            stage: 'EXTRACTED',
            severity: 'INFO',
            message: `Plantilla ${index + 1} extraída`,
            metadata: {
              sampleIndex: index + 1,
              quality: template.quality,
              templateBytes: template.template.length,
              elapsedMs: Date.now() - startedAt,
            },
            enrollmentId: enrollment.id,
            memberId: enrollment.memberId,
          });
        } catch (error) {
          const detail = this.describeExtractFailure(error);
          await failEnrollment(detail.reason, {
            stage: 'EXTRACT_FAILED',
            severity: detail.unavailable ? 'ERROR' : 'WARN',
            message: detail.reason,
            metadata: { sampleIndex: index + 1, elapsedMs: Date.now() - startedAt },
          });
          if (detail.unavailable) {
            throw new AppError(
              ErrorCode.BIOMETRIC_MATCHER_UNAVAILABLE,
              503,
              'El servicio biométrico no está disponible. Reintentá en unos segundos.',
              { detail: 'El servicio biométrico no está disponible. Reintentá en unos segundos.' },
            );
          }
          throw AppError.unprocessable(ErrorCode.TEMPLATE_QUALITY_TOO_LOW, detail.reason);
        }
      }

      const qualities = extracted.map((item) => item.quality);
      let consistencyScore: number | null = null;
      if (extracted.length > 1) {
        const probe = extracted[0]!.template;
        const scores = await this.matcher.match(
          probe,
          extracted.slice(1).map((item, index) => ({
            credentialId: `sample-${index + 2}`,
            memberId: enrollment.memberId,
            template: item.template,
          })),
        );
        consistencyScore = scores.length > 0 ? Math.min(...scores.map((score) => score.score)) : 0;
        const required = this.config.env.BIOMETRIC_HID_ENROLL_CONSISTENCY;
        await this.captureEvent(capture, {
          stage: consistencyScore >= required ? 'MATCHED' : 'NO_MATCH',
          severity: consistencyScore >= required ? 'INFO' : 'WARN',
          message: `Consistencia entre muestras: ${consistencyScore} (mínimo ${required})`,
          metadata: { consistencyScore, required, samples: extracted.length },
          enrollmentId: enrollment.id,
          memberId: enrollment.memberId,
        });
        if (consistencyScore < required) {
          await failEnrollment('Las muestras no se reconocen entre sí', {
            stage: 'ENROLLMENT_FAILED',
            severity: 'WARN',
            message:
              'Las muestras capturadas no se reconocen entre sí; se pide repetir el enrolamiento',
            metadata: { consistencyScore, required },
          });
          throw AppError.unprocessable(
            ErrorCode.ENROLLMENT_SAMPLES_INCONSISTENT,
            'Las muestras no coinciden entre sí. Apoyá el mismo dedo, centrado y quieto, y repetí.',
          );
        }
      }

      const bestIndex = qualities.reduce(
        (best, quality, index) => (quality > qualities[best]! ? index : best),
        0,
      );
      const best = extracted[bestIndex]!;
      if (best.quality < this.config.env.BIOMETRIC_MIN_QUALITY) {
        await failEnrollment('Calidad insuficiente', {
          stage: 'ENROLLMENT_FAILED',
          severity: 'WARN',
          message: `La mejor plantilla (${best.quality}) no alcanza la calidad mínima`,
          metadata: { quality: best.quality, minQuality: this.config.env.BIOMETRIC_MIN_QUALITY },
        });
        throw AppError.unprocessable(
          ErrorCode.TEMPLATE_QUALITY_TOO_LOW,
          'La calidad de la captura no alcanza.',
        );
      }

      const templateHash = BiometricCryptoService.templateHash(best.template);
      const credentialId = randomUUID();
      const encrypted = await this.crypto.encryptTemplate(
        enrollment.gymId,
        credentialId,
        best.template,
      );

      await this.prisma.client.$transaction(async (tx) => {
        await tx.biometricCredential.create({
          data: scoped({
            id: credentialId,
            memberId: enrollment.memberId,
            branchId: null,
            fingerPosition: enrollment.fingerPosition,
            templateFormat: 'SOURCEAFIS_3_14',
            templateCiphertext: new Uint8Array(encrypted.templateCiphertext),
            templateNonce: new Uint8Array(encrypted.templateNonce),
            templateAuthTag: new Uint8Array(encrypted.templateAuthTag),
            dekWrapped: new Uint8Array(encrypted.dekWrapped),
            keyVersion: encrypted.keyVersion,
            templateHash: new Uint8Array(templateHash),
            quality: best.quality,
            enrollmentId: enrollment.id,
            createdByUserId: enrollment.startedByUserId,
          }),
        });
        await tx.biometricEnrollment.update({
          where: { id: enrollment.id },
          data: {
            status: 'COMPLETED',
            samplesCaptured: extracted.length,
            qualityScores: qualities,
            completedAt: new Date(),
          },
        });
        await this.audit.recordIn(tx, {
          action: 'BIOMETRIC_ENROLLMENT_COMPLETED',
          resourceType: 'BiometricEnrollment',
          resourceId: enrollment.id,
          after: {
            memberId: enrollment.memberId,
            credentialId,
            samples: extracted.length,
            quality: best.quality,
            consistencyScore,
          },
          branchId: enrollment.branchId,
        });
      });
      await this.captureEvent(capture, {
        stage: 'ENROLLMENT_COMPLETED',
        severity: 'INFO',
        message: 'Credencial creada a partir de la mejor muestra',
        metadata: {
          credentialId,
          samplesUsed: extracted.length,
          quality: best.quality,
          consistencyScore,
          bestSampleIndex: bestIndex + 1,
        },
        enrollmentId: enrollment.id,
        memberId: enrollment.memberId,
      });
      getLogger().info(
        {
          event: 'biometrics.hid.enrollment.completed',
          enrollmentId: enrollment.id,
          sessionId: capture.sessionId,
          samples: extracted.length,
          quality: best.quality,
          consistencyScore,
        },
        'Enrolamiento HID completado',
      );
      return {
        ok: true,
        credential: {
          id: credentialId,
          quality: best.quality,
          samplesUsed: extracted.length,
          consistencyScore,
        },
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        await failEnrollment('Template duplicado', {
          stage: 'ENROLLMENT_FAILED',
          severity: 'WARN',
          message: 'Esa huella ya está enrolada (hash duplicado)',
        });
        throw AppError.conflict(ErrorCode.CONFLICT, 'Esa huella ya está enrolada.');
      }
      throw err;
    } finally {
      for (const image of images) image.fill(0);
      for (const item of extracted) item.template.fill(0);
    }
  }

  async getEnrollment(id: string): Promise<GetEnrollmentResponse> {
    const enrollment = await this.prisma.client.biometricEnrollment.findFirst({ where: { id } });
    if (!enrollment) throw AppError.notFound('El enrolamiento');
    return { enrollment: serializeEnrollment(enrollment) };
  }

  async cancelEnrollment(id: string): Promise<CancelEnrollmentResponse> {
    const enrollment = await this.prisma.client.biometricEnrollment.findFirst({ where: { id } });
    if (!enrollment) throw AppError.notFound('El enrolamiento');
    if (enrollment.status !== 'STARTED' && enrollment.status !== 'CAPTURING') {
      return { enrollment: serializeEnrollment(enrollment) };
    }
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.biometricEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      // El deviceToken emitido para esta sesión muere con ella.
      await tx.deviceToken.updateMany({
        where: { enrollmentId: enrollment.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return row;
    });
    return { enrollment: serializeEnrollment(updated) };
  }

  // ── Identificación desde el CRM (access:operate) ─────────────────────

  async startIdentification(
    input: StartIdentificationRequest,
  ): Promise<StartIdentificationResponse> {
    const branchId = TenantContextStore.requireBranch(input.branchId);
    const onlineCutoff = new Date(
      Date.now() - this.config.env.BIOMETRIC_AGENT_ONLINE_WINDOW * 1000,
    );

    const agent = await this.prisma.client.localAgent.findFirst({
      where: {
        branchId,
        status: 'ACTIVE',
        lastSeenAt: { gte: onlineCutoff },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (!agent) {
      throw AppError.conflict(
        ErrorCode.AGENT_OFFLINE,
        'No hay un agente biométrico online en la sede.',
      );
    }

    const device = await this.prisma.client.accessDevice.findFirst({
      where: {
        branchId,
        localAgentId: agent.id,
        kind: 'FINGERPRINT_READER',
        status: 'ONLINE',
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (!device) {
      throw AppError.conflict(
        ErrorCode.AGENT_OFFLINE,
        'No hay un lector de huellas online en la sede.',
      );
    }

    const deviceToken = generateToken(DEVICE_TOKEN_PREFIX);
    const expiresAt = new Date(Date.now() + this.config.env.BIOMETRIC_DEVICE_TOKEN_TTL * 1000);
    await this.prisma.client.deviceToken.create({
      data: scoped({
        localAgentId: agent.id,
        tokenHash: hashToken(deviceToken),
        scope: 'IDENTIFY',
        expiresAt,
      }),
    });

    return {
      deviceToken,
      deviceId: device.id,
      expiresAt: expiresAt.toISOString(),
      minQuality: this.config.env.BIOMETRIC_MIN_QUALITY,
    };
  }

  // ── Credenciales (biometrics:read / biometrics:revoke) ────────────────

  async listMemberCredentials(memberId: string): Promise<ListMemberCredentialsResponse> {
    await this.requireMember(memberId);
    const credentials = await this.prisma.client.biometricCredential.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
    });
    return { data: credentials.map(serializeCredential) };
  }

  async revokeCredential(id: string): Promise<RevokeCredentialResponse> {
    const ctx = TenantContextStore.require();
    const credential = await this.prisma.client.biometricCredential.findFirst({ where: { id } });
    if (!credential) throw AppError.notFound('La credencial');
    if (credential.status === 'REVOKED') {
      return { credential: serializeCredential(credential) };
    }
    const updated = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.biometricCredential.update({
        where: { id: credential.id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedByUserId: ctx.userId,
          revokeReason: 'Revocada desde el CRM',
        },
      });
      await this.audit.recordIn(tx, {
        action: 'BIOMETRIC_CREDENTIAL_REVOKED',
        resourceType: 'BiometricCredential',
        resourceId: credential.id,
        after: { memberId: credential.memberId, fingerPosition: credential.fingerPosition },
      });
      return row;
    });
    return { credential: serializeCredential(updated) };
  }

  // ── Superficie agente: enroll-complete ────────────────────────────────

  async enrollComplete(
    auth: AgentAuthInfo,
    input: AgentEnrollCompleteRequest,
  ): Promise<AgentEnrollCompleteResponse> {
    this.requireActiveAgent(auth);
    const token = this.requireDeviceToken(auth, 'ENROLL');

    // Un token de ENROLL nace atado a una sesión concreta: no sirve para
    // completar otra (BIOMETRIC_SECURITY.md §8.2).
    if (token.enrollmentId !== input.enrollmentId) {
      throw AppError.unauthorized(
        ErrorCode.INVALID_DEVICE_TOKEN,
        'El token no corresponde a esta sesión.',
      );
    }
    await this.consumeDeviceToken(token.id);

    const enrollment = await this.prisma.client.biometricEnrollment.findFirst({
      where: { id: input.enrollmentId, localAgentId: auth.agent.id },
    });
    if (!enrollment) throw AppError.notFound('El enrolamiento');
    if (enrollment.status !== 'STARTED' && enrollment.status !== 'CAPTURING') {
      throw AppError.conflict(ErrorCode.CONFLICT, 'La sesión de enrolamiento ya no está abierta.');
    }
    if (enrollment.expiresAt.getTime() <= Date.now()) {
      await this.prisma.client.biometricEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'EXPIRED', failureReason: 'Sesión vencida' },
      });
      throw AppError.conflict(ErrorCode.CONFLICT, 'La sesión de enrolamiento venció.');
    }

    // El consentimiento pudo revocarse ENTRE el inicio y la entrega del
    // template: se re-verifica acá, no sólo en startEnrollment.
    const consent = await this.prisma.client.biometricConsent.findFirst({
      where: { memberId: enrollment.memberId, revokedAt: null },
    });
    if (!consent) {
      throw AppError.conflict(ErrorCode.NO_BIOMETRIC_CONSENT, 'El consentimiento fue revocado.');
    }

    if (input.quality < this.config.env.BIOMETRIC_MIN_QUALITY) {
      throw AppError.unprocessable(
        ErrorCode.TEMPLATE_QUALITY_TOO_LOW,
        'La calidad de la captura no alcanza.',
      );
    }

    const template = Buffer.from(input.template, 'base64');
    const templateHash = BiometricCryptoService.templateHash(template);
    const credentialId = randomUUID();
    const encrypted = await this.crypto.encryptTemplate(auth.agent.gymId, credentialId, template);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        await tx.biometricCredential.create({
          data: scoped({
            id: credentialId,
            memberId: enrollment.memberId,
            branchId: null,
            fingerPosition: enrollment.fingerPosition,
            templateFormat: input.templateFormat,
            // Uint8Array nuevos: el tipo Bytes de Prisma no acepta Buffer
            // (su ArrayBufferLike admite SharedArrayBuffer y el tipo choca).
            templateCiphertext: new Uint8Array(encrypted.templateCiphertext),
            templateNonce: new Uint8Array(encrypted.templateNonce),
            templateAuthTag: new Uint8Array(encrypted.templateAuthTag),
            dekWrapped: new Uint8Array(encrypted.dekWrapped),
            keyVersion: encrypted.keyVersion,
            templateHash: new Uint8Array(templateHash),
            quality: input.quality,
            enrollmentId: enrollment.id,
            createdByUserId: enrollment.startedByUserId,
          }),
        });
        await tx.biometricEnrollment.update({
          where: { id: enrollment.id },
          data: {
            status: 'COMPLETED',
            samplesCaptured: enrollment.samplesRequired,
            qualityScores: { push: input.quality },
            completedAt: new Date(),
          },
        });
      });
    } catch (err) {
      // unique(gymId, templateHash) where ACTIVE: la MISMA huella ya está
      // enrolada — para otro socio es el fraude de compartir membresía
      // (BIOMETRIC_SECURITY.md §6); para el mismo, un re-enrolamiento.
      if (isUniqueViolation(err)) {
        await this.prisma.client.biometricEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'FAILED', failureReason: 'Template duplicado', completedAt: new Date() },
        });
        throw AppError.conflict(ErrorCode.CONFLICT, 'Esa huella ya está enrolada.');
      }
      throw err;
    }

    return { ok: true };
  }

  // ── Superficie agente: identify 1:N ───────────────────────────────────

  async identify(auth: AgentAuthInfo, input: AgentIdentifyRequest): Promise<AgentIdentifyResponse> {
    this.requireActiveAgent(auth);
    const token = this.requireDeviceToken(auth, 'IDENTIFY');

    // La sede sale del AGENTE autenticado, nunca del payload: un agente de la
    // sede A no identifica contra el padrón de la B (BIOMETRIC_SECURITY.md §5.2).
    if (input.branchId !== auth.agent.branchId) {
      throw AppError.forbidden(ErrorCode.FORBIDDEN, 'El lector no pertenece a esa sede.');
    }

    const device = await this.prisma.client.accessDevice.findFirst({
      where: {
        id: input.deviceId,
        branchId: auth.agent.branchId,
        localAgentId: auth.agent.id,
        kind: 'FINGERPRINT_READER',
      },
    });
    if (!device) {
      throw AppError.forbidden(
        ErrorCode.FORBIDDEN,
        'El lector no pertenece al agente autenticado.',
      );
    }

    await this.consumeDeviceToken(token.id);

    if (input.quality < this.config.env.BIOMETRIC_MIN_QUALITY) {
      throw AppError.unprocessable(
        ErrorCode.TEMPLATE_QUALITY_TOO_LOW,
        'La calidad de la captura no alcanza.',
      );
    }

    const probe = Buffer.from(input.template, 'base64');
    await this.resolveProbe(auth.agent.branchId, probe, input.templateFormat);
    return { resolved: true };
  }

  /**
   * Identificación 1:N desde el navegador. Siempre deja un `AccessAttempt`:
   * también cuando la muestra no sirve (calidad HID, PNG inválido) — el
   * operador ve "Lectura no válida" y la bitácora explica por qué. Sólo la
   * caída del servicio biométrico se reporta como error (503), y aun así
   * queda registrada.
   */
  async identifyHid(input: IdentifyHidRequest): Promise<AccessCheckResponse> {
    const ctx = TenantContextStore.require();
    const branchId = TenantContextStore.requireBranch(input.branchId);
    const capture: CaptureContext = {
      branchId,
      sessionId: input.capture?.sessionId ?? randomUUID(),
      deviceUid: input.capture?.deviceUid ?? null,
      trace: input.capture ?? null,
      userId: ctx.userId,
    };
    const byteLength = Buffer.byteLength(input.pngBase64, 'base64');
    await this.captureEvent(capture, {
      stage: 'SAMPLE_RECEIVED',
      severity: 'INFO',
      message: 'Muestra recibida para identificar',
      metadata: {
        qualityCode: input.qualityCode,
        qualityLabel:
          input.qualityCode === null ? null : (HID_QUALITY_LABELS[input.qualityCode] ?? null),
        byteLength,
        ...traceMetadata(capture.trace),
      },
    });

    if (input.qualityCode !== null && input.qualityCode !== 0) {
      const label = HID_QUALITY_LABELS[input.qualityCode] ?? String(input.qualityCode);
      return this.captureFailed(
        capture,
        `HID informó calidad insuficiente: ${label} (${input.qualityCode}).`,
        { qualityCode: input.qualityCode, qualityLabel: label },
      );
    }

    const image = Buffer.from(input.pngBase64, 'base64');
    let extracted: ExtractedTemplate;
    const startedAt = Date.now();
    try {
      extracted = await this.matcher.extract(image);
    } catch (error) {
      const detail = this.describeExtractFailure(error);
      if (detail.unavailable) {
        const attempt = await this.captureFailed(capture, detail.reason, {
          elapsedMs: Date.now() - startedAt,
          unavailable: true,
        });
        throw new AppError(
          ErrorCode.BIOMETRIC_MATCHER_UNAVAILABLE,
          503,
          'El servicio biométrico no está disponible. Reintentá en unos segundos.',
          {
            detail: 'El servicio biométrico no está disponible. Reintentá en unos segundos.',
            meta: { accessAttemptId: attempt.accessAttemptId },
          },
        );
      }
      return this.captureFailed(capture, detail.reason, { elapsedMs: Date.now() - startedAt });
    } finally {
      image.fill(0);
    }

    await this.captureEvent(capture, {
      stage: 'EXTRACTED',
      severity: 'INFO',
      message: 'Plantilla extraída',
      metadata: {
        quality: extracted.quality,
        templateBytes: extracted.template.length,
        elapsedMs: Date.now() - startedAt,
      },
    });
    if (extracted.quality < this.config.env.BIOMETRIC_MIN_QUALITY) {
      extracted.template.fill(0);
      return this.captureFailed(
        capture,
        `La calidad de la plantilla (${extracted.quality}) no alcanza el mínimo (${this.config.env.BIOMETRIC_MIN_QUALITY}).`,
        { quality: extracted.quality, minQuality: this.config.env.BIOMETRIC_MIN_QUALITY },
      );
    }
    return this.resolveProbe(branchId, extracted.template, 'SOURCEAFIS_3_14', capture);
  }

  /** Bitácora del navegador (session start, errores HID, foco, timeouts…). */
  async recordHidCaptureEvents(
    input: RecordHidCaptureEventsRequest,
  ): Promise<RecordHidCaptureEventsResponse> {
    const ctx = TenantContextStore.require();
    const branchId = TenantContextStore.requireBranch(input.branchId);
    const rows = input.events.map((event) =>
      scoped({
        branchId,
        sessionId: event.sessionId,
        source: 'browser',
        stage: event.stage,
        severity: event.severity,
        message: event.message,
        deviceUid: event.deviceUid ?? null,
        metadata: (event.metadata ?? {}) as Prisma.InputJsonObject,
        userId: ctx.userId,
        occurredAt: new Date(event.occurredAt),
      }),
    );
    const created = await this.prisma.client.biometricCaptureEvent.createMany({ data: rows });
    const worst = input.events.some((e) => e.severity === 'ERROR')
      ? 'error'
      : input.events.some((e) => e.severity === 'WARN')
        ? 'warn'
        : 'info';
    getLogger()[worst](
      {
        event: 'biometrics.hid.browser-events',
        branchId,
        accepted: created.count,
        stages: input.events.map((e) => e.stage),
      },
      'Eventos de captura HID del navegador',
    );
    return { accepted: created.count };
  }

  private async resolveProbe(
    branchId: string,
    probe: Buffer,
    templateFormat: AgentIdentifyRequest['templateFormat'],
    capture: CaptureContext | null = null,
  ): Promise<AccessCheckResponse> {
    // Candidatos: credenciales ACTIVE de esta sede o válidas en todo el gym.
    // El gymId lo pone la extensión de Prisma desde el contexto del agente.
    const candidates = await this.prisma.client.biometricCredential.findMany({
      where: {
        status: 'ACTIVE',
        templateFormat,
        OR: [{ branchId }, { branchId: null }],
      },
    });

    // Descifrado SÓLO en memoria y sólo del conjunto de candidatos de la
    // sede (BIOMETRIC_SECURITY.md §4.4).
    const decrypted: MatchCandidate[] = [];
    let undecryptable = 0;
    for (const candidate of candidates) {
      try {
        decrypted.push({
          credentialId: candidate.id,
          memberId: candidate.memberId,
          template: await this.crypto.decryptTemplate(candidate),
        });
      } catch {
        // Falla de autenticidad GCM: el ciphertext no corresponde a este
        // gym/credencial (AAD, BIOMETRIC_SECURITY.md §4.2) o está corrupto.
        // Se excluye del matching — jamás autentica.
        undecryptable += 1;
      }
    }

    let scores;
    const matchStartedAt = Date.now();
    try {
      scores = await this.matcher.match(probe, decrypted);
    } catch (error) {
      if (capture) {
        const reason = error instanceof Error ? error.message : 'El matcher falló.';
        const attempt = await this.captureFailed(capture, reason, {
          candidates: decrypted.length,
          unavailable: true,
        });
        throw new AppError(
          ErrorCode.BIOMETRIC_MATCHER_UNAVAILABLE,
          503,
          'El servicio biométrico no está disponible. Reintentá en unos segundos.',
          {
            detail: 'El servicio biométrico no está disponible. Reintentá en unos segundos.',
            meta: { accessAttemptId: attempt.accessAttemptId },
          },
        );
      }
      throw error;
    } finally {
      // Los buffers descifrados y la sonda se sobrescriben también si el matcher falla (§4.4).
      for (const item of decrypted) item.template.fill(0);
      probe.fill(0);
    }
    const { match, topScore } = resolveMatch(
      scores,
      this.config.env.BIOMETRIC_MATCH_THRESHOLD,
      this.config.env.BIOMETRIC_MATCH_AMBIGUITY_MARGIN,
    );
    const matchMetadata = {
      candidates: decrypted.length,
      undecryptable,
      topScore,
      threshold: this.config.env.BIOMETRIC_MATCH_THRESHOLD,
      elapsedMs: Date.now() - matchStartedAt,
    };

    if (!match) {
      const attempt = await this.prisma.client.accessAttempt.create({
        data: scoped({
          branchId,
          memberId: null,
          method: 'FINGERPRINT',
          rawInput: null,
          decision: 'DENIED',
          reasonCode: 'BIOMETRIC_NO_MATCH',
          detail: 'Ninguna credencial superó el umbral de matching.',
          matchScore: topScore === null ? null : Math.round(topScore),
        }),
      });
      if (capture) {
        await this.captureEvent(capture, {
          stage: 'NO_MATCH',
          severity: 'WARN',
          message: 'Ninguna credencial superó el umbral',
          metadata: matchMetadata,
          accessAttemptId: attempt.id,
        });
        getLogger().info(
          {
            event: 'biometrics.hid.identify',
            sessionId: capture.sessionId,
            outcome: 'no-match',
            ...matchMetadata,
          },
          'Identificación HID sin coincidencia',
        );
      }
      return {
        decision: 'DENIED',
        reasonCode: 'BIOMETRIC_NO_MATCH',
        member: null,
        membership: null,
        attendanceRegistered: false,
        accessAttemptId: attempt.id,
      };
    }

    if (capture) {
      await this.captureEvent(capture, {
        stage: 'MATCHED',
        severity: 'INFO',
        message: `Coincidencia con score ${match.score}`,
        metadata: { ...matchMetadata, score: match.score },
        memberId: match.memberId,
      });
    }

    // Match: aplica la MISMA cadena de autorización que POST /access/check y
    // registra AccessAttempt + Attendance. El resultado con PII viaja al
    // navegador del CRM; el agente sólo recibe {resolved:true}.
    const result = await this.access.checkForMember({
      memberId: match.memberId,
      branchId,
      method: 'FINGERPRINT',
      matchScore: Math.round(match.score),
    });
    if (capture) {
      await this.captureEvent(capture, {
        stage: 'ACCESS_RESULT',
        severity: result.decision === 'ALLOWED' ? 'INFO' : 'WARN',
        message: `${result.decision} — ${result.reasonCode}`,
        metadata: {
          decision: result.decision,
          reasonCode: result.reasonCode,
          attendanceRegistered: result.attendanceRegistered,
        },
        memberId: match.memberId,
        accessAttemptId: result.accessAttemptId,
      });
      if (result.attendanceRegistered) {
        await this.captureEvent(capture, {
          stage: 'ATTENDANCE_REGISTERED',
          severity: 'INFO',
          message: 'Asistencia registrada',
          memberId: match.memberId,
          accessAttemptId: result.accessAttemptId,
        });
      }
      getLogger().info(
        {
          event: 'biometrics.hid.identify',
          sessionId: capture.sessionId,
          outcome: result.decision,
          reasonCode: result.reasonCode,
          attendanceRegistered: result.attendanceRegistered,
          accessAttemptId: result.accessAttemptId,
          ...matchMetadata,
        },
        'Identificación HID resuelta',
      );
    }
    return result;
  }

  /** Registra un intento DENIED por captura inválida y devuelve la respuesta de acceso. */
  private async captureFailed(
    capture: CaptureContext,
    reason: string,
    metadata: Record<string, string | number | boolean | null> = {},
  ): Promise<AccessCheckResponse> {
    const attempt = await this.prisma.client.accessAttempt.create({
      data: scoped({
        branchId: capture.branchId,
        memberId: null,
        method: 'FINGERPRINT',
        rawInput: null,
        decision: 'DENIED',
        reasonCode: 'BIOMETRIC_CAPTURE_FAILED',
        detail: reason.slice(0, 500),
        matchScore: null,
      }),
    });
    await this.captureEvent(capture, {
      stage: 'EXTRACT_FAILED',
      severity: metadata['unavailable'] === true ? 'ERROR' : 'WARN',
      message: reason,
      metadata,
      accessAttemptId: attempt.id,
    });
    getLogger().warn(
      {
        event: 'biometrics.hid.identify',
        sessionId: capture.sessionId,
        outcome: 'capture-failed',
        reason,
        ...metadata,
      },
      'Identificación HID: la muestra no sirvió',
    );
    return {
      decision: 'DENIED',
      reasonCode: 'BIOMETRIC_CAPTURE_FAILED',
      member: null,
      membership: null,
      attendanceRegistered: false,
      accessAttemptId: attempt.id,
    };
  }

  private describeExtractFailure(error: unknown): { reason: string; unavailable: boolean } {
    if (error instanceof MatcherUnavailableError) {
      return { reason: error.message, unavailable: true };
    }
    if (error instanceof MatcherRejectedError) {
      return {
        reason: 'El extractor rechazó la muestra: el PNG no es una huella válida.',
        unavailable: false,
      };
    }
    return {
      reason: error instanceof Error ? error.message : 'La extracción falló.',
      unavailable: true,
    };
  }

  /** Fila append-only en biometric_capture_events. Jamás recibe biometría. */
  private async captureEvent(capture: CaptureContext, event: CaptureEventInput): Promise<void> {
    await this.prisma.client.biometricCaptureEvent.create({
      data: scoped({
        branchId: capture.branchId,
        sessionId: capture.sessionId,
        source: 'api',
        stage: event.stage,
        severity: event.severity,
        message: event.message.slice(0, 500),
        deviceUid: capture.deviceUid,
        metadata: (event.metadata ?? {}) as Prisma.InputJsonObject,
        memberId: event.memberId ?? null,
        accessAttemptId: event.accessAttemptId ?? null,
        enrollmentId: event.enrollmentId ?? null,
        userId: capture.userId,
        occurredAt: event.occurredAt ?? new Date(),
      }),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private requireActiveAgent(auth: AgentAuthInfo): void {
    if (auth.agent.status !== 'ACTIVE') {
      throw AppError.forbidden(ErrorCode.AGENT_REVOKED, 'El agente no está activo.');
    }
  }

  private requireDeviceToken(auth: AgentAuthInfo, scope: 'ENROLL' | 'IDENTIFY') {
    if (auth.kind !== 'device' || !auth.deviceToken) {
      throw AppError.unauthorized(
        ErrorCode.INVALID_DEVICE_TOKEN,
        'Esta operación requiere un deviceToken.',
      );
    }
    // Un token de ENROLL no sirve para identify, y viceversa (§8.2).
    if (auth.deviceToken.scope !== scope) {
      throw AppError.unauthorized(
        ErrorCode.INVALID_DEVICE_TOKEN,
        'El token no tiene el scope de esta operación.',
      );
    }
    return auth.deviceToken;
  }

  /**
   * Consumo ATÓMICO del token de un solo uso: dos requests con el mismo token
   * compiten por el `updateMany` condicional; exactamente una gana.
   */
  private async consumeDeviceToken(id: string): Promise<void> {
    const consumed = await this.prisma.client.deviceToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw AppError.unauthorized(
        ErrorCode.INVALID_DEVICE_TOKEN,
        'El token ya fue usado o venció.',
      );
    }
  }

  private async requireMember(memberId: string) {
    const member = await this.prisma.client.member.findFirst({
      where: { id: memberId, deletedAt: null },
    });
    if (!member) throw AppError.notFound('El socio');
    return member;
  }
}

/** unique de Prisma (P2002) o de Postgres directo (23505). */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return code === 'P2002' || code === '23505';
}

// El tipo Prisma se importa sólo para dejar claro que las transacciones acá
// usan el cliente extendido; evita un falso "unused" en builds estrictos.
export type { Prisma };
