import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseTaskBoardAutomationRange,
  taskBoardAutomationComparison,
  taskBoardAutomationPeriod,
  taskBoardAutomationSparkline,
} from './task-board-automation-analytics';

test('automation ranges default safely and reject unknown values', () => {
  assert.equal(parseTaskBoardAutomationRange(undefined), '30d');
  assert.equal(parseTaskBoardAutomationRange('90d'), '90d');
  assert.equal(parseTaskBoardAutomationRange('invalid'), null);
});

test('active-period buckets use real dates and preserve totals', () => {
  const period = taskBoardAutomationPeriod('7d', 'UTC', new Date('2026-08-08T12:00:00.000Z'));
  const dates = [new Date('2026-08-03T10:00:00.000Z'), new Date('2026-08-03T12:00:00.000Z')];
  const sparkline = taskBoardAutomationSparkline(dates, period);
  assert.equal(sparkline.reduce((total, point) => total + point.value, 0), dates.length);
  assert.ok(sparkline.some((point) => point.value === 0));
});

test('failed-run sentiment is inverse while volume metrics remain neutral', () => {
  assert.equal(taskBoardAutomationComparison(8, 4, [], 'failedRuns').sentiment, 'negative');
  assert.equal(taskBoardAutomationComparison(2, 4, [], 'failedRuns').sentiment, 'positive');
  assert.equal(taskBoardAutomationComparison(8, 4, [], 'runs').sentiment, 'neutral');
  assert.equal(taskBoardAutomationComparison(8, 4, [], 'emailNotificationsSent').sentiment, 'neutral');
});

test('comparison edge cases do not invent percentages', () => {
  assert.equal(taskBoardAutomationComparison(0, 0, [], 'runs').direction, 'flat');
  assert.equal(taskBoardAutomationComparison(3, 0, [], 'runs').direction, 'new');
  assert.equal(taskBoardAutomationComparison(3, null, [], 'runs').direction, 'unavailable');
});
