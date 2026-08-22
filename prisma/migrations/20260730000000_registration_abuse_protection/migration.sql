-- Preserve historical rows while making redundant active applications non-actionable.
ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');
ALTER TABLE "RegistrationApplication"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ApplicationStatus"
    USING ("status"::text::"ApplicationStatus"),
  ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "ApplicationStatus_old";

ALTER TABLE "RegistrationApplication"
  ADD COLUMN "normalizedEmail" TEXT,
  ADD COLUMN "submissionAttemptCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastSubmissionAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastReminderQueuedAt" TIMESTAMP(3),
  ADD COLUMN "lastSecurityNoticeQueuedAt" TIMESTAMP(3),
  ADD COLUMN "lastNotificationSuppressedAt" TIMESTAMP(3),
  ADD COLUMN "lastNotificationSuppressionReason" TEXT,
  ADD COLUMN "lastIpHash" TEXT;

UPDATE "RegistrationApplication"
SET
  "email" = LOWER(BTRIM("email")),
  "normalizedEmail" = LOWER(BTRIM("email")),
  "lastSubmissionAttemptAt" = "createdAt";

WITH ranked AS (
  SELECT
    application."id",
    application."communityId",
    application."normalizedEmail",
    application."status",
    ROW_NUMBER() OVER (
      PARTITION BY application."communityId", application."normalizedEmail"
      ORDER BY
        CASE WHEN application."status" = 'APPROVED' THEN 0 ELSE 1 END,
        application."createdAt",
        application."id"
    ) AS active_rank,
    COUNT(*) OVER (
      PARTITION BY application."communityId", application."normalizedEmail"
    ) AS active_count,
    MAX(application."createdAt") OVER (
      PARTITION BY application."communityId", application."normalizedEmail"
    ) AS latest_attempt_at,
    EXISTS (
      SELECT 1
      FROM "User" user_record
      JOIN "Membership" membership
        ON membership."userId" = user_record."id"
       AND membership."communityId" = application."communityId"
       AND membership."status" = 'ACTIVE'
      WHERE LOWER(BTRIM(user_record."email")) = application."normalizedEmail"
    ) AS has_active_membership
  FROM "RegistrationApplication" application
  WHERE application."status" IN ('PENDING', 'APPROVED')
),
canonical AS (
  SELECT *
  FROM ranked
  WHERE active_rank = 1
)
UPDATE "RegistrationApplication" application
SET
  "submissionAttemptCount" = canonical.active_count,
  "lastSubmissionAttemptAt" = canonical.latest_attempt_at
FROM canonical
WHERE application."id" = canonical."id";

WITH ranked AS (
  SELECT
    application."id",
    application."status",
    ROW_NUMBER() OVER (
      PARTITION BY application."communityId", application."normalizedEmail"
      ORDER BY
        CASE WHEN application."status" = 'APPROVED' THEN 0 ELSE 1 END,
        application."createdAt",
        application."id"
    ) AS active_rank,
    EXISTS (
      SELECT 1
      FROM "User" user_record
      JOIN "Membership" membership
        ON membership."userId" = user_record."id"
       AND membership."communityId" = application."communityId"
       AND membership."status" = 'ACTIVE'
      WHERE LOWER(BTRIM(user_record."email")) = application."normalizedEmail"
    ) AS has_active_membership
  FROM "RegistrationApplication" application
  WHERE application."status" IN ('PENDING', 'APPROVED')
),
superseded AS (
  UPDATE "RegistrationApplication" application
  SET
    "status" = 'SUPERSEDED',
    "passwordHash" = NULL
  FROM ranked
  WHERE application."id" = ranked."id"
    AND (
      ranked.active_rank > 1
      OR (ranked.has_active_membership AND ranked."status" = 'PENDING')
    )
  RETURNING application."id", application."communityId"
)
INSERT INTO "AuditLog" (
  "id",
  "communityId",
  "action",
  "targetType",
  "targetId",
  "metadata",
  "createdAt"
)
SELECT
  'registration-reconcile-' || MD5(superseded."id"),
  superseded."communityId",
  'registration.superseded',
  'RegistrationApplication',
  superseded."id",
  '{"reason":"legacy_active_duplicate_reconciliation"}'::jsonb,
  CURRENT_TIMESTAMP
FROM superseded;

ALTER TABLE "RegistrationApplication"
  ALTER COLUMN "normalizedEmail" SET NOT NULL;

CREATE INDEX "RegistrationApplication_communityId_normalizedEmail_idx"
  ON "RegistrationApplication"("communityId", "normalizedEmail");

CREATE UNIQUE INDEX "RegistrationApplication_active_email_unique"
  ON "RegistrationApplication"("communityId", "normalizedEmail")
  WHERE "status" IN ('PENDING', 'APPROVED');

ALTER TABLE "CommunitySettings"
  ADD COLUMN "registrationCaptchaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "registrationCaptchaMode" TEXT NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN "registrationCaptchaProvider" TEXT NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN "registrationCaptchaVariant" TEXT,
  ADD COLUMN "registrationCaptchaSiteKey" TEXT,
  ADD COLUMN "registrationCaptchaSecretEncrypted" TEXT,
  ADD COLUMN "registrationCaptchaHostname" TEXT,
  ADD COLUMN "registrationCaptchaAction" TEXT,
  ADD COLUMN "registrationCaptchaMinimumScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  ADD COLUMN "registrationIpLimit" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "registrationIpWindowMinutes" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "registrationNotificationCooldownHours" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "registrationGlobalEmailDailyLimit" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "CommunitySettings"
  ADD CONSTRAINT "CommunitySettings_registrationCaptchaMode_check"
    CHECK ("registrationCaptchaMode" IN ('DISABLED', 'ALWAYS')),
  ADD CONSTRAINT "CommunitySettings_registrationCaptchaProvider_check"
    CHECK ("registrationCaptchaProvider" IN ('DISABLED', 'CLOUDFLARE_TURNSTILE', 'GOOGLE_RECAPTCHA', 'HCAPTCHA')),
  ADD CONSTRAINT "CommunitySettings_registrationCaptchaVariant_check"
    CHECK ("registrationCaptchaVariant" IS NULL OR "registrationCaptchaVariant" IN ('V2_CHECKBOX', 'V3_SCORE')),
  ADD CONSTRAINT "CommunitySettings_registrationCaptchaMinimumScore_check"
    CHECK ("registrationCaptchaMinimumScore" >= 0 AND "registrationCaptchaMinimumScore" <= 1),
  ADD CONSTRAINT "CommunitySettings_registrationIpLimit_check"
    CHECK ("registrationIpLimit" BETWEEN 1 AND 20),
  ADD CONSTRAINT "CommunitySettings_registrationIpWindowMinutes_check"
    CHECK ("registrationIpWindowMinutes" BETWEEN 1 AND 60),
  ADD CONSTRAINT "CommunitySettings_registrationNotificationCooldownHours_check"
    CHECK ("registrationNotificationCooldownHours" BETWEEN 6 AND 24),
  ADD CONSTRAINT "CommunitySettings_registrationGlobalEmailDailyLimit_check"
    CHECK ("registrationGlobalEmailDailyLimit" BETWEEN 1 AND 10);
