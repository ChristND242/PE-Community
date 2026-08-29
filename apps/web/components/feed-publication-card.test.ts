import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cardUrl = new URL('./feed-publication-card.tsx', import.meta.url);
const feedViewUrl = new URL('./community-feed-view.tsx', import.meta.url);
const memberFeedPageUrl = new URL('../app/dashboard/feed/page.tsx', import.meta.url);
const adminAnnouncementsPageUrl = new URL('../app/admin/announcements/page.tsx', import.meta.url);

test('feed card preserves publication content, engagement, read state, cover fallback, and semantic surfaces', async () => {
  const source = await readFile(cardUrl, 'utf8');
  for (const token of ['item.title', 'item.body', 'item.publishedAt', 'item.likeCount', 'item.commentCount', 'item.readReceipt']) {
    assert.match(source, new RegExp(token.replace('.', '\\.')));
  }
  assert.match(source, /item\.coverUrl && !coverFailed/);
  assert.match(source, /onError=\{\(\) => setCoverFailed\(true\)\}/);
  assert.match(source, /var\(--app-card\)/);
  assert.match(source, /var\(--app-muted-foreground\)/);
  assert.doesNotMatch(source, /Follow|Repost|share count/i);
});

test('verified badges depend on server-returned verification classification', async () => {
  const source = await readFile(cardUrl, 'utf8');
  assert.match(source, /identityVerificationForPublisher\(item\.publisher\?\.verification\)/);
  assert.match(source, /<IdentityVerificationBadge kind=\{verificationKind\} size="md" \/>/);
  assert.doesNotMatch(source, /<BadgeCheck/);
});

test('shared feed view composes the card without changing like, comments, reply, or read handlers', async () => {
  const source = await readFile(feedViewUrl, 'utf8');
  assert.match(source, /<FeedPublicationCard/);
  for (const handler of ['toggleLike', 'openComments', 'postComment', 'postReply', 'markRead']) {
    assert.match(source, new RegExp(`function ${handler}`));
  }
});

test('member Feed and admin View share one participant feed implementation', async () => {
  const memberSource = await readFile(memberFeedPageUrl, 'utf8');
  const adminSource = await readFile(adminAnnouncementsPageUrl, 'utf8');
  assert.match(memberSource, /<CommunityFeedView\s*\/>/);
  assert.match(adminSource, /<CommunityFeedView active=\{selectedMode === 'view'\} showHeader=\{false\} \/>/);
});

test('admin announcement modes default safely to Create and preserve mounted Create state', async () => {
  const source = await readFile(adminAnnouncementsPageUrl, 'utf8');
  assert.match(source, /return value === 'view' \? 'view' : 'create'/);
  assert.match(source, /searchParams\.get\('mode'\)/);
  assert.match(source, /router\.replace\(`\/admin\/announcements\?\$\{nextSearchParams\.toString\(\)\}`/);
  assert.match(source, /role="tabpanel"[^>]+hidden=\{selectedMode !== 'create'\} className="space-y-6">/);
  assert.match(source, /role="tabpanel"[^>]+hidden=\{selectedMode !== 'view'\}>/);
  assert.doesNotMatch(source, /selectedMode === 'create'\s*\?/);
});

test('inactive admin View does not fetch the participant feed', async () => {
  const source = await readFile(feedViewUrl, 'utf8');
  assert.match(source, /if \(active\) void load\(\)/);
});

test('admin mode switch uses bilingual labels and accessible keyboard tab semantics', async () => {
  const source = await readFile(adminAnnouncementsPageUrl, 'utf8');
  assert.match(source, /t\.admin\.eventsCreateMode/);
  assert.match(source, /t\.admin\.eventsViewMode/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=\{active\}/);
  assert.match(source, /event\.key === 'ArrowRight'/);
  assert.match(source, /event\.key === 'ArrowLeft'/);
});
