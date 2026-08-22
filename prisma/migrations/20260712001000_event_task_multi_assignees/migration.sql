-- CreateTable
CREATE TABLE "EventTaskAssignee" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTaskAssignee_pkey" PRIMARY KEY ("id")
);

-- Backfill the existing primary assignee without removing the compatibility field.
INSERT INTO "EventTaskAssignee" ("id", "communityId", "taskId", "userId", "assignedById", "assignedAt", "createdAt", "updatedAt")
SELECT
    'task_assignee_' || md5(task."id" || ':' || task."assigneeId"),
    task."communityId",
    task."id",
    task."assigneeId",
    task."createdById",
    task."createdAt",
    task."createdAt",
    task."updatedAt"
FROM "EventTask" task
WHERE task."assigneeId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EventTaskAssignee_taskId_userId_key" ON "EventTaskAssignee"("taskId", "userId");
CREATE INDEX "EventTaskAssignee_communityId_userId_idx" ON "EventTaskAssignee"("communityId", "userId");
CREATE INDEX "EventTaskAssignee_communityId_taskId_idx" ON "EventTaskAssignee"("communityId", "taskId");

-- AddForeignKey
ALTER TABLE "EventTaskAssignee" ADD CONSTRAINT "EventTaskAssignee_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskAssignee" ADD CONSTRAINT "EventTaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EventTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskAssignee" ADD CONSTRAINT "EventTaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskAssignee" ADD CONSTRAINT "EventTaskAssignee_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
