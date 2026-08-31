import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  signedRequestMetadataValid,
  updaterSignature,
  updaterSignatureMatches,
  type SignedUpdaterRequest,
} from './ipc-auth.js';
import { ReplayNonceStore } from './nonce-store.js';

const secret = 's'.repeat(32);
const now = 1_800_000_000_000;
const request: SignedUpdaterRequest = {
  protocol: '2',
  method: 'POST',
  path: '/v1/install',
  timestamp: String(now),
  nonce: 'a'.repeat(64),
  contentDigest: 'b'.repeat(64),
};

test('IPC signature binds protocol, method, path, timestamp, nonce, and body digest', () => {
  const signature = updaterSignature(secret, request);
  assert.equal(signedRequestMetadataValid(request, now), true);
  assert.equal(updaterSignatureMatches([secret], request, signature), true);
  for (const mutation of [
    { protocol: '1' },
    { method: 'GET' },
    { path: '/v1/check' },
    { timestamp: String(now - 1) },
    { nonce: 'c'.repeat(64) },
    { contentDigest: 'd'.repeat(64) },
  ]) {
    assert.equal(
      updaterSignatureMatches([secret], { ...request, ...mutation }, signature),
      false,
    );
  }
  assert.equal(updaterSignatureMatches(['x'.repeat(32)], request, signature), false);
  assert.equal(updaterSignatureMatches([secret], request, 'malformed'), false);
});

test('IPC timestamp rejects expired and future requests', () => {
  assert.equal(
    signedRequestMetadataValid({ ...request, timestamp: String(now - 30_001) }, now),
    false,
  );
  assert.equal(
    signedRequestMetadataValid({ ...request, timestamp: String(now + 30_001) }, now),
    false,
  );
});

test('nonce replay cache rejects reuse across store restart', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'pe-updater-nonce-'));
  await mkdir(root, { recursive: true });
  context.after(() => rm(root, { recursive: true, force: true }));
  await new ReplayNonceStore(root).consume(request.nonce, now, now);
  await assert.rejects(
    () => new ReplayNonceStore(root).consume(request.nonce, now, now),
    /REPLAYED_NONCE/,
  );
});
