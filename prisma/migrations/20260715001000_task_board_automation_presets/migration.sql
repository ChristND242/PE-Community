CREATE TABLE "TaskBoardAutomationPreset" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TaskBoardAutomationPreset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TaskBoardAutomationPresetRule" (
  "id" TEXT NOT NULL,
  "presetId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "type" "TaskBoardAutomationRuleType" NOT NULL,
  "name" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskBoardAutomationPresetRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskBoardAutomationPreset_communityId_archivedAt_idx"
ON "TaskBoardAutomationPreset"("communityId", "archivedAt");

CREATE INDEX "TaskBoardAutomationPreset_communityId_updatedAt_idx"
ON "TaskBoardAutomationPreset"("communityId", "updatedAt");

CREATE INDEX "TaskBoardAutomationPresetRule_presetId_position_idx"
ON "TaskBoardAutomationPresetRule"("presetId", "position");

CREATE INDEX "TaskBoardAutomationPresetRule_presetId_type_idx"
ON "TaskBoardAutomationPresetRule"("presetId", "type");

ALTER TABLE "TaskBoardAutomationPreset"
ADD CONSTRAINT "TaskBoardAutomationPreset_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskBoardAutomationPreset"
ADD CONSTRAINT "TaskBoardAutomationPreset_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskBoardAutomationPreset"
ADD CONSTRAINT "TaskBoardAutomationPreset_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskBoardAutomationPresetRule"
ADD CONSTRAINT "TaskBoardAutomationPresetRule_presetId_fkey"
FOREIGN KEY ("presetId") REFERENCES "TaskBoardAutomationPreset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
