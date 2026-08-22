import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEffectiveLanguage } from './i18n';

test('community language is authoritative when no explicit user choice exists', () => {
  assert.equal(resolveEffectiveLanguage(null, null, 'fr'), 'fr');
  assert.equal(resolveEffectiveLanguage('fr', 'community', 'en'), 'en');
});

test('explicit user language remains authoritative over community changes', () => {
  assert.equal(resolveEffectiveLanguage('fr', 'user', 'en'), 'fr');
  assert.equal(resolveEffectiveLanguage('en', 'user', 'fr'), 'en');
});

test('unsupported or missing language values fall back to English', () => {
  assert.equal(resolveEffectiveLanguage('de', 'user', 'de'), 'en');
  assert.equal(resolveEffectiveLanguage(null, null, null), 'en');
});
