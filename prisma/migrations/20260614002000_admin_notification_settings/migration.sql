ALTER TABLE "CommunitySettings"
ADD COLUMN "adminInAppAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailDeliveryIssueAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "registrationReviewAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "passportExpirationAdminAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "reminderRunSummaryAlertsEnabled" BOOLEAN NOT NULL DEFAULT false;
