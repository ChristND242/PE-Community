import assert from 'node:assert/strict';
import test from 'node:test';
import { sitePublicRoutePaths } from '../public-routes';
import { searchDocs } from './search';

test('documentation search is normalized, partial, locale-specific, and route-safe', () => {
  assert.equal(searchDocs('', 'en').length, 0);
  assert.equal(searchDocs('   ', 'fr').length, 0);

  const english = searchDocs('  ENCRYPTED  ', 'en');
  assert.ok(english.some((result) => result.title === 'Encrypted chat'));
  assert.ok(english.every((result) => sitePublicRoutePaths.has(result.href)));

  const french = searchDocs('chiffré', 'fr');
  assert.ok(french.some((result) => result.title === 'Chat chiffré'));
  assert.ok(french.every((result) => !result.title.includes('Encrypted')));

  const partial = searchDocs('deploy', 'en');
  assert.ok(partial.some((result) => result.href === '/docs/deployment'));
  assert.equal(new Set(partial.map((result) => result.href)).size, partial.length);
  assert.deepEqual(searchDocs('no-page-can-match-this', 'en'), []);
});

test('documentation search includes title, summary, and category terms', () => {
  assert.ok(searchDocs('restore', 'en').some((result) => result.href === '/docs/backup-restore'));
  assert.ok(searchDocs('platform', 'en').some((result) => result.category === 'Platform'));
});
