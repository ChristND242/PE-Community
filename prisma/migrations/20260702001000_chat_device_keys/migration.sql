-- CreateTable
CREATE TABLE "ChatDeviceKey" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rotatedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "ChatDeviceKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatDeviceKey_userId_communityId_key" ON "ChatDeviceKey"("userId", "communityId");

-- CreateIndex
CREATE INDEX "ChatDeviceKey_userId_idx" ON "ChatDeviceKey"("userId");

-- CreateIndex
CREATE INDEX "ChatDeviceKey_communityId_idx" ON "ChatDeviceKey"("communityId");

-- AddForeignKey
ALTER TABLE "ChatDeviceKey" ADD CONSTRAINT "ChatDeviceKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDeviceKey" ADD CONSTRAINT "ChatDeviceKey_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
