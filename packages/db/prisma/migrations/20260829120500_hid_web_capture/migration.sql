CREATE TYPE "BiometricCaptureProvider" AS ENUM ('LOCAL_AGENT', 'HID_WEB');

ALTER TABLE "biometric_enrollments"
  ADD COLUMN "captureProvider" "BiometricCaptureProvider" NOT NULL DEFAULT 'LOCAL_AGENT',
  ALTER COLUMN "localAgentId" DROP NOT NULL,
  ALTER COLUMN "deviceId" DROP NOT NULL;
