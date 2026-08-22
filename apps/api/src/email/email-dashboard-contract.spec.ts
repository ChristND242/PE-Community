import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const controllerUrl = new URL('../admin/admin.controller.ts', import.meta.url);
const adminServiceUrl = new URL('../admin/admin.service.ts', import.meta.url);
const emailServiceUrl = new URL('./email.service.ts', import.meta.url);

test('the existing authorized overview endpoint is extended without companion analytics routes', async () => {
  const [controller, adminService, emailService] = await Promise.all([
    readFile(controllerUrl, 'utf8'),
    readFile(adminServiceUrl, 'utf8'),
    readFile(emailServiceUrl, 'utf8'),
  ]);
  assert.equal((controller.match(/@Get\('emails\/overview'\)/g) ?? []).length, 1);
  assert.match(controller, /requireAdminPermission\(req, communityId, PERMISSIONS\.emailRead\)/);
  assert.match(controller, /emailOverview\(communityId, query\)/);
  assert.match(adminService, /email\.overview\(communityId, query\)/);
  assert.doesNotMatch(controller, /emails\/(comparison|metrics|sparkline|trend)/);
  assert.match(emailService, /parseEmailDashboardRange\(input\.range\)/);
});

test('overview uses selected-period outcomes while pending recipients stays live', async () => {
  const source = await readFile(emailServiceUrl, 'utf8');
  assert.match(source, /status: 'SENT', sentAt: combinedDateFilter/);
  assert.match(source, /status: 'FAILED', attempts: \{ some: \{ status: 'FAILED', attemptedAt: combinedDateFilter/);
  assert.match(source, /status: \{ in: \['PENDING', 'QUEUED'\] \}/);
  assert.match(source, /emailDashboardComparison\(failedEmails, previousFailed, failedSparkline, 'failed'\)/);
  assert.match(source, /recentDeliveryTrend: emailDashboardDeliveryTrend/);
});
