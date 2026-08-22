ALTER TABLE "TaskBoardAutomationRule"
ADD COLUMN "archivedById" TEXT,
ADD COLUMN "archiveReason" TEXT,
ADD COLUMN "createdFromPresetId" TEXT,
ADD COLUMN "createdFromPresetRuleId" TEXT;

CREATE INDEX "TaskBoardAutomationRule_communityId_boardId_archivedAt_idx"
ON "TaskBoardAutomationRule"("communityId", "boardId", "archivedAt");

CREATE INDEX "TaskBoardAutomationRule_createdFromPresetId_idx"
ON "TaskBoardAutomationRule"("createdFromPresetId");

ALTER TABLE "TaskBoardAutomationRule"
ADD CONSTRAINT "TaskBoardAutomationRule_archivedById_fkey"
FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskBoardAutomationRule"
ADD CONSTRAINT "TaskBoardAutomationRule_createdFromPresetId_fkey"
FOREIGN KEY ("createdFromPresetId") REFERENCES "TaskBoardAutomationPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskBoardAutomationRule"
ADD CONSTRAINT "TaskBoardAutomationRule_createdFromPresetRuleId_fkey"
FOREIGN KEY ("createdFromPresetRuleId") REFERENCES "TaskBoardAutomationPresetRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
