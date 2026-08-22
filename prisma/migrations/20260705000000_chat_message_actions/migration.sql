-- Add participant-scoped message hiding and sender-scoped delete-for-everyone metadata.
ALTER TABLE "ChatMessage"
  ADD COLUMN "deletedForEveryoneAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

CREATE TABLE "ChatMessageHidden" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatMessageHidden_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageHidden_messageId_userId_key" ON "ChatMessageHidden"("messageId", "userId");
CREATE INDEX "ChatMessageHidden_conversationId_userId_idx" ON "ChatMessageHidden"("conversationId", "userId");
CREATE INDEX "ChatMessageHidden_userId_hiddenAt_idx" ON "ChatMessageHidden"("userId", "hiddenAt");
CREATE INDEX "ChatMessage_deletedById_idx" ON "ChatMessage"("deletedById");

ALTER TABLE "ChatMessage"
  ADD CONSTRAINT "ChatMessage_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessageHidden"
  ADD CONSTRAINT "ChatMessageHidden_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatMessageHidden"
  ADD CONSTRAINT "ChatMessageHidden_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatMessageHidden"
  ADD CONSTRAINT "ChatMessageHidden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
