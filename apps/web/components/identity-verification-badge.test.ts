import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { identityVerificationForPublisher, identityVerificationForRole } from '../lib/identity-verification';

const componentUrl = new URL('./identity-verification-badge.tsx', import.meta.url);
const chatUrl = new URL('./chat-workspace.tsx', import.meta.url);
const feedCardUrl = new URL('./feed-publication-card.tsx', import.meta.url);
const feedViewUrl = new URL('./community-feed-view.tsx', import.meta.url);
const taskCollaborationUrl = new URL('./event-task-collaboration.tsx', import.meta.url);
const memberListUrl = new URL('../app/dashboard/members/page.tsx', import.meta.url);
const memberDetailUrl = new URL('../app/dashboard/members/[id]/page.tsx', import.meta.url);
const adminMemberListUrl = new URL('../app/admin/members/page.tsx', import.meta.url);
const adminMemberDetailUrl = new URL('../app/admin/members/[id]/page.tsx', import.meta.url);
const adminAnnouncementUrl = new URL('../app/admin/announcements/[id]/page.tsx', import.meta.url);

test('authoritative roles and publisher classifications map to distinct verification kinds', () => {
  assert.equal(identityVerificationForRole('owner'), 'owner');
  assert.equal(identityVerificationForRole('ADMIN'), 'administrator');
  assert.equal(identityVerificationForRole('administrator'), 'administrator');
  assert.equal(identityVerificationForRole('member'), null);
  assert.equal(identityVerificationForPublisher('OWNER'), 'owner');
  assert.equal(identityVerificationForPublisher('ADMINISTRATOR'), 'administrator');
  assert.equal(identityVerificationForPublisher('OFFICIAL_COMMUNITY'), 'official-community');
  assert.equal(identityVerificationForPublisher(null), null);
});

test('one shared component centralizes sizes, colors, accessibility, and bilingual labels', async () => {
  const source = await readFile(componentUrl, 'utf8');
  assert.match(source, /export type IdentityVerificationBadgeSize = 'xs' \| 'sm' \| 'md'/);
  assert.match(source, /administrator: 'fill-sky-500 text-white dark:fill-sky-400'/);
  assert.match(source, /owner: 'fill-amber-400 text-amber-950 dark:fill-amber-300 dark:text-amber-950'/);
  assert.match(source, /t\.dashboard\.administratorPublisher/);
  assert.match(source, /t\.status\.owner/);
  assert.match(source, /t\.dashboard\.officialCommunityPublication/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /<TooltipContent>\{label\}<\/TooltipContent>/);
});

test('member list and detail surfaces share role-derived verification without replacing role data', async () => {
  const sources = await Promise.all([
    readFile(memberListUrl, 'utf8'),
    readFile(memberDetailUrl, 'utf8'),
    readFile(adminMemberListUrl, 'utf8'),
    readFile(adminMemberDetailUrl, 'utf8'),
  ]);
  for (const source of sources) {
    assert.match(source, /IdentityVerificationBadge/);
    assert.match(source, /identityVerificationForRole\(member\.role\.key\)/);
  }
  assert.match(sources[2], /userRoleLabel\(t, member\.role\.key\)/);
  assert.match(sources[3], /member\.role\.key/);
});

test('publication, comment, reply, and task discussion identities use the shared component', async () => {
  const [card, feed, announcement, task] = await Promise.all([
    readFile(feedCardUrl, 'utf8'),
    readFile(feedViewUrl, 'utf8'),
    readFile(adminAnnouncementUrl, 'utf8'),
    readFile(taskCollaborationUrl, 'utf8'),
  ]);
  assert.match(card, /identityVerificationForPublisher\(item\.publisher\?\.verification\)/);
  assert.equal((feed.match(/IdentityVerificationBadge/g) ?? []).length, 3);
  assert.match(feed, /comment\.author\.verification/);
  assert.match(feed, /reply\.author\.verification/);
  assert.match(announcement, /comment\.author\.verification/);
  assert.match(announcement, /reply\.author\.verification/);
  assert.match(task, /identityVerificationForRole\(comment\.author\.role\)/);
  assert.match(task, /identityVerificationForRole\(item\.actor\.role\)/);
});

test('chat identity matrix is covered while the individual message stream remains badge-free', async () => {
  const source = await readFile(chatUrl, 'utf8');
  for (const expected of [
    /identityVerificationForRole\(recipient\?\.role\)/,
    /identityVerificationForRole\(selectedRecipient\.role\)/,
    /identityVerificationForRole\(participant\.role\)/,
    /identityVerificationForRole\(participant\.workspaceRole\)/,
  ]) assert.match(source, expected);
  assert.match(source, /workspaceRole\?: string \| null/);

  const streamStart = source.indexOf('{messageRenderItems.map((item) => {');
  const streamEnd = source.indexOf('{composerSendBlocked && blockedComposerMessage', streamStart);
  assert.notEqual(streamStart, -1);
  assert.notEqual(streamEnd, -1);
  assert.doesNotMatch(source.slice(streamStart, streamEnd), /IdentityVerificationBadge/);
});

test('conversation rows keep names truncatable beside unread and metadata controls', async () => {
  const source = await readFile(chatUrl, 'utf8');
  assert.match(source, /flex min-w-0 items-center gap-1\.5 text-sm font-semibold/);
  assert.match(source, /<span className="truncate">\{label\}<\/span>/);
  assert.match(source, /shrink-0 items-center justify-center/);
});
