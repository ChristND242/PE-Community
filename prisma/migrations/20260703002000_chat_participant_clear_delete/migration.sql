-- Per-participant chat management metadata.
-- These fields hide chat history/conversations for one participant only; they
-- do not delete encrypted message records globally.

ALTER TABLE "ChatConversationParticipant"
ADD COLUMN "clearedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "ChatConversationParticipant_userId_deletedAt_idx" ON "ChatConversationParticipant"("userId", "deletedAt");
