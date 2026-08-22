CREATE TYPE "TaskBoardAutomationRuleChangeType" AS ENUM ('CREATED', 'UPDATED', 'ROLLED_BACK');

ALTER TABLE "TaskBoardAutomationRule"
ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "TaskBoardAutomationRuleVersion" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "type" "TaskBoardAutomationRuleType" NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "name" TEXT,
  "config" JSONB NOT NULL,
  "changeType" "TaskBoardAutomationRuleChangeType" NOT NULL,
  "changeSummary" TEXT,
  "changedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskBoardAutomationRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaskBoardAutomationRuleVersion_ruleId_version_key"
ON "TaskBoardAutomationRuleVersion"("ruleId", "version");

CREATE INDEX "TaskBoardAutomationRuleVersion_communityId_boardId_createdAt_idx"
ON "TaskBoardAutomationRuleVersion"("communityId", "boardId", "createdAt");

CREATE INDEX "TaskBoardAutomationRuleVersion_communityId_ruleId_createdAt_idx"
ON "TaskBoardAutomationRuleVersion"("communityId", "ruleId", "createdAt");

ALTER TABLE "TaskBoardAutomationRuleVersion"
ADD CONSTRAINT "TaskBoardAutomationRuleVersion_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskBoardAutomationRuleVersion"
ADD CONSTRAINT "TaskBoardAutomationRuleVersion_boardId_fkey"
FOREIGN KEY ("boardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskBoardAutomationRuleVersion"
ADD CONSTRAINT "TaskBoardAutomationRuleVersion_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "TaskBoardAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskBoardAutomationRuleVersion"
ADD CONSTRAINT "TaskBoardAutomationRuleVersion_changedById_fkey"
FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "TaskBoardAutomationRuleVersion" (
  "id", "communityId", "boardId", "ruleId", "version", "type", "enabled", "name", "config", "changeType", "changeSummary", "changedById", "createdAt"
)
SELECT
  'automation-version-' || "id",
  "communityId",
  "boardId",
  "id",
  1,
  "type",
  "enabled",
  "name",
  "config" - 'layout',
  'CREATED'::"TaskBoardAutomationRuleChangeType",
  'RULE_CREATED',
  "createdById",
  "createdAt"
FROM "TaskBoardAutomationRule";
