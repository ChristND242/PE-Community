CREATE TABLE "FeedLike" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedLike_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedComment" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedLike_announcementId_userId_key" ON "FeedLike"("announcementId", "userId");
CREATE INDEX "FeedLike_communityId_idx" ON "FeedLike"("communityId");
CREATE INDEX "FeedLike_announcementId_idx" ON "FeedLike"("announcementId");
CREATE INDEX "FeedLike_userId_idx" ON "FeedLike"("userId");
CREATE INDEX "FeedComment_communityId_idx" ON "FeedComment"("communityId");
CREATE INDEX "FeedComment_announcementId_createdAt_idx" ON "FeedComment"("announcementId", "createdAt");
CREATE INDEX "FeedComment_userId_idx" ON "FeedComment"("userId");

ALTER TABLE "FeedLike"
ADD CONSTRAINT "FeedLike_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedLike"
ADD CONSTRAINT "FeedLike_announcementId_fkey"
FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedLike"
ADD CONSTRAINT "FeedLike_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedComment"
ADD CONSTRAINT "FeedComment_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedComment"
ADD CONSTRAINT "FeedComment_announcementId_fkey"
FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedComment"
ADD CONSTRAINT "FeedComment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
