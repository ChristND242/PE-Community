import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const workerSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const { BUILT_IN_EMAIL_TEMPLATES, EMAIL_LOCALES, EMAIL_TEMPLATE_KEYS } =
  createRequire(import.meta.url)('@pe/shared') as typeof import('@pe/shared');

test('worker registry exposes complete English and French variants', () => {
  for (const key of EMAIL_TEMPLATE_KEYS) {
    for (const locale of EMAIL_LOCALES) {
      const variant = BUILT_IN_EMAIL_TEMPLATES[key][locale];
      assert.equal(variant.locale, locale);
      assert.ok(variant.subject.trim());
      assert.ok(variant.heading.trim());
      assert.ok(variant.body.trim());
    }
  }
});

test('send jobs consume and preserve an explicit queued locale', () => {
  assert.match(workerSource, /job\.data as \{ campaignId: string; recipientId: string; locale: EmailLocale \}/);
  assert.match(workerSource, /\{ campaignId: campaign\.id, recipientId: recipient\.id, locale \}/);
  assert.match(workerSource, /campaignMetadataLocale\(recipient\.campaign\.metadata\)/);
  assert.doesNotMatch(workerSource, /job\.data[\s\S]{0,300}defaultLanguage/);
});
