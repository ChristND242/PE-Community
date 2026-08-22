ALTER TABLE "TaskBoardAutomationRule"
ADD COLUMN "draftName" TEXT,
ADD COLUMN "draftEnabled" BOOLEAN,
ADD COLUMN "draftConfig" JSONB,
ADD COLUMN "draftUpdatedAt" TIMESTAMP(3),
ADD COLUMN "draftUpdatedById" TEXT;

CREATE INDEX "TaskBoardAutomationRule_communityId_draftUpdatedAt_idx"
ON "TaskBoardAutomationRule"("communityId", "draftUpdatedAt");

ALTER TABLE "TaskBoardAutomationRule"
ADD CONSTRAINT "TaskBoardAutomationRule_draftUpdatedById_fkey"
FOREIGN KEY ("draftUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
