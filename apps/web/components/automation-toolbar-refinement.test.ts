import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const automationUrl = new URL('./task-board-automation.tsx', import.meta.url);

test('automation toolbar preserves English labels and compacts localized French actions accessibly', async () => {
  const automation = await readFile(automationUrl, 'utf8');

  assert.match(automation, /new ResizeObserver\(update\)/);
  assert.match(automation, /measure\.scrollWidth > actions\.clientWidth/);
  assert.match(automation, /aria-label=\{t\.admin\.saveAsAutomationPreset\}/);
  assert.match(automation, /aria-label=\{t\.admin\.addAutomationRule\}/);
  assert.match(automation, /<TooltipContent>\{t\.admin\.saveAsAutomationPreset\}<\/TooltipContent>/);
  assert.match(automation, /<TooltipContent>\{t\.admin\.addAutomationRule\}<\/TooltipContent>/);
  assert.match(automation, /sm:max-w-\[320px\] sm:flex-1 sm:basis-\[14rem\]/);
  assert.match(automation, /title=\{selected\.title\}/);
});
