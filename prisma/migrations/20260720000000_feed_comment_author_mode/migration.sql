CREATE TYPE "FeedCommentAuthorMode" AS ENUM ('USER', 'COMMUNITY_TEAM');

ALTER TABLE "FeedComment"
ADD COLUMN "authorMode" "FeedCommentAuthorMode" NOT NULL DEFAULT 'USER';
