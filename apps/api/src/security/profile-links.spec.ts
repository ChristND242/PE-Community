import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  PROFILE_LINK_IDENTIFIER_MAX_LENGTH,
  PROFILE_LINK_LABEL_MAX_LENGTH,
  PROFILE_LINK_LIMIT,
  PROFILE_LINK_URL_MAX_LENGTH,
  profileLinkResponse,
  validateProfileLink,
} from '../profile-links/profile-links.service';

function errorCode(action: () => unknown) {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof BadRequestException);
    return (error.getResponse() as { code: string }).code;
  }
  assert.fail('Expected profile-link validation to fail.');
}

test('known social platforms accept canonical identifiers and derive controlled destinations', () => {
  const linkedin = validateProfileLink({ platform: 'LINKEDIN', identifier: 'community-demo', visibility: 'MEMBERS' });
  assert.equal(linkedin.identifier, 'community-demo');
  assert.equal(linkedin.url, null);
  assert.equal(linkedin.normalizedUrl, null);
  assert.equal(linkedin.hostname, 'www.linkedin.com');

  const x = validateProfileLink({ platform: 'X', identifier: ' @communitydemo ' });
  assert.equal(x.identifier, 'communitydemo');
  assert.equal(errorCode(() => validateProfileLink({ platform: 'LINKEDIN', identifier: 'https://www.linkedin.com/in/community-demo' })), 'PROFILE_LINK_IDENTIFIER_INVALID');
  assert.equal(errorCode(() => validateProfileLink({ platform: 'LINKEDIN', identifier: 'community demo' })), 'PROFILE_LINK_IDENTIFIER_INVALID');
  assert.equal(errorCode(() => validateProfileLink({ platform: 'LINKEDIN', url: 'https://www.linkedin.com/in/community-demo' })), 'PROFILE_LINK_URL_NOT_ALLOWED');
});

test('Website and Other retain strict HTTPS URL input and reject identifier mode', () => {
  const website = validateProfileLink({ platform: 'WEBSITE', url: ' https://Example.com/profile#private ', visibility: 'PUBLIC' });
  assert.equal(website.url, 'https://example.com/profile');
  assert.equal(website.identifier, null);
  assert.equal(errorCode(() => validateProfileLink({ platform: 'WEBSITE', identifier: 'example' })), 'PROFILE_LINK_IDENTIFIER_NOT_ALLOWED');
  assert.equal(errorCode(() => validateProfileLink({ platform: 'OTHER', url: 'https://example.com' })), 'PROFILE_LINK_UNAVAILABLE');
  assert.equal(validateProfileLink({ platform: 'OTHER', label: 'Engineering blog', url: 'https://example.com' }).label, 'Engineering blog');
  for (const url of ['http://example.com', 'javascript:alert(1)', 'data:text/plain,test', 'file:///tmp/test', 'ftp://example.com', 'https://user:password@example.com']) {
    assert.equal(errorCode(() => validateProfileLink({ platform: 'WEBSITE', url })), 'PROFILE_LINK_URL_INVALID');
  }
});

test('response DTO derives href server-side and keeps unreliable destinations non-clickable', () => {
  const base = { id: 'link-1', label: null, visibility: 'PUBLIC' as const, position: 0, createdAt: new Date('2026-08-01T00:00:00Z'), updatedAt: new Date('2026-08-01T00:00:00Z'), legacyUrl: null };
  const linkedin = profileLinkResponse({ ...base, platform: 'LINKEDIN', identifier: 'community-demo', url: null });
  assert.equal(linkedin?.href, 'https://www.linkedin.com/in/community-demo');
  assert.equal(linkedin?.displayValue, 'community-demo');
  assert.equal(linkedin?.url, null);
  const discord = profileLinkResponse({ ...base, platform: 'DISCORD', identifier: 'communitydemo', url: null });
  assert.equal(discord?.href, null);
  const legacy = profileLinkResponse({ ...base, platform: 'LINKEDIN', identifier: null, url: null, legacyUrl: 'https://untrusted.example/member' });
  assert.equal(legacy?.href, null);
  assert.equal(legacy?.displayValue, '');
});

test('distributed and non-standard platform policies remain explicit', () => {
  const mastodon = validateProfileLink({ platform: 'MASTODON', identifier: '@communitydemo@social.example' });
  assert.equal(mastodon.identifier, 'communitydemo@social.example');
  assert.equal(mastodon.hostname, 'social.example');
  const whatsapp = validateProfileLink({ platform: 'WHATSAPP', identifier: '+1 (555) 123-4567' });
  assert.equal(whatsapp.identifier, '15551234567');
  const youtube = validateProfileLink({ platform: 'YOUTUBE', identifier: '@communitydemo' });
  assert.equal(youtube.identifier, 'communitydemo');
  assert.equal(PROFILE_LINK_LIMIT, 15);
  assert.equal(PROFILE_LINK_URL_MAX_LENGTH, 2048);
  assert.equal(PROFILE_LINK_IDENTIFIER_MAX_LENGTH, 255);
  assert.equal(PROFILE_LINK_LABEL_MAX_LENGTH, 50);
});

test('profile-link routes and forward migration retain ownership and compatibility boundaries', async () => {
  const [me, admin, initialMigration, correctiveMigration, communities, service] = await Promise.all([
    readFile(new URL('../auth/me.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../admin/admin.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../../prisma/migrations/20260801000000_member_profile_links/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../../../prisma/migrations/20260801001000_profile_link_identifiers/migration.sql', import.meta.url), 'utf8'),
    readFile(new URL('../communities/communities.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../profile-links/profile-links.service.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(me, /me\/profile\/links/);
  assert.match(me, /profileLinks\.(createOwn|updateOwn|deleteOwn|reorderOwn)/);
  assert.match(admin, /members\/:memberId\/profile-links/);
  assert.match(admin, /PERMISSIONS\.membersUpdate/);
  assert.match(initialMigration, /ON CONFLICT DO NOTHING/);
  assert.match(correctiveMigration, /ADD COLUMN "identifier" TEXT/);
  assert.match(correctiveMigration, /"legacyUrl" = "url"/);
  assert.match(correctiveMigration, /MemberProfileLink_input_mode_check/);
  assert.match(correctiveMigration, /"url" IS NULL/);
  assert.doesNotMatch(communities.slice(communities.indexOf('const publicProfileSelect')), /socialLinks: true/);
  assert.match(service, /safeProfileLinkResponses/);
  assert.match(service, /profileUrl: \(value\)/);
});
