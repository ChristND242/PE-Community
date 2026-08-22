CREATE TABLE "CommunityMessageTemplate" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "defaultBody" TEXT NOT NULL,
    "variablesJson" JSONB NOT NULL,
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityMessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityMessageTemplate_communityId_key_key" ON "CommunityMessageTemplate"("communityId", "key");

ALTER TABLE "CommunityMessageTemplate" ADD CONSTRAINT "CommunityMessageTemplate_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
