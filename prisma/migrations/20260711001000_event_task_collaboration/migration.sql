-- CreateEnum
CREATE TYPE "EventTaskActivityType" AS ENUM ('CREATED', 'ASSIGNED', 'REASSIGNED', 'UNASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'DUE_DATE_CHANGED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED', 'LABEL_CHANGED', 'COMMENT_ADDED', 'COMMENT_ARCHIVED', 'ARCHIVED', 'REORDERED');

-- CreateTable
CREATE TABLE "EventTaskActivity" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "EventTaskActivityType" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventTaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTaskComment" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventTaskActivity_communityId_eventId_taskId_createdAt_idx" ON "EventTaskActivity"("communityId", "eventId", "taskId", "createdAt");
CREATE INDEX "EventTaskActivity_communityId_actorId_idx" ON "EventTaskActivity"("communityId", "actorId");
CREATE INDEX "EventTaskComment_communityId_eventId_taskId_createdAt_idx" ON "EventTaskComment"("communityId", "eventId", "taskId", "createdAt");
CREATE INDEX "EventTaskComment_communityId_authorId_idx" ON "EventTaskComment"("communityId", "authorId");

-- AddForeignKey
ALTER TABLE "EventTaskActivity" ADD CONSTRAINT "EventTaskActivity_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskActivity" ADD CONSTRAINT "EventTaskActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskActivity" ADD CONSTRAINT "EventTaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EventTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskActivity" ADD CONSTRAINT "EventTaskActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EventTaskComment" ADD CONSTRAINT "EventTaskComment_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskComment" ADD CONSTRAINT "EventTaskComment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskComment" ADD CONSTRAINT "EventTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "EventTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskComment" ADD CONSTRAINT "EventTaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
