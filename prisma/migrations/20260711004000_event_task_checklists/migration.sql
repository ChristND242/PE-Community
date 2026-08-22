-- AlterEnum
ALTER TYPE "EventTaskActivityType" ADD VALUE 'CHECKLIST_ITEM_ADDED';
ALTER TYPE "EventTaskActivityType" ADD VALUE 'CHECKLIST_ITEM_UPDATED';
ALTER TYPE "EventTaskActivityType" ADD VALUE 'CHECKLIST_ITEM_COMPLETED';
ALTER TYPE "EventTaskActivityType" ADD VALUE 'CHECKLIST_ITEM_REOPENED';
ALTER TYPE "EventTaskActivityType" ADD VALUE 'CHECKLIST_ITEM_ARCHIVED';
ALTER TYPE "EventTaskActivityType" ADD VALUE 'CHECKLIST_REORDERED';

-- CreateTable
CREATE TABLE "EventTaskChecklistItem" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTaskChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventTaskChecklistItem_communityId_eventId_taskId_sortOrder_idx" ON "EventTaskChecklistItem"("communityId", "eventId", "taskId", "sortOrder");
CREATE INDEX "EventTaskChecklistItem_communityId_createdById_idx" ON "EventTaskChecklistItem"("communityId", "createdById");
CREATE INDEX "EventTaskChecklistItem_communityId_completedById_idx" ON "EventTaskChecklistItem"("communityId", "completedById");

-- AddForeignKey
ALTER TABLE "EventTaskChecklistItem" ADD CONSTRAINT "EventTaskChecklistItem_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskChecklistItem" ADD CONSTRAINT "EventTaskChecklistItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskChecklistItem" ADD CONSTRAINT "EventTaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EventTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskChecklistItem" ADD CONSTRAINT "EventTaskChecklistItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskChecklistItem" ADD CONSTRAINT "EventTaskChecklistItem_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
