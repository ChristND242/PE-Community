-- Add sender-scoped encrypted message edit metadata.
ALTER TABLE "ChatMessage"
  ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE INDEX "ChatMessage_editedAt_idx" ON "ChatMessage"("editedAt");
