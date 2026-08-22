-- CreateTable
CREATE TABLE "UserLoginStreak" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastLoginDate" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLoginStreak_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLoginStreak_communityId_userId_key" ON "UserLoginStreak"("communityId", "userId");

-- CreateIndex
CREATE INDEX "UserLoginStreak_communityId_currentStreak_idx" ON "UserLoginStreak"("communityId", "currentStreak");

-- CreateIndex
CREATE INDEX "UserLoginStreak_communityId_longestStreak_idx" ON "UserLoginStreak"("communityId", "longestStreak");

-- CreateIndex
CREATE INDEX "UserLoginStreak_communityId_lastLoginAt_idx" ON "UserLoginStreak"("communityId", "lastLoginAt");

-- AddForeignKey
ALTER TABLE "UserLoginStreak" ADD CONSTRAINT "UserLoginStreak_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLoginStreak" ADD CONSTRAINT "UserLoginStreak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
