-- CreateTable
CREATE TABLE "UserLoginStreakEvent" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "loginDate" TIMESTAMP(3) NOT NULL,
    "previousCurrentStreak" INTEGER NOT NULL DEFAULT 0,
    "newCurrentStreak" INTEGER NOT NULL DEFAULT 0,
    "previousLongestStreak" INTEGER NOT NULL DEFAULT 0,
    "newLongestStreak" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserLoginStreakEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserLoginStreakEvent_communityId_createdAt_idx" ON "UserLoginStreakEvent"("communityId", "createdAt");

-- CreateIndex
CREATE INDEX "UserLoginStreakEvent_communityId_userId_idx" ON "UserLoginStreakEvent"("communityId", "userId");

-- CreateIndex
CREATE INDEX "UserLoginStreakEvent_communityId_type_idx" ON "UserLoginStreakEvent"("communityId", "type");

-- CreateIndex
CREATE INDEX "UserLoginStreakEvent_communityId_loginDate_idx" ON "UserLoginStreakEvent"("communityId", "loginDate");

-- AddForeignKey
ALTER TABLE "UserLoginStreakEvent" ADD CONSTRAINT "UserLoginStreakEvent_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLoginStreakEvent" ADD CONSTRAINT "UserLoginStreakEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
