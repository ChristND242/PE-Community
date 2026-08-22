CREATE TYPE "TaskBoardAutomationRuleType" AS ENUM ('DUE_BEFORE', 'OVERDUE', 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', 'FLAG_UNASSIGNED');

CREATE TABLE "TaskBoardAutomationRule" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "type" "TaskBoardAutomationRuleType" NOT NULL,
  "name" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaskBoardAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskBoardAutomationRule_communityId_boardId_idx" ON "TaskBoardAutomationRule"("communityId", "boardId");
CREATE INDEX "TaskBoardAutomationRule_communityId_type_idx" ON "TaskBoardAutomationRule"("communityId", "type");
CREATE INDEX "TaskBoardAutomationRule_communityId_enabled_idx" ON "TaskBoardAutomationRule"("communityId", "enabled");

ALTER TABLE "TaskBoardAutomationRule" ADD CONSTRAINT "TaskBoardAutomationRule_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskBoardAutomationRule" ADD CONSTRAINT "TaskBoardAutomationRule_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskBoardAutomationRule" ADD CONSTRAINT "TaskBoardAutomationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
