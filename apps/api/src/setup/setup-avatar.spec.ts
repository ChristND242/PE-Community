import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  avatarUploadExtension,
  hasValidAvatarSignature,
  maxAvatarUploadSize,
  type AvatarUploadFile,
} from '../uploads';

function upload(mimetype: string, bytes: number[]): AvatarUploadFile {
  const buffer = Buffer.from(bytes);
  return { buffer, mimetype, size: buffer.length };
}

test('avatar validation accepts supported signatures and rejects mismatches', () => {
  const jpeg = upload('image/jpeg', [0xff, 0xd8, 0xff, 0xe0]);
  const png = upload('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = upload('image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);

  assert.equal(avatarUploadExtension(jpeg), '.jpg');
  assert.equal(hasValidAvatarSignature(jpeg), true);
  assert.equal(hasValidAvatarSignature(png), true);
  assert.equal(hasValidAvatarSignature(webp), true);
  assert.equal(avatarUploadExtension(upload('image/svg+xml', [60, 115, 118, 103])), undefined);
  assert.equal(hasValidAvatarSignature(upload('image/png', [60, 115, 118, 103])), false);
  assert.equal(maxAvatarUploadSize, 5 * 1024 * 1024);
});

test('setup stores avatar through existing MemberProfile fields and cleans failed writes', async () => {
  const service = await readFile(new URL('./setup.service.ts', import.meta.url), 'utf8');
  const controller = await readFile(new URL('./setup.controller.ts', import.meta.url), 'utf8');

  assert.match(controller, /FileInterceptor\('ownerAvatar'/);
  assert.match(service, /tx\.memberProfile\.create/);
  assert.match(service, /avatarUrl,/);
  assert.match(service, /dicebearStyle: avatarUrl \? undefined : generatedAvatar\?\.dicebearStyle/);
  assert.match(service, /await writeFile\(ownerAvatarPath, ownerAvatar\.buffer\)/);
  assert.match(service, /if \(ownerAvatarPath\) await unlink\(ownerAvatarPath\)\.catch/);
  assert.ok(service.indexOf('const current = await this.status()') < service.indexOf('await writeFile(ownerAvatarPath'));
});
