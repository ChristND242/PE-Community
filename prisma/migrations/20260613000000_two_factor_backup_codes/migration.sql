-- CreateTable
CREATE TABLE "UserTwoFactorBackupCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTwoFactorBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTwoFactorBackupCode_codeHash_key" ON "UserTwoFactorBackupCode"("codeHash");

-- CreateIndex
CREATE INDEX "UserTwoFactorBackupCode_userId_usedAt_idx" ON "UserTwoFactorBackupCode"("userId", "usedAt");

-- AddForeignKey
ALTER TABLE "UserTwoFactorBackupCode" ADD CONSTRAINT "UserTwoFactorBackupCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
