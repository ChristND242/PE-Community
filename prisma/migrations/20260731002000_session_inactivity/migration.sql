ALTER TABLE "Session"
ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "idleExpiresAt" TIMESTAMP(3);

-- Existing signed-in browsers receive one fresh idle window when this policy is deployed.
UPDATE "Session"
SET "lastActivityAt" = CURRENT_TIMESTAMP,
    "idleExpiresAt" = LEAST("expiresAt", CURRENT_TIMESTAMP + INTERVAL '20 minutes');

ALTER TABLE "Session"
ALTER COLUMN "idleExpiresAt" SET NOT NULL;

CREATE INDEX "Session_idleExpiresAt_idx" ON "Session"("idleExpiresAt");
