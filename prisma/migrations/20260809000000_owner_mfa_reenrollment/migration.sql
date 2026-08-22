-- Additive recovery state for the server-local Owner MFA break-glass workflow.
ALTER TABLE "User"
ADD COLUMN "twoFactorReenrollmentRequired" BOOLEAN NOT NULL DEFAULT false;
