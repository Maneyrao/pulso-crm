-- CreateTable
CREATE TABLE "tenant_biometric_keys" (
    "id" UUID NOT NULL,
    "gymId" UUID NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "kekWrapped" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_biometric_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_biometric_keys_gymId_keyVersion_key" ON "tenant_biometric_keys"("gymId", "keyVersion");

-- AddForeignKey
ALTER TABLE "tenant_biometric_keys" ADD CONSTRAINT "tenant_biometric_keys_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
