-- Additive secure-chat infrastructure. Existing key IDs and ciphertext remain unchanged.
CREATE TYPE "ChatDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "ChatKeyStatus" AS ENUM ('ACTIVE', 'RETIRED', 'REVOKED');
CREATE TYPE "ChatMediaCategory" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER');
CREATE TYPE "ChatAttachmentLifecycle" AS ENUM ('ACTIVE', 'PENDING_DELETION', 'DELETING', 'DELETED', 'DELETE_FAILED');
CREATE TYPE "ChatMediaDeletionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "CommunitySettings"
  ADD COLUMN "maxActiveChatDevices" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "chatMediaQuotaBytes" BIGINT,
  ADD COLUMN "chatMediaWarningPercent" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "chatAttachmentMaxBytes" INTEGER NOT NULL DEFAULT 10485760;

ALTER TABLE "ChatDeviceKey"
  ADD COLUMN "fingerprint" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "status" "ChatKeyStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "retiredAt" TIMESTAMP(3);

UPDATE "ChatDeviceKey"
SET "activatedAt" = "createdAt",
    "status" = CASE WHEN "revokedAt" IS NULL THEN 'ACTIVE'::"ChatKeyStatus" ELSE 'REVOKED'::"ChatKeyStatus" END;

DROP INDEX "ChatDeviceKey_userId_communityId_key";
CREATE UNIQUE INDEX "ChatDeviceKey_userId_communityId_version_key" ON "ChatDeviceKey"("userId", "communityId", "version");
CREATE UNIQUE INDEX "ChatDeviceKey_userId_communityId_fingerprint_key" ON "ChatDeviceKey"("userId", "communityId", "fingerprint");
CREATE INDEX "ChatDeviceKey_userId_communityId_status_idx" ON "ChatDeviceKey"("userId", "communityId", "status");
CREATE INDEX "ChatDeviceKey_communityId_status_createdAt_idx" ON "ChatDeviceKey"("communityId", "status", "createdAt");
CREATE INDEX "ChatDeviceKey_fingerprint_idx" ON "ChatDeviceKey"("fingerprint");

CREATE TABLE "ChatDevice" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "deviceIdentifier" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "ChatDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  CONSTRAINT "ChatDevice_pkey" PRIMARY KEY ("id")
);

-- One compatibility device retains each pre-migration account key without changing that key.
INSERT INTO "ChatDevice" (
  "id", "communityId", "userId", "keyId", "deviceIdentifier", "displayName",
  "status", "createdAt", "lastSeenAt", "revokedAt"
)
SELECT
  'legacy-' || "id", "communityId", "userId", "id", 'legacy-' || "id", 'Migrated browser',
  CASE WHEN "revokedAt" IS NULL THEN 'ACTIVE'::"ChatDeviceStatus" ELSE 'REVOKED'::"ChatDeviceStatus" END,
  "createdAt", COALESCE("rotatedAt", "createdAt"), "revokedAt"
FROM "ChatDeviceKey";

CREATE UNIQUE INDEX "ChatDevice_communityId_userId_deviceIdentifier_key" ON "ChatDevice"("communityId", "userId", "deviceIdentifier");
CREATE INDEX "ChatDevice_communityId_userId_status_idx" ON "ChatDevice"("communityId", "userId", "status");
CREATE INDEX "ChatDevice_communityId_status_createdAt_idx" ON "ChatDevice"("communityId", "status", "createdAt");
CREATE INDEX "ChatDevice_userId_status_idx" ON "ChatDevice"("userId", "status");
CREATE INDEX "ChatDevice_keyId_idx" ON "ChatDevice"("keyId");
ALTER TABLE "ChatDevice" ADD CONSTRAINT "ChatDevice_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatDevice" ADD CONSTRAINT "ChatDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatDevice" ADD CONSTRAINT "ChatDevice_keyId_fkey" FOREIGN KEY ("keyId") REFERENCES "ChatDeviceKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatDevice" ADD CONSTRAINT "ChatDevice_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessage"
  ADD COLUMN "senderKeyVersionId" TEXT,
  ADD COLUMN "recipientKeyVersionId" TEXT;

-- Direct-message legacy references already identify the recipient key. Sender keys can be
-- deterministically linked to the retained account key. Group recipient references remain
-- inside the version-1 encrypted envelope and are handled by the compatibility read path.
UPDATE "ChatMessage" AS message
SET "senderKeyVersionId" = key."id"
FROM "ChatConversation" AS conversation, "ChatDeviceKey" AS key
WHERE conversation."id" = message."conversationId"
  AND key."communityId" = conversation."communityId"
  AND key."userId" = message."senderId";

UPDATE "ChatMessage" AS message
SET "recipientKeyVersionId" = key."id"
FROM "ChatDeviceKey" AS key
WHERE message."encryptionKeyVersion" = key."id";

