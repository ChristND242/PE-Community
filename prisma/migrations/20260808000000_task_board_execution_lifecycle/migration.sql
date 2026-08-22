-- Add a reversible operational lifecycle without changing existing archival history.
CREATE TYPE "TaskBoardStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

ALTER TABLE "TaskBoard"
ADD COLUMN "status" "TaskBoardStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "TaskBoard_communityId_status_archivedAt_idx"
ON "TaskBoard"("communityId", "status", "archivedAt");
