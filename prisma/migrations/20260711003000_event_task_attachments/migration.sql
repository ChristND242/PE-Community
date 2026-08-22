ALTER TYPE "EventTaskActivityType" ADD VALUE 'ATTACHMENT_ADDED';
ALTER TYPE "EventTaskActivityType" ADD VALUE 'ATTACHMENT_ARCHIVED';

CREATE TABLE "EventTaskAttachment" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTaskAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventTaskAttachment_communityId_eventId_taskId_createdAt_idx" ON "EventTaskAttachment"("communityId", "eventId", "taskId", "createdAt");
CREATE INDEX "EventTaskAttachment_communityId_uploaderId_idx" ON "EventTaskAttachment"("communityId", "uploaderId");
CREATE INDEX "EventTaskAttachment_storageKey_idx" ON "EventTaskAttachment"("storageKey");

ALTER TABLE "EventTaskAttachment" ADD CONSTRAINT "EventTaskAttachment_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskAttachment" ADD CONSTRAINT "EventTaskAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskAttachment" ADD CONSTRAINT "EventTaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EventTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskAttachment" ADD CONSTRAINT "EventTaskAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
