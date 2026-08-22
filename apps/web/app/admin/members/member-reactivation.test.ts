import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('./[id]/page.tsx', import.meta.url);
const i18nUrl = new URL('../../../lib/i18n.tsx', import.meta.url);

test('member detail renders exactly one status-driven membership action', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /member\.status === 'ACTIVE'/);
  assert.match(page, /setConfirming\('suspend'\)/);
  assert.match(page, /member\.status === 'SUSPENDED'/);
  assert.match(page, /setConfirming\('reactivate'\)/);
  assert.match(page, /confirmLoading && confirming === 'reactivate'/);
});

test('member transitions reuse the existing endpoint and update local state', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /confirming === 'reactivate' \? 'ACTIVE' : 'SUSPENDED'/);
  assert.match(page, /setMember\(updated\)/);
  assert.match(page, /toast\.success\(confirming === 'reactivate'/);
  assert.match(page, /toast\.error\(confirming === 'remove'/);
  assert.doesNotMatch(page, /\/members\/\$\{id\}\/reactivate/);
});

test('English and French confirmation and feedback copy are present', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');
  for (const value of ['Reactivate member', 'Member reactivated', 'Reactivate member?', 'Réactiver le membre', 'Membre réactivé', 'Réactiver le membre ?']) {
    assert.match(i18n, new RegExp(value.replace(/[?]/g, '\\?')));
  }
});
