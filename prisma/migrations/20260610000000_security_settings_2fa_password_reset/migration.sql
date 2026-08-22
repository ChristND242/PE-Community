-- AlterTable
ALTER TABLE "User"
ADD COLUMN "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "twoFactorSecret" TEXT,
ADD COLUMN "twoFactorConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CommunitySettings" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunitySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunitySettings_communityId_key" ON "CommunitySettings"("communityId");

-- AddForeignKey
ALTER TABLE "CommunitySettings" ADD CONSTRAINT "CommunitySettings_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
