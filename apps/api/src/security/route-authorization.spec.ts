import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { AuthService, RequestUser } from '../auth/auth.service';
import { requireAdmin, requireUser } from '../auth/require-user';

const adminControllerUrl = new URL('../admin/admin.controller.ts', import.meta.url);
const communitiesControllerUrl = new URL('../communities/communities.controller.ts', import.meta.url);
const authServiceUrl = new URL('../auth/auth.service.ts', import.meta.url);

const member: RequestUser = {
  id: 'member-id',
  email: 'member@example.test',
  name: 'Member',
  communityId: 'community-id',
  community: { defaultLanguage: 'en', timezone: 'UTC' },
  role: 'member',
  permissions: [],
};

test('missing or invalid sessions retain the API 401 contract', async () => {
  const auth = {
    userFromCookie: async () => {
      throw new UnauthorizedException('Authentication required.');
    },
  } as unknown as AuthService;

  await assert.rejects(
    requireUser(auth, undefined),
    (error: unknown) => error instanceof UnauthorizedException && error.getStatus() === 401,
  );
});

test('authenticated Members retain the API 403 Admin boundary', async () => {
  const auth = {
    userFromCookie: async () => member,
  } as unknown as AuthService;

  await assert.rejects(
    requireAdmin(auth, 'signed-session', member.communityId),
    (error: unknown) => error instanceof ForbiddenException && error.getStatus() === 403,
  );
});

test('representative Admin and Member task-board endpoints remain independently guarded', async () => {
  const [adminController, communitiesController] = await Promise.all([
    readFile(adminControllerUrl, 'utf8'),
    readFile(communitiesControllerUrl, 'utf8'),
  ]);

  const adminTaskBoards = adminController.slice(
    adminController.indexOf("@Get('task-boards')"),
    adminController.indexOf("@Get('task-boards/automation-summary')"),
  );
  const memberTaskBoards = communitiesController.slice(
    communitiesController.indexOf("@Get('task-boards')"),
    communitiesController.indexOf("@Get('task-boards/:boardId')"),
  );

  assert.match(adminTaskBoards, /this\.requireAdminPermission/);
  assert.match(memberTaskBoards, /requireUser\(this\.auth/);
});

test('authoritative session validation checks revocation, expiry, and active membership', async () => {
  const authService = await readFile(authServiceUrl, 'utf8');
  const userFromCookie = authService.slice(
    authService.indexOf('async userFromCookie'),
    authService.indexOf('async twoFactorStatus'),
  );
  const logout = authService.slice(
    authService.indexOf('async logout'),
    authService.indexOf('async userFromCookie'),
  );

  assert.match(userFromCookie, /session\.findUnique/);
  assert.match(userFromCookie, /session\.expiresAt <= now/);
  assert.match(userFromCookie, /session\.idleExpiresAt <= now/);
  assert.match(userFromCookie, /session\.user\.memberships\.length === 0/);
  assert.match(userFromCookie, /session\.deleteMany/);
  assert.match(logout, /session\.deleteMany/);
});
