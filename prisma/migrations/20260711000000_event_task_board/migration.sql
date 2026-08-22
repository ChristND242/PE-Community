-- CreateEnum
CREATE TYPE "EventTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "EventTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "EventTask" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "EventTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "EventTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "label" TEXT,
    "dueDate" TIMESTAMP(3),
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventTask_communityId_eventId_idx" ON "EventTask"("communityId", "eventId");

-- CreateIndex
CREATE INDEX "EventTask_communityId_assigneeId_idx" ON "EventTask"("communityId", "assigneeId");

-- CreateIndex
CREATE INDEX "EventTask_communityId_status_idx" ON "EventTask"("communityId", "status");

-- CreateIndex
CREATE INDEX "EventTask_eventId_status_sortOrder_idx" ON "EventTask"("eventId", "status", "sortOrder");

-- AddForeignKey
ALTER TABLE "EventTask" ADD CONSTRAINT "EventTask_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTask" ADD CONSTRAINT "EventTask_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTask" ADD CONSTRAINT "EventTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTask" ADD CONSTRAINT "EventTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
