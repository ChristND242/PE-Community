import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { EventImageSource } from '@prisma/client';
import { eventImageMutation, normalizeEventImageUrl } from '../event-images';
import { maxEventImageUploadSize, type EventImageUploadFile } from '../uploads';

function image(mimetype: string, bytes: number[], size = bytes.length): EventImageUploadFile {
  return { buffer: Buffer.from(bytes), mimetype, size, originalname: 'untrusted-name' };
}

test('event image mutation preserves backward compatibility and explicit removal', () => {
  assert.deepEqual(eventImageMutation({}), { action: 'clear' });
  assert.deepEqual(eventImageMutation({}, undefined, true), { action: 'keep' });
  assert.deepEqual(eventImageMutation({ imageMode: 'NONE' }, undefined, true), { action: 'clear' });
});

test('event image upload accepts signed JPEG, PNG, and WebP only within 5 MB', () => {
  const jpeg = image('image/jpeg', [0xff, 0xd8, 0xff, 0xe0]);
  const png = image('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = image('image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
  for (const file of [jpeg, png, webp]) assert.equal(eventImageMutation({ imageMode: 'UPLOAD' }, file).action, 'upload');
  assert.throws(() => eventImageMutation({ imageMode: 'UPLOAD' }, image('image/svg+xml', [60, 115, 118, 103])));
  assert.throws(() => eventImageMutation({ imageMode: 'UPLOAD' }, image('image/png', [60, 115, 118, 103])));
  assert.throws(() => eventImageMutation({ imageMode: 'UPLOAD' }, image('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], maxEventImageUploadSize + 1)));
  assert.equal(maxEventImageUploadSize, 5 * 1024 * 1024);
});

test('event image validation rejects a MIME/signature mismatch and accepts its normalized multipart representation', () => {
  const pngBytes = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.throws(
    () => eventImageMutation({ imageMode: 'UPLOAD' }, image('image/jpeg', pngBytes)),
    /Event image is invalid/,
  );
  assert.equal(eventImageMutation({ imageMode: 'UPLOAD' }, image('image/png', pngBytes)).action, 'upload');
});

test('external event images accept HTTP(S) without server-side fetching', async () => {
  assert.equal(normalizeEventImageUrl(' https://images.example.test/event.jpg '), 'https://images.example.test/event.jpg');
  assert.equal(eventImageMutation({ imageMode: 'EXTERNAL', imageUrl: 'http://images.example.test/event.png' }).imageSource, EventImageSource.EXTERNAL);
  for (const value of ['', 'not-a-url', 'file:///tmp/event.png', 'javascript:alert(1)', 'https://user:pass@example.test/a.jpg']) {
    assert.throws(() => normalizeEventImageUrl(value));
  }
  const source = await readFile(new URL('../event-images.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|axios|http\.get|https\.get/);
});

test('event routes retain permission checks and additive multipart support', async () => {
  const controller = await readFile(new URL('../admin/admin.controller.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../admin/admin.service.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../../../../prisma/migrations/20260827000000_event_images/migration.sql', import.meta.url), 'utf8');
  assert.match(controller, /PERMISSIONS\.eventsCreate/);
  assert.match(controller, /PERMISSIONS\.eventsUpdate/);
  assert.match(controller, /FileInterceptor\('eventImage'/);
  assert.match(service, /eventImageMutation\(input, eventImage, true\)/);
  assert.match(service, /removeUploadedEventImage/);
  assert.match(service, /writeFile\(uploadedPath, mutation\.file\.buffer\)/);
  assert.match(service, /imageUrl: eventImagePublicUrl\(filename\)/);
  assert.doesNotMatch(migration, /DROP|DELETE|TRUNCATE/i);
  assert.match(migration, /ADD COLUMN "imageUrl" TEXT/);
  assert.match(migration, /ADD COLUMN "imageSource" "EventImageSource"/);
});
