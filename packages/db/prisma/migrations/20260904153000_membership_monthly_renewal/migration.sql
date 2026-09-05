-- Only Membership changes. Historical dates, prices, payments and ledger remain intact.
ALTER TABLE "memberships"
  ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "renewalAnchorDay" INTEGER,
  ADD COLUMN "nextRenewalDate" DATE,
  ADD COLUMN "renewedFromId" UUID;

CREATE UNIQUE INDEX "memberships_gymId_memberId_id_key" ON "memberships"("gymId", "memberId", "id");
CREATE UNIQUE INDEX "memberships_gymId_renewedFromId_key" ON "memberships"("gymId", "renewedFromId");
CREATE INDEX "memberships_gymId_autoRenew_nextRenewalDate_idx" ON "memberships"("gymId", "autoRenew", "nextRenewalDate");

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_renewal_parent_fkey"
    FOREIGN KEY ("gymId", "memberId", "renewedFromId")
    REFERENCES "memberships"("gymId", "memberId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "memberships_renewal_anchor_valid"
    CHECK ("renewalAnchorDay" IS NULL OR "renewalAnchorDay" BETWEEN 1 AND 31),
  ADD CONSTRAINT "memberships_renewal_schedule_valid"
    CHECK ((NOT "autoRenew" AND "nextRenewalDate" IS NULL) OR
      ("autoRenew" AND "renewalAnchorDay" IS NOT NULL AND "endDate" IS NOT NULL
       AND "nextRenewalDate" IS NOT NULL AND "nextRenewalDate" > "endDate")),
  ADD CONSTRAINT "memberships_renewal_not_self"
    CHECK ("renewedFromId" IS NULL OR "renewedFromId" <> "id");
