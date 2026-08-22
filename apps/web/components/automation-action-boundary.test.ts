import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const canvasUrl = new URL('./automation-canvas-view.tsx', import.meta.url);
const authenticatedUrl = new URL('./task-board-automation.tsx', import.meta.url);
const marketingUrl = new URL('../../site/components/marketing/product-operations-section.tsx', import.meta.url);

test('automation action menu remains inside the authenticated outside-click boundary', async () => {
  const [canvas, authenticated] = await Promise.all([
    readFile(canvasUrl, 'utf8'),
    readFile(authenticatedUrl, 'utf8'),
  ]);

  assert.match(canvas, /data-automation-node-menu/);
  assert.match(canvas, /onClick=\{item\.action\}/);
  assert.match(
    authenticated,
    /closest\('\[data-automation-node-menu\], \[data-automation-recipient-panel\]'\)/,
  );
});

test('authenticated automation owns explicit real action handlers and overlay state', async () => {
  const authenticated = await readFile(authenticatedUrl, 'utf8');

  for (const handler of [
    'openRuleEditor(rule)',
    'testRule(rule)',
    'testNotification(rule)',
    'setRunsRule(rule)',
    'setDeleteRule(rule)',
  ]) {
    assert.match(authenticated, new RegExp(handler.replace(/[()]/g, '\\$&')));
  }

  assert.match(authenticated, /runsRule && <AutomationRunsDrawer/);
  assert.match(authenticated, /<ConfirmDialog open=\{Boolean\(deleteRule\)\}/);
  assert.match(authenticated, /automation-rules\/\$\{rule\.id\}\/test/);
  assert.match(authenticated, /automation-rules\/\$\{rule\.id\}\/test-notification/);
  assert.match(authenticated, /automation-rules\/\$\{deleteRule\.id\}\/archive/);
});

test('marketing automation preview remains local and cannot call authenticated APIs', async () => {
  const marketing = await readFile(marketingUrl, 'utf8');
  const previewStart = marketing.indexOf('function AutomationPreview()');
  const previewEnd = marketing.indexOf('function EmailOperationsPreview()');
  const automationPreview = marketing.slice(previewStart, previewEnd);

  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  assert.match(automationPreview, /const inertActions =/);
  assert.match(automationPreview, /disabled: true/);
  assert.doesNotMatch(automationPreview, /apiFetch|AutomationRunsDrawer|TaskBoardAutomation/);
});
