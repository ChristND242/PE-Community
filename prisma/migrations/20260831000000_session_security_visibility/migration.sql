-- AlterTable
ALTER TABLE "Session"
ADD COLUMN "authenticationMethod" TEXT,
ADD COLUMN "createdIp" TEXT,
ADD COLUMN "createdCountryCode" TEXT,
ADD COLUMN "createdCountryName" TEXT,
ADD COLUMN "lastSeenIp" TEXT,
ADD COLUMN "lastSeenCountryCode" TEXT,
ADD COLUMN "lastSeenCountryName" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "browser" TEXT,
ADD COLUMN "operatingSystem" TEXT;

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'SUCCESS',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT NOT NULL,
    "countryCode" TEXT,
    "countryName" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "operatingSystem" TEXT NOT NULL,
    "authenticationMethod" TEXT,
    "sessionId" TEXT,
    "metadata" JSONB,
    "dedupeKey" TEXT,
    "emailQueuedAt" TIMESTAMP(3),

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityEvent_dedupeKey_key" ON "SecurityEvent"("dedupeKey");
CREATE INDEX "SecurityEvent_userId_occurredAt_idx" ON "SecurityEvent"("userId", "occurredAt");
CREATE INDEX "SecurityEvent_communityId_occurredAt_idx" ON "SecurityEvent"("communityId", "occurredAt");
CREATE INDEX "SecurityEvent_userId_eventType_occurredAt_idx" ON "SecurityEvent"("userId", "eventType", "occurredAt");

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
