-- Encrypted direct-chat attachment blobs.
-- The backend stores encrypted blob metadata only. Plaintext filenames, MIME
-- types, extracted text, thumbnails, and private keys are intentionally absent.

CREATE TABLE "ChatAttachment" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "encryptedSize" INTEGER NOT NULL,
  "encryptionNonce" TEXT NOT NULL,
  "encryptionAlgorithmVersion" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatAttachment_storageKey_key" ON "ChatAttachment"("storageKey");

CREATE INDEX "ChatAttachment_conversationId_createdAt_idx" ON "ChatAttachment"("conversationId", "createdAt");

CREATE INDEX "ChatAttachment_senderId_idx" ON "ChatAttachment"("senderId");

ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
