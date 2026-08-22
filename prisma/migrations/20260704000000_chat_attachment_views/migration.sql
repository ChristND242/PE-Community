-- AlterTable
ALTER TABLE "ChatAttachment" ADD COLUMN "viewOnce" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ChatAttachmentView" (
    "id" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachmentView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachmentView_attachmentId_userId_key" ON "ChatAttachmentView"("attachmentId", "userId");

-- CreateIndex
CREATE INDEX "ChatAttachmentView_conversationId_userId_idx" ON "ChatAttachmentView"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "ChatAttachmentView_userId_openedAt_idx" ON "ChatAttachmentView"("userId", "openedAt");

-- AddForeignKey
ALTER TABLE "ChatAttachmentView" ADD CONSTRAINT "ChatAttachmentView_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "ChatAttachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachmentView" ADD CONSTRAINT "ChatAttachmentView_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachmentView" ADD CONSTRAINT "ChatAttachmentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
