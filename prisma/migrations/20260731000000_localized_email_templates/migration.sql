-- Preserve every legacy template while assigning its community's authoritative locale.
ALTER TABLE "CommunityMessageTemplate"
  ADD COLUMN "locale" TEXT,
  ADD COLUMN "previewText" TEXT,
  ADD COLUMN "heading" TEXT,
  ADD COLUMN "greeting" TEXT,
  ADD COLUMN "buttonLabel" TEXT,
  ADD COLUMN "fallbackLinkInstructions" TEXT,
  ADD COLUMN "expirationNotice" TEXT,
  ADD COLUMN "securityNotice" TEXT,
  ADD COLUMN "footerExplanation" TEXT,
  ADD COLUMN "defaultContent" JSONB,
  ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

UPDATE "CommunityMessageTemplate" template
SET
  "locale" = CASE WHEN settings."defaultLanguage" = 'fr' THEN 'fr' ELSE 'en' END,
  "heading" = template."subject",
  "defaultContent" = jsonb_build_object(
    'subject', template."subject",
    'heading', template."subject",
    'body', template."defaultBody"
  ),
  "needsReview" = true
FROM "CommunitySettings" settings
WHERE settings."communityId" = template."communityId";

UPDATE "CommunityMessageTemplate"
SET
  "locale" = COALESCE("locale", 'en'),
  "heading" = COALESCE(NULLIF(BTRIM("heading"), ''), "subject"),
  "defaultContent" = COALESCE(
    "defaultContent",
    jsonb_build_object('subject', "subject", 'heading', "subject", 'body', "defaultBody")
  );

ALTER TABLE "CommunityMessageTemplate"
  ALTER COLUMN "locale" SET NOT NULL,
  ALTER COLUMN "locale" SET DEFAULT 'en',
  ALTER COLUMN "heading" SET NOT NULL;

ALTER TABLE "CommunityMessageTemplate"
  ADD CONSTRAINT "CommunityMessageTemplate_locale_check"
  CHECK ("locale" IN ('en', 'fr'));

DROP INDEX "CommunityMessageTemplate_communityId_key_key";

CREATE UNIQUE INDEX "CommunityMessageTemplate_communityId_key_locale_key"
  ON "CommunityMessageTemplate"("communityId", "key", "locale");

CREATE INDEX "CommunityMessageTemplate_communityId_key_idx"
  ON "CommunityMessageTemplate"("communityId", "key");
