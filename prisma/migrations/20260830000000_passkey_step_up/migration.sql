-- AlterTable
ALTER TABLE "Session"
ADD COLUMN "stepUpAuthenticatedAt" TIMESTAMP(3),
ADD COLUMN "stepUpMethod" TEXT;
