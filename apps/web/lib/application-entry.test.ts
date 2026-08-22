import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { destinationForApplicationEntry, type ApplicationEntrySession } from './application-entry';

const rootUrl = new URL('../app/page.tsx', import.meta.url);
const serverAuthUrl = new URL('./server-auth.ts', import.meta.url);

const memberSession: ApplicationEntrySession = {
  id: 'user-1',
  communityId: 'community-1',
  role: 'member',
};

test('application entry resolves setup and anonymous failure states safely', () => {
  assert.equal(destinationForApplicationEntry('required', null), '/setup');
  assert.equal(destinationForApplicationEntry('complete', null), '/login');
  assert.equal(destinationForApplicationEntry('error', null), '/login');
  assert.equal(destinationForApplicationEntry('complete', { ...memberSession, id: '' }), '/login');
  assert.equal(destinationForApplicationEntry('complete', { ...memberSession, communityId: '' }), '/login');
  assert.equal(destinationForApplicationEntry('complete', { ...memberSession, role: 'unknown' }), '/login');
});

test('application entry follows the existing effective role destination precedence', () => {
  assert.equal(destinationForApplicationEntry('complete', { ...memberSession, role: 'owner' }), '/admin');
  assert.equal(destinationForApplicationEntry('complete', { ...memberSession, role: 'admin' }), '/admin');
  assert.equal(destinationForApplicationEntry('complete', memberSession), '/dashboard');
  assert.equal(destinationForApplicationEntry('complete', { ...memberSession, forcePasswordChange: true }), '/change-password');
  assert.equal(destinationForApplicationEntry('required', { ...memberSession, role: 'owner' }), '/setup');
});

test('Web root is server-authoritative and has no marketing or compatibility-mode path', async () => {
  const [root, serverAuth] = await Promise.all([
    readFile(rootUrl, 'utf8'),
    readFile(serverAuthUrl, 'utf8'),
  ]);
  assert.match(root, /redirect\(await resolveApplicationEntryDestination\(\)\)/);
  assert.match(serverAuth, /serverApiUrl\('\/setup\/status'\)/);
  assert.match(serverAuth, /serverApiUrl\('\/auth\/me'\)/);
  assert.match(serverAuth, /headers: \{ cookie:/);
  assert.doesNotMatch(`${root}\n${serverAuth}`, /PublicHomepage|NEXT_PUBLIC_PUBLIC_SITE_MODE|localStorage|accessToken|refreshToken/);
  assert.doesNotMatch(root, /searchParams|returnUrl|redirectTo|destination=/);
});
