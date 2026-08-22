CREATE TYPE "NotificationTemplateKey" AS ENUM (
  'TASK_BOARD_AUTOMATION_DUE_BEFORE',
  'TASK_BOARD_AUTOMATION_OVERDUE',
  'TASK_BOARD_AUTOMATION_TEST',
  'TASK_BOARD_AUTOMATION_AUTO_COMPLETE',
  'TASK_BOARD_AUTOMATION_FLAG_UNASSIGNED'
);

CREATE TABLE "NotificationTemplate" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "key" "NotificationTemplateKey" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "channelScope" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "subjectEn" TEXT,
  "subjectFr" TEXT,
  "inAppTitleEn" TEXT NOT NULL,
  "inAppTitleFr" TEXT NOT NULL,
  "inAppBodyEn" TEXT NOT NULL,
  "inAppBodyFr" TEXT NOT NULL,
  "emailTitleEn" TEXT,
  "emailTitleFr" TEXT,
  "emailBodyEn" TEXT,
  "emailBodyFr" TEXT,
  "buttonLabelEn" TEXT,
  "buttonLabelFr" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedById" TEXT,

  CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationTemplate_communityId_key_key" ON "NotificationTemplate"("communityId", "key");
CREATE INDEX "NotificationTemplate_communityId_enabled_idx" ON "NotificationTemplate"("communityId", "enabled");

ALTER TABLE "NotificationTemplate"
  ADD CONSTRAINT "NotificationTemplate_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NotificationTemplate"
  ADD CONSTRAINT "NotificationTemplate_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
