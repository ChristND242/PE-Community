CREATE TYPE "ChatDeviceType" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN');

ALTER TABLE "ChatDevice"
  ADD COLUMN "generatedLabel" TEXT,
  ADD COLUMN "customDisplayName" TEXT,
  ADD COLUMN "deviceType" "ChatDeviceType" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "operatingSystemName" TEXT,
  ADD COLUMN "operatingSystemVersion" TEXT,
  ADD COLUMN "browserName" TEXT,
  ADD COLUMN "browserVersion" TEXT;

-- Existing compatibility rows intentionally remain UNKNOWN. Browser metadata is
-- descriptive and may only be supplied by a browser bound to the device identifier.
CREATE INDEX "ChatDevice_communityId_status_lastSeenAt_createdAt_idx"
  ON "ChatDevice"("communityId", "status", "lastSeenAt", "createdAt");
CREATE INDEX "ChatDevice_communityId_deviceType_lastSeenAt_idx"
  ON "ChatDevice"("communityId", "deviceType", "lastSeenAt");
CREATE INDEX "ChatDevice_communityId_operatingSystemName_lastSeenAt_idx"
  ON "ChatDevice"("communityId", "operatingSystemName", "lastSeenAt");
CREATE INDEX "ChatDevice_communityId_browserName_lastSeenAt_idx"
  ON "ChatDevice"("communityId", "browserName", "lastSeenAt");

DROP INDEX "ChatAttachment_communityId_mediaCategory_idx";
CREATE INDEX "ChatAttachment_communityId_lifecycleStatus_encryptedSize_createdAt_idx"
  ON "ChatAttachment"("communityId", "lifecycleStatus", "encryptedSize", "createdAt");
CREATE INDEX "ChatAttachment_communityId_mediaCategory_createdAt_idx"
  ON "ChatAttachment"("communityId", "mediaCategory", "createdAt");
CREATE INDEX "ChatAttachment_communityId_senderId_createdAt_idx"
  ON "ChatAttachment"("communityId", "senderId", "createdAt");
