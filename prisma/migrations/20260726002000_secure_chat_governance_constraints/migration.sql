ALTER TABLE "CommunitySettings"
  ADD CONSTRAINT "CommunitySettings_maxActiveChatDevices_check"
    CHECK ("maxActiveChatDevices" BETWEEN 1 AND 8),
  ADD CONSTRAINT "CommunitySettings_chatMediaWarningPercent_check"
    CHECK ("chatMediaWarningPercent" BETWEEN 1 AND 100),
  ADD CONSTRAINT "CommunitySettings_chatAttachmentMaxBytes_check"
    CHECK ("chatAttachmentMaxBytes" BETWEEN 1 AND 10485760),
  ADD CONSTRAINT "CommunitySettings_chatMediaQuotaBytes_check"
    CHECK ("chatMediaQuotaBytes" IS NULL OR "chatMediaQuotaBytes" > 0);

ALTER TABLE "ChatAttachment"
  ADD CONSTRAINT "ChatAttachment_encryptedSize_check" CHECK ("encryptedSize" > 0),
  ADD CONSTRAINT "ChatAttachment_deletionAttempts_check" CHECK ("deletionAttempts" >= 0);

ALTER TABLE "ChatMediaDeletionOperation"
  ADD CONSTRAINT "ChatMediaDeletionOperation_attempts_check" CHECK ("attempts" >= 0);
