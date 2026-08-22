CREATE TYPE "AnnouncementAuthorMode" AS ENUM ('USER', 'COMMUNITY_TEAM');

ALTER TABLE "Announcement"
ADD COLUMN "authorMode" "AnnouncementAuthorMode" NOT NULL DEFAULT 'USER';
