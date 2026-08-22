CREATE TABLE "EventTaskTemplate" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTaskTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventTaskTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "EventTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "label" TEXT,
    "dueOffsetDays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventTaskTemplateItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventTaskTemplate_communityId_archivedAt_idx" ON "EventTaskTemplate"("communityId", "archivedAt");
CREATE INDEX "EventTaskTemplate_communityId_isActive_idx" ON "EventTaskTemplate"("communityId", "isActive");
CREATE INDEX "EventTaskTemplateItem_templateId_sortOrder_idx" ON "EventTaskTemplateItem"("templateId", "sortOrder");

ALTER TABLE "EventTaskTemplate" ADD CONSTRAINT "EventTaskTemplate_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskTemplate" ADD CONSTRAINT "EventTaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventTaskTemplateItem" ADD CONSTRAINT "EventTaskTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EventTaskTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
