-- Remove superseded single-column key indexes after the composite immutable-key indexes exist.
DROP INDEX IF EXISTS "ChatDeviceKey_communityId_idx";
DROP INDEX IF EXISTS "ChatDeviceKey_userId_idx";

-- Normalize an existing PostgreSQL-truncated index name to Prisma's current schema name.
ALTER INDEX IF EXISTS "TaskBoardAutomationRuleVersion_communityId_boardId_createdAt_id"
  RENAME TO "TaskBoardAutomationRuleVersion_communityId_boardId_createdA_idx";
