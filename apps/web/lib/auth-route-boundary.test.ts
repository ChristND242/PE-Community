import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { handleUnauthorizedResponse } from './api';

const adminLayoutUrl = new URL('../app/admin/layout.tsx', import.meta.url);
const dashboardLayoutUrl = new URL('../app/dashboard/layout.tsx', import.meta.url);
const accountLayoutUrl = new URL('../app/change-password/layout.tsx', import.meta.url);
const serverAuthUrl = new URL('./server-auth.ts', import.meta.url);
const shellUrl = new URL('../components/shell.tsx', import.meta.url);

test('middleware redirects missing protected-session cookies without affecting public routes', async () => {
  for (const path of ['/admin', '/admin/task-boards', '/dashboard', '/dashboard/feed', '/change-password']) {
    const response = await middleware(new NextRequest(`http://localhost:3000${path}`));
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get('location'), 'http://localhost:3000/login', path);
  }

  const publicResponse = await middleware(new NextRequest('http://localhost:3000/login'));
  assert.equal(publicResponse.status, 200);
});

test('middleware treats cookie presence only as a preliminary check', async () => {
  const request = new NextRequest('http://localhost:3000/admin/task-boards', {
    headers: { cookie: 'pe_session=opaque-signed-session' },
  });
  const response = await middleware(request);
  assert.equal(response.status, 200);

  const serverAuth = await readFile(serverAuthUrl, 'utf8');
  assert.match(serverAuth, /fetch\(await serverApiUrl\('\/auth\/me'\)/);
  assert.match(serverAuth, /if \(response\.status === 401\) redirect/);
  assert.match(serverAuth, /cache: 'no-store'/);
});

test('protected layouts validate before returning their child trees', async () => {
  const [adminLayout, dashboardLayout, accountLayout, serverAuth] = await Promise.all([
    readFile(adminLayoutUrl, 'utf8'),
    readFile(dashboardLayoutUrl, 'utf8'),
    readFile(accountLayoutUrl, 'utf8'),
    readFile(serverAuthUrl, 'utf8'),
  ]);

  assert.ok(adminLayout.indexOf('await requireAdminSession()') < adminLayout.indexOf('return <SessionActivityProvider>'));
  assert.ok(dashboardLayout.indexOf('await requireAuthenticatedSession()') < dashboardLayout.indexOf('return <SessionActivityProvider>'));
  assert.ok(accountLayout.indexOf("allowPasswordChange: true") < accountLayout.indexOf('return children'));
  assert.match(serverAuth, /session\.role !== 'owner' && session\.role !== 'admin'/);
  assert.match(serverAuth, /redirect\('\/dashboard'\)/);

  for (const layout of [adminLayout, dashboardLayout, accountLayout]) {
    assert.doesNotMatch(layout, /AppShell|Sidebar|Topbar/);
  }
});

test('runtime authentication failures redirect while authorization failures remain distinct', () => {
  assert.equal(handleUnauthorizedResponse({ status: 401 }), true);
  assert.equal(handleUnauthorizedResponse({ status: 403 }), false);
  assert.equal(handleUnauthorizedResponse({ status: 500 }), false);
});

test('the authenticated shell remains responsible for runtime authentication failures', async () => {
  const shell = await readFile(shellUrl, 'utf8');
  assert.match(shell, /handleUnauthorizedResponse\(response\)/);
  assert.match(shell, /window\.location\.replace\('\/login'\)/);
});
