import assert from 'node:assert/strict';
import test from 'node:test';

test('application links stay root-relative when no app origin is configured', async () => {
  delete process.env.NEXT_PUBLIC_APP_ORIGIN;
  const { getAppHref } = await import(`./app-links.ts?relative=${Date.now()}`);

  assert.equal(getAppHref('/login'), '/login');
  assert.equal(getAppHref('/register?source=site'), '/register?source=site');
  assert.equal(getAppHref('/login#password'), '/login#password');
  assert.equal(getAppHref('/login//recovery'), '/login/recovery');
  assert.throws(() => getAppHref('login'), /root-relative path/);
  assert.throws(() => getAppHref('//example.org/login'), /root-relative path/);
  assert.throws(() => getAppHref('https://example.org/login'), /root-relative path/);
  assert.throws(() => getAppHref('javascript:alert(1)'), /root-relative path/);
});

test('application links use only the configured HTTP application origin', async () => {
  process.env.NEXT_PUBLIC_APP_ORIGIN = 'https://community.example.org/base';
  const { getAppHref } = await import(`./app-links.ts?configured=${Date.now()}`);

  assert.equal(getAppHref('/login'), 'https://community.example.org/login');
  assert.equal(getAppHref('/register?source=site#form'), 'https://community.example.org/register?source=site#form');
});

test('application links accept configured origins with and without a trailing slash', async () => {
  process.env.NEXT_PUBLIC_APP_ORIGIN = 'https://community.example.org/';
  const withSlash = await import(`./app-links.ts?slash=${Date.now()}`);
  assert.equal(withSlash.getAppHref('/login'), 'https://community.example.org/login');

  process.env.NEXT_PUBLIC_APP_ORIGIN = 'not-an-origin';
  const invalid = await import(`./app-links.ts?invalid=${Date.now()}`);
  assert.equal(invalid.getAppHref('/setup'), '/setup');
});
