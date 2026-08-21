-- CreateEnum
CREATE TYPE "LocalAgentStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'DISABLED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AccessDeviceKind" AS ENUM ('FINGERPRINT_READER', 'CARD_READER', 'BARRIER');

-- CreateEnum
CREATE TYPE "AccessDeviceVendor" AS ENUM ('HID_DIGITALPERSONA', 'OTHER');

-- CreateEnum
CREATE TYPE "AccessDeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "FingerPosition" AS ENUM ('RIGHT_THUMB', 'RIGHT_INDEX', 'RIGHT_MIDDLE', 'RIGHT_RING', 'RIGHT_LITTLE', 'LEFT_THUMB', 'LEFT_INDEX', 'LEFT_MIDDLE', 'LEFT_RING', 'LEFT_LITTLE');

-- CreateEnum
CREATE TYPE "BiometricConsentMethod" AS ENUM ('IN_PERSON_SIGNED', 'DIGITAL');

-- CreateEnum
CREATE TYPE "BiometricEnrollmentStatus" AS ENUM ('STARTED', 'CAPTURING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BiometricTemplateFormat" AS ENUM ('ANSI_378_2004', 'ISO_19794_2_2005', 'VENDOR_DIGITALPERSONA');

-- CreateEnum
CREATE TYPE "BiometricCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AgentAuditEventType" AS ENUM ('AGENT_STARTED', 'AGENT_STOPPED', 'DEVICE_CONNECTED', 'DEVICE_DISCONNECTED', 'CAPTURE_STARTED', 'CAPTURE_TIMEOUT', 'CAPTURE_CANCELLED', 'QUALITY_REJECTED', 'IDENTIFY_SENT', 'ENROLL_SENT', 'AUTH_FAILED', 'PROTOCOL_ERROR', 'UPDATE_APPLIED');

-- CreateEnum
CREATE TYPE "AgentAuditSeverity" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "DeviceTokenScope" AS ENUM ('ENROLL', 'IDENTIFY');

-- DropIndex
DROP INDEX "members_document_trgm_idx";

-- CreateTable
CREATE TABLE "local_agents" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "installationId" UUID NOT NULL,
    "machineFingerprint" TEXT,
    "agentVersion" TEXT,
    "osVersion" TEXT,
    "status" "LocalAgentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "enrollmentSecretHash" TEXT NOT NULL,
    "agentCredentialHash" TEXT,
    "lastSeenAt" TIMESTAMPTZ(3),
    "approvedByUserId" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "local_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_devices" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "localAgentId" UUID NOT NULL,
    "kind" "AccessDeviceKind" NOT NULL,
    "vendor" "AccessDeviceVendor" NOT NULL,
    "model" TEXT NOT NULL,
    "serialNumber" TEXT,
    "status" "AccessDeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMPTZ(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_consents" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedMethod" "BiometricConsentMethod" NOT NULL,
    "capturedByUserId" UUID NOT NULL,
    "documentKey" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "revokeReason" TEXT,

    CONSTRAINT "biometric_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_enrollments" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "localAgentId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "fingerPosition" "FingerPosition" NOT NULL,
    "status" "BiometricEnrollmentStatus" NOT NULL DEFAULT 'STARTED',
    "samplesRequired" INTEGER NOT NULL,
    "samplesCaptured" INTEGER NOT NULL DEFAULT 0,
    "qualityScores" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "failureReason" TEXT,
    "startedByUserId" UUID NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "biometric_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometric_credentials" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "branchId" UUID,
    "fingerPosition" "FingerPosition" NOT NULL,
    "templateFormat" "BiometricTemplateFormat" NOT NULL,
    "templateCiphertext" BYTEA NOT NULL,
    "templateNonce" BYTEA NOT NULL,
    "templateAuthTag" BYTEA NOT NULL,
    "dekWrapped" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "templateHash" BYTEA NOT NULL,
    "quality" INTEGER NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "status" "BiometricCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedByUserId" UUID,
    "revokeReason" TEXT,

    CONSTRAINT "biometric_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_audit_events" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "localAgentId" UUID NOT NULL,
    "deviceId" UUID,
    "type" "AgentAuditEventType" NOT NULL,
    "severity" "AgentAuditSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "localAgentId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scope" "DeviceTokenScope" NOT NULL,
    "subjectMemberId" UUID,
    "enrollmentId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "local_agents_gymId_branchId_status_idx" ON "local_agents"("gymId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "local_agents_gymId_installationId_key" ON "local_agents"("gymId", "installationId");

-- CreateIndex
CREATE INDEX "access_devices_gymId_branchId_status_idx" ON "access_devices"("gymId", "branchId", "status");

-- CreateIndex
CREATE INDEX "biometric_consents_gymId_memberId_grantedAt_idx" ON "biometric_consents"("gymId", "memberId", "grantedAt" DESC);

-- CreateIndex
CREATE INDEX "biometric_enrollments_gymId_memberId_startedAt_idx" ON "biometric_enrollments"("gymId", "memberId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "biometric_enrollments_status_expiresAt_idx" ON "biometric_enrollments"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "biometric_credentials_gymId_branchId_status_idx" ON "biometric_credentials"("gymId", "branchId", "status");

-- CreateIndex
CREATE INDEX "biometric_credentials_gymId_memberId_status_idx" ON "biometric_credentials"("gymId", "memberId", "status");

-- CreateIndex
CREATE INDEX "agent_audit_events_gymId_localAgentId_occurredAt_idx" ON "agent_audit_events"("gymId", "localAgentId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "agent_audit_events_gymId_severity_occurredAt_idx" ON "agent_audit_events"("gymId", "severity", "occurredAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_tokenHash_key" ON "device_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "device_tokens_localAgentId_scope_expiresAt_idx" ON "device_tokens"("localAgentId", "scope", "expiresAt");

-- AddForeignKey
ALTER TABLE "local_agents" ADD CONSTRAINT "local_agents_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_agents" ADD CONSTRAINT "local_agents_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_devices" ADD CONSTRAINT "access_devices_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_devices" ADD CONSTRAINT "access_devices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_devices" ADD CONSTRAINT "access_devices_localAgentId_fkey" FOREIGN KEY ("localAgentId") REFERENCES "local_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_consents" ADD CONSTRAINT "biometric_consents_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_consents" ADD CONSTRAINT "biometric_consents_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_enrollments" ADD CONSTRAINT "biometric_enrollments_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_enrollments" ADD CONSTRAINT "biometric_enrollments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_enrollments" ADD CONSTRAINT "biometric_enrollments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_enrollments" ADD CONSTRAINT "biometric_enrollments_localAgentId_fkey" FOREIGN KEY ("localAgentId") REFERENCES "local_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_enrollments" ADD CONSTRAINT "biometric_enrollments_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "access_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_credentials" ADD CONSTRAINT "biometric_credentials_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_credentials" ADD CONSTRAINT "biometric_credentials_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_credentials" ADD CONSTRAINT "biometric_credentials_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometric_credentials" ADD CONSTRAINT "biometric_credentials_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "biometric_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_audit_events" ADD CONSTRAINT "agent_audit_events_localAgentId_fkey" FOREIGN KEY ("localAgentId") REFERENCES "local_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_localAgentId_fkey" FOREIGN KEY ("localAgentId") REFERENCES "local_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Uniques parciales (DATA_MODEL.md §7) — Prisma no sabe expresarlos.
-- ─────────────────────────────────────────────────────────────────────────────

-- Un lector físico por serial dentro del mismo agente (cuando reporta serial).
CREATE UNIQUE INDEX "access_devices_gym_agent_serial_key"
  ON "access_devices" ("gymId", "localAgentId", "serialNumber")
  WHERE "serialNumber" IS NOT NULL;

-- Un dedo, una credencial activa.
CREATE UNIQUE INDEX "biometric_credentials_gym_member_finger_active_key"
  ON "biometric_credentials" ("gymId", "memberId", "fingerPosition")
  WHERE "status" = 'ACTIVE';

-- Impide que dos socios enrolen la misma huella (compartir membresía).
CREATE UNIQUE INDEX "biometric_credentials_gym_template_hash_active_key"
  ON "biometric_credentials" ("gymId", "templateHash")
  WHERE "status" = 'ACTIVE';
