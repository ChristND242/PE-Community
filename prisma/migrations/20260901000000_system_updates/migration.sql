-- CreateEnum
CREATE TYPE "SystemUpdateCheckStatus" AS ENUM ('UP_TO_DATE', 'UPDATE_AVAILABLE', 'CHECK_FAILED', 'MANUAL_REQUIRED');

-- CreateEnum
CREATE TYPE "SystemUpdateRunStatus" AS ENUM ('PENDING', 'PREFLIGHT', 'BACKUP', 'PULLING', 'VERIFYING', 'MIGRATING', 'DEPLOYING', 'HEALTHCHECK', 'ROLLING_BACK', 'COMPLETED', 'FAILED', 'MANUAL_INTERVENTION_REQUIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SystemUpdateCheck" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "initiatedByUserId" TEXT,
    "installedVersion" TEXT NOT NULL,
    "latestVersion" TEXT,
    "status" "SystemUpdateCheckStatus" NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessfulCheckedAt" TIMESTAMP(3),
    "releaseUrl" TEXT,
    "releasePublishedAt" TIMESTAMP(3),
    "releaseNotes" TEXT,
    "releaseMetadataSnapshot" JSONB,
    "errorCategory" TEXT,
    CONSTRAINT "SystemUpdateCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemUpdateRun" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "initiatedByUserId" TEXT,
    "initiatorRole" TEXT NOT NULL,
    "sourceIp" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "installedVersion" TEXT NOT NULL,
    "targetVersion" TEXT NOT NULL,
    "status" "SystemUpdateRunStatus" NOT NULL DEFAULT 'PENDING',
    "phase" "SystemUpdateRunStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureSummary" TEXT,
    "rollbackStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "releaseMetadataSnapshot" JSONB,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SystemUpdateRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemUpdateLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "level" TEXT NOT NULL,
    "phase" "SystemUpdateRunStatus" NOT NULL,
    "eventCode" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    CONSTRAINT "SystemUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemUpdateCheck_communityId_checkedAt_idx" ON "SystemUpdateCheck"("communityId", "checkedAt");
CREATE INDEX "SystemUpdateCheck_communityId_status_checkedAt_idx" ON "SystemUpdateCheck"("communityId", "status", "checkedAt");
CREATE UNIQUE INDEX "SystemUpdateRun_idempotencyKey_key" ON "SystemUpdateRun"("idempotencyKey");
CREATE INDEX "SystemUpdateRun_communityId_createdAt_idx" ON "SystemUpdateRun"("communityId", "createdAt");
CREATE INDEX "SystemUpdateRun_communityId_status_createdAt_idx" ON "SystemUpdateRun"("communityId", "status", "createdAt");
CREATE UNIQUE INDEX "SystemUpdateLog_runId_sequence_key" ON "SystemUpdateLog"("runId", "sequence");
CREATE INDEX "SystemUpdateLog_runId_timestamp_idx" ON "SystemUpdateLog"("runId", "timestamp");

-- AddForeignKey
ALTER TABLE "SystemUpdateCheck" ADD CONSTRAINT "SystemUpdateCheck_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SystemUpdateCheck" ADD CONSTRAINT "SystemUpdateCheck_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SystemUpdateRun" ADD CONSTRAINT "SystemUpdateRun_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SystemUpdateRun" ADD CONSTRAINT "SystemUpdateRun_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SystemUpdateLog" ADD CONSTRAINT "SystemUpdateLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SystemUpdateRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed deployment-wide updater permissions for the protected Owner role only.
INSERT INTO "Permission" ("id", "key", "label") VALUES
  ('perm_system_update_view', 'systemUpdate.view', 'View system updates'),
  ('perm_system_update_check', 'systemUpdate.check', 'Check for system updates'),
  ('perm_system_update_execute', 'systemUpdate.execute', 'Install system updates'),
  ('perm_system_update_history', 'systemUpdate.history', 'View system update history')
ON CONFLICT ("key") DO UPDATE SET "label" = EXCLUDED."label";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."key" = 'owner'
  AND permission."key" IN ('systemUpdate.view', 'systemUpdate.check', 'systemUpdate.execute', 'systemUpdate.history')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
