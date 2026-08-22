-- Add the group conversation foundation without changing existing direct chats.
ALTER TYPE "ChatConversationType" ADD VALUE IF NOT EXISTS 'GROUP';

ALTER TABLE "ChatConversation"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
