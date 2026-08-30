-- Motivo de rechazo cuando la muestra HID no sirvió (calidad, PNG inválido, extracción).
ALTER TYPE "AccessReasonCode" ADD VALUE IF NOT EXISTS 'BIOMETRIC_CAPTURE_FAILED';

CREATE TYPE "BiometricCaptureStage" AS ENUM (
  'SESSION_STARTED',
  'READER_DETECTED',
  'ACQUISITION_STARTED',
  'QUALITY_REPORTED',
  'SAMPLE_RECEIVED',
  'SAMPLE_INVALID',
  'SAMPLE_TIMEOUT',
  'HID_ERROR',
  'DEVICE_DISCONNECTED',
  'ADC_UNREACHABLE',
  'PAGE_BLUR',
  'SESSION_STOPPED',
  'EXTRACTED',
  'EXTRACT_FAILED',
  'MATCHED',
  'NO_MATCH',
  'ACCESS_RESULT',
  'ATTENDANCE_REGISTERED',
  'ENROLLMENT_COMPLETED',
  'ENROLLMENT_FAILED'
);

-- Bitácora de captura HID (navegador + pipeline). Nunca contiene biometría.
CREATE TABLE "biometric_capture_events" (
  "id" UUID NOT NULL,
  "gymId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "source" TEXT NOT NULL,
  "stage" "BiometricCaptureStage" NOT NULL,
  "severity" "AgentAuditSeverity" NOT NULL,
  "message" TEXT NOT NULL,
  "deviceUid" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "memberId" UUID,
  "accessAttemptId" UUID,
  "enrollmentId" UUID,
  "userId" UUID,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "biometric_capture_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "biometric_capture_events_gymId_branchId_occurredAt_idx"
  ON "biometric_capture_events"("gymId", "branchId", "occurredAt" DESC);
CREATE INDEX "biometric_capture_events_gymId_sessionId_occurredAt_idx"
  ON "biometric_capture_events"("gymId", "sessionId", "occurredAt");
CREATE INDEX "biometric_capture_events_gymId_stage_occurredAt_idx"
  ON "biometric_capture_events"("gymId", "stage", "occurredAt" DESC);

ALTER TABLE "biometric_capture_events"
  ADD CONSTRAINT "biometric_capture_events_gymId_fkey"
  FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "biometric_capture_events"
  ADD CONSTRAINT "biometric_capture_events_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
