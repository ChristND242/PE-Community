CREATE TYPE "TaskBoardAutomationRunStatus" AS ENUM ('SUCCESS', 'SKIPPED', 'FAILED');
CREATE TYPE "TaskBoardAutomationRunMode" AS ENUM ('LIVE', 'DRY_RUN');
ALTER TABLE "TaskBoardAutomationRule" ADD COLUMN "lastRunStatus" "TaskBoardAutomationRunStatus", ADD COLUMN "lastRunSummary" TEXT;
CREATE TABLE "TaskBoardAutomationRun" (
  "id" TEXT NOT NULL, "communityId" TEXT NOT NULL, "boardId" TEXT NOT NULL, "ruleId" TEXT NOT NULL, "taskId" TEXT,
  "status" "TaskBoardAutomationRunStatus" NOT NULL, "mode" "TaskBoardAutomationRunMode" NOT NULL DEFAULT 'LIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3), "summary" TEXT, "details" JSONB,
  "errorCode" TEXT, "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskBoardAutomationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskBoardAutomationRun_communityId_boardId_createdAt_idx" ON "TaskBoardAutomationRun"("communityId", "boardId", "createdAt");
CREATE INDEX "TaskBoardAutomationRun_communityId_ruleId_createdAt_idx" ON "TaskBoardAutomationRun"("communityId", "ruleId", "createdAt");
CREATE INDEX "TaskBoardAutomationRun_communityId_status_idx" ON "TaskBoardAutomationRun"("communityId", "status");
CREATE INDEX "TaskBoardAutomationRun_communityId_mode_idx" ON "TaskBoardAutomationRun"("communityId", "mode");
ALTER TABLE "TaskBoardAutomationRun" ADD CONSTRAINT "TaskBoardAutomationRun_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskBoardAutomationRun" ADD CONSTRAINT "TaskBoardAutomationRun_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskBoardAutomationRun" ADD CONSTRAINT "TaskBoardAutomationRun_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "TaskBoardAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskBoardAutomationRun" ADD CONSTRAINT "TaskBoardAutomationRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EventTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
