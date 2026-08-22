-- CreateTable
CREATE TABLE "ChatMessageStar" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageStar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageStar_messageId_userId_key" ON "ChatMessageStar"("messageId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessageStar_messageId_idx" ON "ChatMessageStar"("messageId");

-- CreateIndex
CREATE INDEX "ChatMessageStar_userId_idx" ON "ChatMessageStar"("userId");

-- CreateIndex
CREATE INDEX "ChatMessageStar_userId_createdAt_idx" ON "ChatMessageStar"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatMessageStar" ADD CONSTRAINT "ChatMessageStar_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageStar" ADD CONSTRAINT "ChatMessageStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
