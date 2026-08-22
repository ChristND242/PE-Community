CREATE TABLE "CommunityInviteLink" (
  "id" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "maxUses" INTEGER,
  "useCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "CommunityInviteLink_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RegistrationApplication"
  ADD COLUMN "inviteLinkId" TEXT;

CREATE UNIQUE INDEX "CommunityInviteLink_tokenHash_key" ON "CommunityInviteLink"("tokenHash");
CREATE INDEX "CommunityInviteLink_communityId_revokedAt_expiresAt_idx" ON "CommunityInviteLink"("communityId", "revokedAt", "expiresAt");

ALTER TABLE "CommunityInviteLink" ADD CONSTRAINT "CommunityInviteLink_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunityInviteLink" ADD CONSTRAINT "CommunityInviteLink_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RegistrationApplication" ADD CONSTRAINT "RegistrationApplication_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "CommunityInviteLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
