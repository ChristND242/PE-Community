-- AuditLog remains append-only. These indexes support community-scoped review,
-- filtering, and stable reverse-chronological pagination.
CREATE INDEX "AuditLog_communityId_createdAt_idx"
ON "AuditLog"("communityId", "createdAt");

CREATE INDEX "AuditLog_communityId_action_createdAt_idx"
ON "AuditLog"("communityId", "action", "createdAt");

CREATE INDEX "AuditLog_communityId_actorUserId_createdAt_idx"
ON "AuditLog"("communityId", "actorUserId", "createdAt");

CREATE INDEX "AuditLog_communityId_targetType_targetId_idx"
ON "AuditLog"("communityId", "targetType", "targetId");
