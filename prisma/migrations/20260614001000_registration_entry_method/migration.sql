ALTER TABLE "CommunitySettings"
  ALTER COLUMN "registrationApprovalMode" SET DEFAULT 'portal_registration';

UPDATE "CommunitySettings"
SET "registrationApprovalMode" = 'portal_registration'
WHERE "registrationApprovalMode" = 'require_approval';
