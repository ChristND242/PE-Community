import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { EmailService } from './email.service';

test('overview returns one coherent current/previous snapshot and retains live pending state', async () => {
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
  const prisma = {
    communitySettings: { findUnique: async () => ({ timezone: 'UTC' }) },
    emailCampaign: {
      findMany: async () => [
        { createdAt: daysAgo(1), status: 'SENT' },
        { createdAt: daysAgo(2), status: 'FAILED' },
        { createdAt: daysAgo(8), status: 'QUEUED' },
      ],
    },
    emailRecipient: {
      findMany: async () => [
        { status: 'SENT', sentAt: daysAgo(1), attempts: [] },
        { status: 'FAILED', sentAt: null, attempts: [{ attemptedAt: daysAgo(2) }] },
        { status: 'SENT', sentAt: daysAgo(8), attempts: [] },
        { status: 'FAILED', sentAt: null, attempts: [{ attemptedAt: daysAgo(9) }] },
      ],
      count: async () => 3,
    },
    emailDeliveryAttempt: { findFirst: async () => ({ attemptedAt: daysAgo(1) }) },
  };
  const service = Object.create(EmailService.prototype) as EmailService;
  Object.defineProperty(service, 'prisma', { value: prisma });

  const result = await service.overview('community-1', { range: '7d' });
  assert.equal(result.metrics.totalCampaigns, 2);
  assert.equal(result.metrics.sentEmails, 1);
  assert.equal(result.metrics.failedEmails, 1);
  assert.equal(result.metrics.pendingRecipients, 3);
  assert.equal(result.comparisons.totalCampaigns.previousValue, 1);
  assert.equal(result.comparisons.sentEmails.previousValue, 1);
  assert.equal(result.comparisons.failedEmails.previousValue, 1);
  assert.equal(result.comparisons.totalCampaigns.sparkline.reduce((sum, point) => sum + point.value, 0), result.metrics.totalCampaigns);
  assert.equal(result.comparisons.sentEmails.sparkline.reduce((sum, point) => sum + point.value, 0), result.metrics.sentEmails);
  assert.equal(result.comparisons.failedEmails.sparkline.reduce((sum, point) => sum + point.value, 0), result.metrics.failedEmails);
  assert.deepEqual(result.charts.recipientsByStatus, [{ label: 'SENT', value: 1 }, { label: 'FAILED', value: 1 }]);
});

test('overview rejects an unknown range before querying the database', async () => {
  const service = Object.create(EmailService.prototype) as EmailService;
  Object.defineProperty(service, 'prisma', { value: {} });
  await assert.rejects(() => service.overview('community-1', { range: 'invalid' }), BadRequestException);
});
