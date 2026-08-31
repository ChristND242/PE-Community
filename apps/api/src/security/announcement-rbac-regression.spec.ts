import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { requireAdmin } from '../auth/require-user';
import { PERMISSIONS } from '../rbac/permissions';
import { PermissionsService } from '../rbac/permissions.service';

const permissions = new PermissionsService({} as never, { recordBestEffort: async () => undefined } as never);

test('announcement draft and publish permissions remain explicit for owner and admin matrices', async () => {
  const owner = { id: 'owner', role: 'owner' };
  const permittedAdmin = {
    id: 'admin-permitted',
    role: 'admin',
    permissions: [PERMISSIONS.announcementsRead, PERMISSIONS.announcementsCreate, PERMISSIONS.announcementsPublish],
  };
  const createOnlyAdmin = {
    id: 'admin-create-only',
    role: 'admin',
    permissions: [PERMISSIONS.announcementsRead, PERMISSIONS.announcementsCreate],
  };

  for (const permission of [PERMISSIONS.announcementsRead, PERMISSIONS.announcementsCreate, PERMISSIONS.announcementsPublish]) {
    assert.equal(permissions.hasPermission(owner, permission), true);
    assert.equal(permissions.hasPermission(permittedAdmin, permission), true);
  }
  assert.equal(permissions.hasPermission(createOnlyAdmin, PERMISSIONS.announcementsRead), true);
  assert.equal(permissions.hasPermission(createOnlyAdmin, PERMISSIONS.announcementsCreate), true);
  assert.equal(permissions.hasPermission(createOnlyAdmin, PERMISSIONS.announcementsPublish), false);

  await assert.rejects(() => requireAdmin({
    cookieName: 'session',
    userFromCookie: async () => ({ id: 'member', role: 'member', communityId: 'community-1' }),
  } as never, 'session-cookie', 'community-1'));
});

test('announcement routes and UI keep list, edit, and publish authorization aligned', async () => {
  const [controller, page] = await Promise.all([
    readFile(new URL('../admin/admin.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../../web/app/admin/announcements/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(controller, /@Get\('announcements'\)[\s\S]+PERMISSIONS\.announcementsRead/);
  assert.match(controller, /@Post\('announcements'\)[\s\S]+body\.publish \? PERMISSIONS\.announcementsPublish : PERMISSIONS\.announcementsCreate/);
  assert.match(controller, /@Get\('announcements\/:announcementId'\)[\s\S]+PERMISSIONS\.announcementsRead/);
  assert.match(controller, /@Patch\('announcements\/:announcementId'\)[\s\S]+PERMISSIONS\.announcementsCreate/);
  assert.match(controller, /@Post\('announcements\/:announcementId\/publish'\)[\s\S]+PERMISSIONS\.announcementsPublish/);

  const load = page.slice(page.indexOf('async function load()'), page.indexOf('useEffect(() => { load();'));
  assert.match(load, /\/announcements/);
  assert.doesNotMatch(load, /settings\/email/);
  assert.match(page, /currentUser\?\.permissions\.includes\(announcementCreatePermission\)/);
  assert.match(page, /currentUser\?\.permissions\.includes\(announcementPublishPermission\)/);
  assert.match(page, /\{canCreate && <button onClick=\{\(\) => editAnnouncement\(item\)\}/);
  assert.match(page, /\{canPublish && item\.status !== 'PUBLISHED'/);
  assert.match(page, /apiFetch<EmailSettings>[\s\S]+\.catch\(\(\) => setEmailSettings\(\{ available: false \}\)\)/);
});
