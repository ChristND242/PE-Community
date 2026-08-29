import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

test('email delivery retries can reclaim failed recipients without double-claiming', () => {
  const delivery = source.slice(source.indexOf('async function sendCampaignRecipient'), source.indexOf('async function recoverQueuedEmailRecipients'));
  assert.match(delivery, /\['PENDING', 'QUEUED', 'FAILED'\]/);
  assert.match(delivery, /emailRecipient\.updateMany/);
  assert.match(delivery, /status: 'SENDING'/);
  assert.match(delivery, /if \(!claimed\.count\) return/);
});

test('the durable email outbox recovery is bounded and uses deterministic recipient jobs', () => {
  const recovery = source.slice(source.indexOf('async function recoverQueuedEmailRecipients'), source.indexOf('function campaignMetadataLocale'));
  assert.match(source, /email-outbox-recovery-minutely/);
  assert.match(recovery, /take: 100/);
  assert.match(recovery, /recipient\.attempts\.length < 3/);
  assert.match(recovery, /jobId: `email-recipient-\$\{recipient\.id\}`/);
  assert.match(recovery, /attempts: 3/);
});
