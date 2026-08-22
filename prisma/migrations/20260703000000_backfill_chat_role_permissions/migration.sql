-- Backfill chat permissions for roles that existed before secure chat was added.
-- This is additive only: it creates missing Permission rows and missing
-- RolePermission links for the current default role model.

INSERT INTO "Permission" ("id", "key", "label")
VALUES
  ('permission-chat-view', 'chat.view', 'View chat'),
  ('permission-chat-direct-create', 'chat.direct.create', 'Create direct chat conversations'),
  ('permission-chat-direct-send', 'chat.direct.send', 'Send direct chat messages'),
  ('permission-chat-presence-view', 'chat.presence.view', 'View chat presence')
ON CONFLICT ("key") DO UPDATE
SET "label" = EXCLUDED."label";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."key" IN (
  'chat.view',
  'chat.direct.create',
  'chat.direct.send',
  'chat.presence.view'
)
WHERE role."key" IN ('owner', 'admin', 'member')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
