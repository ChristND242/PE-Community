ALTER TABLE "MemberProfileLink"
  ADD COLUMN "identifier" TEXT,
  ADD COLUMN "legacyUrl" TEXT,
  ALTER COLUMN "url" DROP NOT NULL,
  ALTER COLUMN "normalizedUrl" DROP NOT NULL;

-- Convert only exact, trusted host/path shapes. Values that cannot be parsed
-- confidently are retained in legacyUrl for review and are never exposed as hrefs.
UPDATE "MemberProfileLink"
SET "identifier" = CASE
  WHEN "platform" = 'LINKEDIN' AND "url" ~* '^https://(www\.)?linkedin\.com/in/[A-Za-z0-9][A-Za-z0-9-]{2,99}/?([?#].*)?$'
    THEN substring("url" from '(?i)linkedin\.com/in/([^/?#]+)')
  WHEN "platform" = 'X' AND "url" ~* '^https://(www\.)?(x|twitter)\.com/[A-Za-z0-9_]{1,15}/?([?#].*)?$'
    THEN substring("url" from '(?i)(?:x|twitter)\.com/([^/?#]+)')
  WHEN "platform" = 'FACEBOOK' AND "url" ~* '^https://(www\.)?(facebook\.com|fb\.com)/[A-Za-z0-9.]{5,50}/?([?#].*)?$'
    THEN substring("url" from '(?i)(?:facebook\.com|fb\.com)/([^/?#]+)')
  WHEN "platform" = 'INSTAGRAM' AND "url" ~* '^https://(www\.)?instagram\.com/[A-Za-z0-9._]{1,30}/?([?#].*)?$'
    THEN substring("url" from '(?i)instagram\.com/([^/?#]+)')
  WHEN "platform" = 'YOUTUBE' AND "url" ~* '^https://(www\.)?youtube\.com/@[A-Za-z0-9._-]{3,30}/?([?#].*)?$'
    THEN substring("url" from '(?i)youtube\.com/@([^/?#]+)')
  WHEN "platform" = 'YOUTUBE' AND "url" ~* '^https://(www\.)?youtube\.com/channel/UC[A-Za-z0-9_-]{22}/?([?#].*)?$'
    THEN substring("url" from '(?i)youtube\.com/channel/([^/?#]+)')
  WHEN "platform" = 'TIKTOK' AND "url" ~* '^https://(www\.)?tiktok\.com/@[A-Za-z0-9._]{2,24}/?([?#].*)?$'
    THEN substring("url" from '(?i)tiktok\.com/@([^/?#]+)')
  WHEN "platform" = 'GITHUB' AND "url" ~* '^https://(www\.)?github\.com/[A-Za-z0-9][A-Za-z0-9-]{0,38}/?([?#].*)?$'
    THEN substring("url" from '(?i)github\.com/([^/?#]+)')
  WHEN "platform" = 'GITLAB' AND "url" ~* '^https://(www\.)?gitlab\.com/[A-Za-z0-9_][A-Za-z0-9_.-]{1,254}/?([?#].*)?$'
    THEN substring("url" from '(?i)gitlab\.com/([^/?#]+)')
  WHEN "platform" = 'DISCORD' AND "url" ~* '^https://(www\.)?discord\.com/users/[0-9]{17,20}/?([?#].*)?$'
    THEN substring("url" from '(?i)discord\.com/users/([^/?#]+)')
  WHEN "platform" = 'WHATSAPP' AND "url" ~* '^https://wa\.me/[0-9]{7,15}/?([?#].*)?$'
    THEN substring("url" from '(?i)wa\.me/([^/?#]+)')
  WHEN "platform" = 'TELEGRAM' AND "url" ~* '^https://(t\.me|telegram\.me)/[A-Za-z][A-Za-z0-9_]{4,31}/?([?#].*)?$'
    THEN substring("url" from '(?i)(?:t\.me|telegram\.me)/([^/?#]+)')
  WHEN "platform" = 'MASTODON' AND "url" ~* '^https://[^/?#]+/@[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}/?([?#].*)?$'
    THEN substring("url" from '(?i)/@([^/?#]+)') || '@' || substring("url" from '(?i)^https://([^/?#]+)')
  WHEN "platform" = 'THREADS' AND "url" ~* '^https://(www\.)?threads\.net/@[A-Za-z0-9._]{1,30}/?([?#].*)?$'
    THEN substring("url" from '(?i)threads\.net/@([^/?#]+)')
  WHEN "platform" = 'BLUESKY' AND "url" ~* '^https://bsky\.app/profile/[A-Za-z0-9][A-Za-z0-9.-]{0,251}[A-Za-z0-9]/?([?#].*)?$'
    THEN substring("url" from '(?i)bsky\.app/profile/([^/?#]+)')
  ELSE NULL
END
WHERE "platform" NOT IN ('WEBSITE', 'OTHER');

UPDATE "MemberProfileLink"
SET "legacyUrl" = "url"
WHERE "platform" NOT IN ('WEBSITE', 'OTHER') AND "identifier" IS NULL;

UPDATE "MemberProfileLink"
SET "url" = NULL, "normalizedUrl" = NULL
WHERE "platform" NOT IN ('WEBSITE', 'OTHER');

ALTER TABLE "MemberProfileLink"
  ADD CONSTRAINT "MemberProfileLink_input_mode_check" CHECK (
    (
      "platform" IN ('WEBSITE', 'OTHER')
      AND "url" IS NOT NULL AND btrim("url") <> ''
      AND "normalizedUrl" IS NOT NULL AND btrim("normalizedUrl") <> ''
      AND "identifier" IS NULL
      AND "legacyUrl" IS NULL
    )
    OR
    (
      "platform" NOT IN ('WEBSITE', 'OTHER')
      AND "url" IS NULL
      AND "normalizedUrl" IS NULL
      AND (
        ("identifier" IS NOT NULL AND btrim("identifier") <> '' AND "legacyUrl" IS NULL)
        OR ("identifier" IS NULL AND "legacyUrl" IS NOT NULL AND btrim("legacyUrl") <> '')
      )
    )
  ),
  ADD CONSTRAINT "MemberProfileLink_other_label_check" CHECK (
    "platform" <> 'OTHER' OR ("label" IS NOT NULL AND btrim("label") <> '')
  );
