-- Existing accounts predate primary-email verification and retain their current access state.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "User"
SET "emailVerifiedAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP);