CREATE INDEX "ChatMessage_senderKeyVersionId_idx" ON "ChatMessage"("senderKeyVersionId");
CREATE INDEX "ChatMessage_recipientKeyVersionId_idx" ON "ChatMessage"("recipientKeyVersionId");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderKeyVersionId_fkey" FOREIGN KEY ("senderKeyVersionId") REFERENCES "ChatDeviceKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_recipientKeyVersionId_fkey" FOREIGN KEY ("recipientKeyVersionId") REFERENCES "ChatDeviceKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatAttachment"
  ADD COLUMN "communityId" TEXT,
  ADD COLUMN "mediaCategory" "ChatMediaCategory" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "lifecycleStatus" "ChatAttachmentLifecycle" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "retentionExpiresAt" TIMESTAMP(3),
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionCompletedAt" TIMESTAMP(3),
  ADD COLUMN "deletionError" TEXT,
  ADD COLUMN "deletionAttempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "ChatAttachment" AS attachment
SET "communityId" = conversation."communityId"
FROM "ChatConversation" AS conversation
WHERE conversation."id" = attachment."conversationId";

ALTER TABLE "ChatAttachment" ALTER COLUMN "communityId" SET NOT NULL;
CREATE INDEX "ChatAttachment_communityId_lifecycleStatus_createdAt_idx" ON "ChatAttachment"("communityId", "lifecycleStatus", "createdAt");
CREATE INDEX "ChatAttachment_communityId_mediaCategory_idx" ON "ChatAttachment"("communityId", "mediaCategory");
CREATE INDEX "ChatAttachment_retentionExpiresAt_lifecycleStatus_idx" ON "ChatAttachment"("retentionExpiresAt", "lifecycleStatus");
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommunityChatStorageUsage" (
  "communityId" TEXT NOT NULL,
  "totalBytes" BIGINT NOT NULL DEFAULT 0,
  "imageBytes" BIGINT NOT NULL DEFAULT 0,
  "videoBytes" BIGINT NOT NULL DEFAULT 0,
  "audioBytes" BIGINT NOT NULL DEFAULT 0,
  "documentBytes" BIGINT NOT NULL DEFAULT 0,
  "otherBytes" BIGINT NOT NULL DEFAULT 0,
  "attachmentCount" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityChatStorageUsage_pkey" PRIMARY KEY ("communityId")
);

INSERT INTO "CommunityChatStorageUsage" (
  "communityId", "totalBytes", "otherBytes", "attachmentCount", "updatedAt"
)
SELECT
  community."id",
  COALESCE(SUM(attachment."encryptedSize") FILTER (WHERE attachment."deletedAt" IS NULL), 0),
  COALESCE(SUM(attachment."encryptedSize") FILTER (WHERE attachment."deletedAt" IS NULL), 0),
  COUNT(attachment."id") FILTER (WHERE attachment."deletedAt" IS NULL),
  CURRENT_TIMESTAMP
FROM "Community" AS community
LEFT JOIN "ChatAttachment" AS attachment ON attachment."communityId" = community."id"
GROUP BY community."id";

ALTER TABLE "CommunityChatStorageUsage" ADD CONSTRAINT "CommunityChatStorageUsage_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ChatMediaDeletionOperation" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "attachmentId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reason" TEXT,
  "status" "ChatMediaDeletionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "idempotencyKey" TEXT NOT NULL,
  "errorCode" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatMediaDeletionOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMediaDeletionOperation_idempotencyKey_key" ON "ChatMediaDeletionOperation"("idempotencyKey");
CREATE INDEX "ChatMediaDeletionOperation_communityId_status_requestedAt_idx" ON "ChatMediaDeletionOperation"("communityId", "status", "requestedAt");
CREATE INDEX "ChatMediaDeletionOperation_attachmentId_status_idx" ON "ChatMediaDeletionOperation"("attachmentId", "status");
ALTER TABLE "ChatMediaDeletionOperation" ADD CONSTRAINT "ChatMediaDeletionOperation_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMediaDeletionOperation" ADD CONSTRAINT "ChatMediaDeletionOperation_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ChatAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMediaDeletionOperation" ADD CONSTRAINT "ChatMediaDeletionOperation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "label") VALUES
  ('chat-perm-devices-view', 'chat.devices.view', 'View community chat devices'),
  ('chat-perm-devices-revoke', 'chat.devices.revoke', 'Revoke community chat devices'),
  ('chat-perm-device-limit-manage', 'chat.deviceLimit.manage', 'Manage chat device limit'),
  ('chat-perm-storage-view', 'chat.storage.view', 'View chat media storage'),
  ('chat-perm-storage-manage', 'chat.storage.manage', 'Manage chat media storage'),
  ('chat-perm-media-delete', 'chat.media.delete', 'Delete encrypted chat media')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
JOIN "Permission" AS permission ON permission."key" IN (
  'chat.devices.view', 'chat.devices.revoke', 'chat.deviceLimit.manage',
  'chat.storage.view', 'chat.storage.manage', 'chat.media.delete'
)
WHERE role."key" = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
JOIN "Permission" AS permission ON permission."key" IN (
  'chat.devices.view', 'chat.devices.revoke', 'chat.storage.view'
)
WHERE role."key" = 'admin'
ON CONFLICT DO NOTHING;
