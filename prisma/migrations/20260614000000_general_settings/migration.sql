ALTER TABLE "CommunitySettings"
  ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "registrationApprovalMode" TEXT NOT NULL DEFAULT 'require_approval',
  ADD COLUMN "memberDirectoryVisibility" TEXT NOT NULL DEFAULT 'members_only',
  ADD COLUMN "supportContactEmail" TEXT;
