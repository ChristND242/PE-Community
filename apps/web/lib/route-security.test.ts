import assert from 'node:assert/strict';
import test from 'node:test';
import { isProtectedPath, isPublicPath, protectedRouteKind } from './route-security';

test('all authenticated route roots and nested routes are classified explicitly', () => {
  assert.equal(protectedRouteKind('/admin'), 'admin');
  assert.equal(protectedRouteKind('/admin/task-boards'), 'admin');
  assert.equal(protectedRouteKind('/dashboard'), 'member');
  assert.equal(protectedRouteKind('/dashboard/chat'), 'member');
  assert.equal(protectedRouteKind('/change-password'), 'account');
});

test('lookalike and public routes do not cross the protected boundary', () => {
  for (const path of ['/', '/login', '/register', '/forgot-password', '/reset-password', '/setup']) {
    assert.equal(isPublicPath(path), true, path);
    assert.equal(isProtectedPath(path), false, path);
  }

  for (const path of ['/docs', '/docs/security']) {
    assert.equal(isPublicPath(path), false, path);
    assert.equal(isProtectedPath(path), false, path);
  }

  for (const path of ['/administrator', '/dashboard-preview', '/change-password-help', '/api/health', '/_next/static/app.js']) {
    assert.equal(isProtectedPath(path), false, path);
  }
});
