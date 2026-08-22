-- SMTP/email foundation, forgot password, and passport expiration reminders.

ALTER TABLE "MemberProfile"
ADD COLUMN "passportExpiresAt" TIMESTAMP(3);

ALTER TABLE "NotificationPreference"
ADD COLUMN "passportExpirationRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "CommunityReminderSettings"
ADD COLUMN "passportRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "passportNotifyMember" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "passportNotifyAdmins" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "passportEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "passportFirstReminderDaysBefore" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN "passportSecondReminderDaysBefore" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "passportFinalReminderDaysBefore" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "passportDayOfReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "passportReminderTemplate" TEXT NOT NULL DEFAULT 'Your passport is scheduled to expire on {{expirationDate}}. Please review your document details and renew it before the expiration date.',
ADD COLUMN "passportDayOfTemplate" TEXT NOT NULL DEFAULT 'Your passport expires today. Please review your document details.';

CREATE TABLE "CommunityEmailSettings" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "smtpHost" TEXT,
  "smtpPort" INTEGER,
  "smtpUsername" TEXT,
  "smtpPasswordEncrypted" TEXT,
  "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
  "fromEmail" TEXT,
  "fromName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommunityEmailSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailCampaign" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "textBody" TEXT NOT NULL,
  "htmlBody" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "createdById" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "recipientId" TEXT,
  "status" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "errorMessage" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityEmailSettings_communityId_key" ON "CommunityEmailSettings"("communityId");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
CREATE INDEX "EmailCampaign_communityId_createdAt_idx" ON "EmailCampaign"("communityId", "createdAt");
CREATE INDEX "EmailRecipient_campaignId_status_idx" ON "EmailRecipient"("campaignId", "status");
CREATE INDEX "EmailDeliveryAttempt_campaignId_attemptedAt_idx" ON "EmailDeliveryAttempt"("campaignId", "attemptedAt");
CREATE INDEX "EmailDeliveryAttempt_recipientId_idx" ON "EmailDeliveryAttempt"("recipientId");

ALTER TABLE "CommunityEmailSettings" ADD CONSTRAINT "CommunityEmailSettings_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailRecipient" ADD CONSTRAINT "EmailRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailDeliveryAttempt" ADD CONSTRAINT "EmailDeliveryAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EmailDeliveryAttempt" ADD CONSTRAINT "EmailDeliveryAttempt_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "EmailRecipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
