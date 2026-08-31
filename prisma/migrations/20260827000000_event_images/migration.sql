-- Add optional event image metadata without changing existing event rows.
CREATE TYPE "EventImageSource" AS ENUM ('UPLOAD', 'EXTERNAL');

ALTER TABLE "Event"
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "imageSource" "EventImageSource";
