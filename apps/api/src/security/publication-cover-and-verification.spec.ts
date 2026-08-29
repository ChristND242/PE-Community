import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { AnnouncementAuthorMode, FeedCommentAuthorMode } from '@prisma/client';
import { feedPublisherVerification } from '../communities/communities.service';
import { normalizePublicationCoverUrl, publicationCoverMutation } from '../publication-covers';
import type { PublicationCoverUploadFile } from '../uploads';

function uploadedImage(buffer: number[], mimetype: string): PublicationCoverUploadFile {
  return { buffer: Buffer.from(buffer), mimetype, size: buffer.length, originalname: 'cover.bin' };
}

test('feed publisher verification is derived from authoritative author mode and role', () => {
  assert.equal(feedPublisherVerification(AnnouncementAuthorMode.COMMUNITY_TEAM, null), 'OFFICIAL_COMMUNITY');
  assert.equal(feedPublisherVerification(AnnouncementAuthorMode.COMMUNITY_TEAM, 'owner'), 'OFFICIAL_COMMUNITY');
  assert.equal(feedPublisherVerification(AnnouncementAuthorMode.USER, 'owner'), 'OWNER');
  assert.equal(feedPublisherVerification(AnnouncementAuthorMode.USER, 'ADMIN'), 'ADMINISTRATOR');
  assert.equal(feedPublisherVerification(AnnouncementAuthorMode.USER, 'member'), null);
  assert.equal(feedPublisherVerification(AnnouncementAuthorMode.USER, null), null);
  assert.equal(feedPublisherVerification(FeedCommentAuthorMode.COMMUNITY_TEAM, 'owner'), 'OFFICIAL_COMMUNITY');
  assert.equal(feedPublisherVerification(FeedCommentAuthorMode.USER, 'owner'), 'OWNER');
  assert.equal(feedPublisherVerification(FeedCommentAuthorMode.USER, 'admin'), 'ADMINISTRATOR');
  assert.equal(feedPublisherVerification(FeedCommentAuthorMode.USER, 'member'), null);
});

test('comment, group participant, and task collaboration payloads project authoritative workspace roles in their existing queries', async () => {
  const [communities, chat, collaboration] = await Promise.all([
    readFile(new URL('../communities/communities.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../chat/chat.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../event-tasks-realtime/event-task-collaboration.service.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(communities, /role: \{ select: \{ key: true \} \}/);
  assert.match(communities, /verification: feedPublisherVerification\(comment\.authorMode, comment\.user\.memberships\[0\]\?\.role\.key\)/);
  assert.match(chat, /include: \{ role: true, profile: true \}/);
  assert.match(chat, /workspaceRole: membership\?\.role\.key \?\? 'member'/);
  assert.match(collaboration, /role: \{ select: \{ key: true \} \}/);
  assert.match(collaboration, /role: membership\?\.role\?\.key \?\? 'member'/);
});

test('publication covers are optional and external URLs accept only safe HTTP(S) values', () => {
  assert.deepEqual(publicationCoverMutation({}, undefined, false), { action: 'clear' });
  assert.deepEqual(publicationCoverMutation({}, undefined, true), { action: 'keep' });
  assert.equal(normalizePublicationCoverUrl(' https://images.example.test/feed/cover.webp '), 'https://images.example.test/feed/cover.webp');
  assert.throws(() => normalizePublicationCoverUrl('javascript:alert(1)'));
  assert.throws(() => normalizePublicationCoverUrl('https://user:password@example.test/cover.jpg'));
});

test('publication cover upload validates MIME type, size, and file signature', () => {
  const png = uploadedImage([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png');
  const mutation = publicationCoverMutation({ coverMode: 'UPLOAD' }, png);
  assert.equal(mutation.action, 'upload');
  if (mutation.action === 'upload') assert.equal(mutation.extension, '.png');

  assert.throws(() => publicationCoverMutation({ coverMode: 'UPLOAD' }, uploadedImage([1, 2, 3], 'image/png')));
  assert.throws(() => publicationCoverMutation({ coverMode: 'UPLOAD' }, uploadedImage([1, 2, 3], 'image/gif')));
});
