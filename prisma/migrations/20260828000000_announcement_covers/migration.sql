CREATE TYPE "PublicationCoverSource" AS ENUM ('UPLOAD', 'EXTERNAL');

ALTER TABLE "Announcement"
ADD COLUMN "coverUrl" TEXT,
ADD COLUMN "coverSource" "PublicationCoverSource";
