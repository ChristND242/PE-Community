import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('./page.tsx', import.meta.url);

test('one overview selector controls one range-aware request', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.equal((page.match(/automation-summary\?range=/g) ?? []).length, 1);
  assert.equal((page.match(/value=\{range\} options=\{rangeOptions\}/g) ?? []).length, 1);
  assert.doesNotMatch(page, /task-boards\/automation-issues`/);
});

test('range URL state preserves tabs and responds to browser navigation', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /params\.set\('tab', 'automations-templates'\)/);
  assert.match(page, /params\.set\('templateTab', selectedTemplateTab\)/);
  assert.match(page, /params\.set\('range', range\)/);
  assert.match(page, /window\.history\.pushState/);
  assert.match(page, /window\.addEventListener\('popstate'/);
});

test('stale responses are rejected and previous overview data is retained', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /automationRequestRef\.current === requestId/);
  assert.match(page, /controller\.abort\(\)/);
  assert.doesNotMatch(page, /setAutomationOverview\(null\)/);
});

test('only period metrics receive comparisons and real-data sparklines', async () => {
  const page = await readFile(pageUrl, 'utf8');
  const activeMetric = page.match(/<Metric label=\{t\.admin\.activeAutomationRules\}[^\n]+/)?.[0] ?? '';
  assert.ok(activeMetric);
  assert.doesNotMatch(activeMetric, /comparison=/);
  assert.match(page, /comparison=\{overview\.metrics\.runs\}/);
  assert.match(page, /comparison=\{overview\.metrics\.failedRuns\}/);
  assert.match(page, /comparison=\{overview\.metrics\.emailNotificationsSent\}/);
  assert.match(page, /comparison\?\.sentiment === 'positive'/);
  assert.match(page, /comparison\?\.sentiment === 'negative'/);
  assert.doesNotMatch(page, /Math\.random/);
});
