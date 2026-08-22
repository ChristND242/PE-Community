ALTER TABLE "FeedComment" ADD COLUMN "parentId" TEXT;

CREATE TABLE "FeedCommentLike" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FeedCommentLike_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedComment_parentId_idx" ON "FeedComment"("parentId");
CREATE UNIQUE INDEX "FeedCommentLike_commentId_userId_key" ON "FeedCommentLike"("commentId", "userId");
CREATE INDEX "FeedCommentLike_communityId_idx" ON "FeedCommentLike"("communityId");
CREATE INDEX "FeedCommentLike_commentId_idx" ON "FeedCommentLike"("commentId");
CREATE INDEX "FeedCommentLike_userId_idx" ON "FeedCommentLike"("userId");

ALTER TABLE "FeedComment"
ADD CONSTRAINT "FeedComment_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedCommentLike"
ADD CONSTRAINT "FeedCommentLike_communityId_fkey"
FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedCommentLike"
ADD CONSTRAINT "FeedCommentLike_commentId_fkey"
FOREIGN KEY ("commentId") REFERENCES "FeedComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedCommentLike"
ADD CONSTRAINT "FeedCommentLike_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
