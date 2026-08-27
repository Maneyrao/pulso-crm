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
  BiometricConsent,
  BiometricCredential,
  BiometricEnrollment,
  CancelEnrollmentResponse,
  GetEnrollmentResponse,
  GrantConsentRequest,
  GrantConsentResponse,
  ListMemberCredentialsResponse,
  RevokeConsentResponse,
  RevokeCredentialResponse,
  StartEnrollmentRequest,
  StartEnrollmentResponse,
  StartIdentificationRequest,
  StartIdentificationResponse,
} from '@pulso/contracts/biometrics';
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
import { DEVICE_TOKEN_PREFIX, generateToken, hashToken, type AgentAuthInfo } from '../agents/agent-auth.service.js';
import { BIOMETRIC_MATCHER, resolveMatch, type BiometricMatcher, type MatchCandidate } from './biometric-matcher.js';

/** Vida de una sesión de enrolamiento completa (captura de N muestras). */
const ENROLLMENT_TTL_MS = 10 * 60 * 1000;

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
 * (`BIOMETRIC_MATCHER`): igualdad de bytes hasta que llegue el SDK real.
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
        data: { revokedAt: now, revokedByUserId: ctx.userId, revokeReason: 'Revocado desde el CRM' },
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

  async startEnrollment(memberId: string, input: StartEnrollmentRequest): Promise<StartEnrollmentResponse> {
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
      throw AppError.conflict(ErrorCode.FINGER_ALREADY_ENROLLED, 'Ese dedo ya tiene una credencial activa.');
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

  async startIdentification(input: StartIdentificationRequest): Promise<StartIdentificationResponse> {
    const branchId = TenantContextStore.requireBranch(input.branchId);
    const onlineCutoff = new Date(Date.now() - this.config.env.BIOMETRIC_AGENT_ONLINE_WINDOW * 1000);

    const agent = await this.prisma.client.localAgent.findFirst({
      where: {
        branchId,
        status: 'ACTIVE',
        lastSeenAt: { gte: onlineCutoff },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (!agent) {
      throw AppError.conflict(ErrorCode.AGENT_OFFLINE, 'No hay un agente biométrico online en la sede.');
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
      throw AppError.conflict(ErrorCode.AGENT_OFFLINE, 'No hay un lector de huellas online en la sede.');
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

  async enrollComplete(auth: AgentAuthInfo, input: AgentEnrollCompleteRequest): Promise<AgentEnrollCompleteResponse> {
    this.requireActiveAgent(auth);
    const token = this.requireDeviceToken(auth, 'ENROLL');

    // Un token de ENROLL nace atado a una sesión concreta: no sirve para
    // completar otra (BIOMETRIC_SECURITY.md §8.2).
    if (token.enrollmentId !== input.enrollmentId) {
      throw AppError.unauthorized(ErrorCode.INVALID_DEVICE_TOKEN, 'El token no corresponde a esta sesión.');
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
      throw AppError.unprocessable(ErrorCode.TEMPLATE_QUALITY_TOO_LOW, 'La calidad de la captura no alcanza.');
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
      throw AppError.forbidden(ErrorCode.FORBIDDEN, 'El lector no pertenece al agente autenticado.');
    }

    await this.consumeDeviceToken(token.id);

    if (input.quality < this.config.env.BIOMETRIC_MIN_QUALITY) {
      throw AppError.unprocessable(ErrorCode.TEMPLATE_QUALITY_TOO_LOW, 'La calidad de la captura no alcanza.');
    }

    const probe = Buffer.from(input.template, 'base64');
    const branchId = auth.agent.branchId;

    // Candidatos: credenciales ACTIVE de esta sede o válidas en todo el gym.
    // El gymId lo pone la extensión de Prisma desde el contexto del agente.
    const candidates = await this.prisma.client.biometricCredential.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ branchId }, { branchId: null }],
      },
    });

    // Descifrado SÓLO en memoria y sólo del conjunto de candidatos de la
    // sede (BIOMETRIC_SECURITY.md §4.4).
    const decrypted: MatchCandidate[] = [];
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
      }
    }

    const scores = this.matcher.match(probe, decrypted);
    const { match, topScore } = resolveMatch(
      scores,
      this.config.env.BIOMETRIC_MATCH_THRESHOLD,
      this.config.env.BIOMETRIC_MATCH_AMBIGUITY_MARGIN,
    );

    // Los buffers descifrados se sobrescriben al terminar (§4.4).
    for (const item of decrypted) item.template.fill(0);

    if (!match) {
      await this.prisma.client.accessAttempt.create({
        data: scoped({
          branchId,
          memberId: null,
          method: 'FINGERPRINT',
          rawInput: null,
          decision: 'DENIED',
          reasonCode: 'BIOMETRIC_NO_MATCH',
          detail: 'Ninguna credencial superó el umbral de matching.',
          matchScore: topScore,
        }),
      });
      return { resolved: true };
    }

    // Match: aplica la MISMA cadena de autorización que POST /access/check y
    // registra AccessAttempt + Attendance. El resultado con PII viaja al
    // navegador del CRM; el agente sólo recibe {resolved:true}.
    await this.access.checkForMember({
      memberId: match.memberId,
      branchId,
      method: 'FINGERPRINT',
      matchScore: match.score,
    });

    return { resolved: true };
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private requireActiveAgent(auth: AgentAuthInfo): void {
    if (auth.agent.status !== 'ACTIVE') {
      throw AppError.forbidden(ErrorCode.AGENT_REVOKED, 'El agente no está activo.');
    }
  }

  private requireDeviceToken(auth: AgentAuthInfo, scope: 'ENROLL' | 'IDENTIFY') {
    if (auth.kind !== 'device' || !auth.deviceToken) {
      throw AppError.unauthorized(ErrorCode.INVALID_DEVICE_TOKEN, 'Esta operación requiere un deviceToken.');
    }
    // Un token de ENROLL no sirve para identify, y viceversa (§8.2).
    if (auth.deviceToken.scope !== scope) {
      throw AppError.unauthorized(ErrorCode.INVALID_DEVICE_TOKEN, 'El token no tiene el scope de esta operación.');
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
      throw AppError.unauthorized(ErrorCode.INVALID_DEVICE_TOKEN, 'El token ya fue usado o venció.');
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
