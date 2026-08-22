-- Persist lightweight chat last-seen metadata.
-- Online state remains in memory; lastSeenAt is stored so refreshes do not
-- regress known participants from "Last seen" back to "Offline".

CREATE TABLE "ChatPresence" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "communityId" TEXT NOT NULL,
  "lastSeenAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChatPresence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatPresence_userId_communityId_key" ON "ChatPresence"("userId", "communityId");

CREATE INDEX "ChatPresence_communityId_idx" ON "ChatPresence"("communityId");

ALTER TABLE "ChatPresence" ADD CONSTRAINT "ChatPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatPresence" ADD CONSTRAINT "ChatPresence_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
