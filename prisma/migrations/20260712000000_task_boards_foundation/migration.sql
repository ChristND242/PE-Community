-- CreateEnum
CREATE TYPE "TaskBoardVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateTable
CREATE TABLE "TaskBoard" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "TaskBoardVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskBoard_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "EventTask" ADD COLUMN "taskBoardId" TEXT;

-- Backfill one event-linked board for each event that already has active or archived tasks.
INSERT INTO "TaskBoard" ("id", "communityId", "eventId", "name", "visibility", "createdById", "createdAt", "updatedAt")
SELECT
    'event_board_' || md5(event."id"),
    event."communityId",
    event."id",
    event."title",
    'PUBLIC'::"TaskBoardVisibility",
    creator."createdById",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Event" event
JOIN LATERAL (
    SELECT task."createdById"
    FROM "EventTask" task
    WHERE task."eventId" = event."id" AND task."communityId" = event."communityId"
    ORDER BY task."createdAt" ASC, task."id" ASC
    LIMIT 1
) creator ON TRUE
WHERE EXISTS (
    SELECT 1 FROM "EventTask" task
    WHERE task."eventId" = event."id" AND task."communityId" = event."communityId"
);

UPDATE "EventTask" task
SET "taskBoardId" = board."id"
FROM "TaskBoard" board
WHERE board."eventId" = task."eventId" AND board."communityId" = task."communityId";

-- CreateIndex
CREATE UNIQUE INDEX "TaskBoard_eventId_key" ON "TaskBoard"("eventId");
CREATE INDEX "TaskBoard_communityId_archivedAt_idx" ON "TaskBoard"("communityId", "archivedAt");
CREATE INDEX "TaskBoard_communityId_visibility_idx" ON "TaskBoard"("communityId", "visibility");
CREATE INDEX "EventTask_communityId_taskBoardId_idx" ON "EventTask"("communityId", "taskBoardId");

-- AddForeignKey
ALTER TABLE "TaskBoard" ADD CONSTRAINT "TaskBoard_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskBoard" ADD CONSTRAINT "TaskBoard_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaskBoard" ADD CONSTRAINT "TaskBoard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTask" ADD CONSTRAINT "EventTask_taskBoardId_fkey" FOREIGN KEY ("taskBoardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
