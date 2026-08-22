CREATE TYPE "ProfileLinkPlatform" AS ENUM ('WEBSITE', 'LINKEDIN', 'X', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'TIKTOK', 'GITHUB', 'GITLAB', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'MASTODON', 'THREADS', 'BLUESKY', 'OTHER');

CREATE TYPE "ProfileLinkVisibility" AS ENUM ('PUBLIC', 'MEMBERS', 'PRIVATE');

CREATE TABLE "MemberProfileLink" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "platform" "ProfileLinkPlatform" NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "visibility" "ProfileLinkVisibility" NOT NULL DEFAULT 'PUBLIC',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberProfileLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberProfileLink_membershipId_normalizedUrl_key" ON "MemberProfileLink"("membershipId", "normalizedUrl");
CREATE INDEX "MemberProfileLink_membershipId_position_idx" ON "MemberProfileLink"("membershipId", "position");
CREATE INDEX "MemberProfileLink_membershipId_platform_idx" ON "MemberProfileLink"("membershipId", "platform");

-- WEBSITE and OTHER intentionally remain multi-instance. Every other platform is
-- single-instance per membership and is enforced transactionally and in PostgreSQL.
CREATE UNIQUE INDEX "MemberProfileLink_single_platform_key"
ON "MemberProfileLink"("membershipId", "platform")
WHERE "platform" NOT IN ('WEBSITE', 'OTHER');

ALTER TABLE "MemberProfileLink" ADD CONSTRAINT "MemberProfileLink_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the legacy JSON column for rollback compatibility while idempotently
-- copying its three historical fields into the normalized collection.
WITH legacy AS (
  SELECT
    mp."membershipId",
    value."platform"::"ProfileLinkPlatform" AS "platform",
    btrim(value."url") AS "url",
    row_number() OVER (PARTITION BY mp."membershipId" ORDER BY value."position") - 1 AS "position"
  FROM "MemberProfile" mp
  CROSS JOIN LATERAL (
    VALUES
      ('WEBSITE', mp."socialLinks" ->> 'website', 0),
      ('LINKEDIN', mp."socialLinks" ->> 'linkedin', 1),
      ('X', mp."socialLinks" ->> 'twitter', 2),
      ('WHATSAPP', mp."socialLinks" ->> 'whatsapp', 3)
  ) AS value("platform", "url", "position")
  WHERE value."url" IS NOT NULL AND btrim(value."url") <> ''
)
INSERT INTO "MemberProfileLink" (
  "id", "membershipId", "platform", "url", "normalizedUrl", "visibility", "position", "createdAt", "updatedAt"
)
SELECT
  concat('legacy_', md5(legacy."membershipId" || ':' || legacy."platform"::text)),
  legacy."membershipId",
  legacy."platform",
  legacy."url",
  lower(legacy."url"),
  'PUBLIC'::"ProfileLinkVisibility",
  legacy."position",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM legacy
ON CONFLICT DO NOTHING;
