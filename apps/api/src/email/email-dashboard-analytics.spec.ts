import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dateInPeriod,
  emailDashboardComparison,
  emailDashboardPeriod,
  emailDashboardSparkline,
  parseEmailDashboardRange,
} from './email-dashboard-analytics';

test('defaults to 30 days and rejects unknown presets', () => {
  assert.equal(parseEmailDashboardRange(undefined), '30d');
  assert.equal(parseEmailDashboardRange('30d'), '30d');
  assert.equal(parseEmailDashboardRange('custom'), null);
});

test('rolling ranges use adjacent inclusive/exclusive intervals', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  for (const [range, days] of [['7d', 7], ['30d', 30], ['90d', 90]] as const) {
    const period = emailDashboardPeriod(range, 'UTC', now);
    assert.equal(period.current.to.toISOString(), now.toISOString());
    assert.equal(period.current.from?.toISOString(), new Date(now.getTime() - days * 86_400_000).toISOString());
    assert.equal(period.previous?.to.toISOString(), period.current.from?.toISOString());
    assert.equal(period.previous?.from.toISOString(), new Date(now.getTime() - days * 2 * 86_400_000).toISOString());
  }
});

test('this month respects community timezone and DST when matching previous elapsed time', () => {
  const period = emailDashboardPeriod('this_month', 'America/New_York', new Date('2026-03-10T16:00:00.000Z'));
  assert.equal(period.current.from?.toISOString(), '2026-03-01T05:00:00.000Z');
  assert.equal(period.previous?.from.toISOString(), '2026-02-01T05:00:00.000Z');
  assert.equal(period.previous?.to.toISOString(), '2026-02-10T17:00:00.000Z');
});

test('this month safely caps the previous interval for shorter and leap-year months', () => {
  const leap = emailDashboardPeriod('this_month', 'UTC', new Date('2024-03-31T10:00:00.000Z'));
  assert.equal(leap.previous?.from.toISOString(), '2024-02-01T00:00:00.000Z');
  assert.equal(leap.previous?.to.toISOString(), '2024-03-01T00:00:00.000Z');
});

test('last month compares two complete calendar months', () => {
  const period = emailDashboardPeriod('last_month', 'UTC', new Date('2026-05-20T08:30:00.000Z'));
  assert.equal(period.current.from?.toISOString(), '2026-04-01T00:00:00.000Z');
  assert.equal(period.current.to.toISOString(), '2026-05-01T00:00:00.000Z');
  assert.equal(period.previous?.from.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(period.previous?.to.toISOString(), '2026-04-01T00:00:00.000Z');
});

test('all time has no previous period and uses monthly buckets', () => {
  const period = emailDashboardPeriod('all', 'UTC', new Date('2026-08-15T12:00:00.000Z'));
  assert.equal(period.current.from, null);
  assert.equal(period.previous, null);
  assert.equal(period.bucket, 'month');
});

test('the shared boundary belongs only to the current period', () => {
  const period = emailDashboardPeriod('7d', 'UTC', new Date('2026-08-15T12:00:00.000Z'));
  const boundary = period.current.from!;
  assert.equal(dateInPeriod(boundary, period.current), true);
  assert.equal(dateInPeriod(boundary, period.previous!), false);
});

test('comparisons cover zero, new, positive, negative, inverse failure, and all-time cases', () => {
  assert.deepEqual(emailDashboardComparison(0, 0, [], 'sent'), { value: 0, previousValue: 0, changePercent: 0, direction: 'flat', sentiment: 'neutral', sparkline: [] });
  assert.equal(emailDashboardComparison(2, 0, [], 'sent').direction, 'new');
  assert.equal(emailDashboardComparison(12, 10, [], 'sent').sentiment, 'positive');
  assert.equal(emailDashboardComparison(8, 10, [], 'sent').sentiment, 'negative');
  assert.equal(emailDashboardComparison(8, 10, [], 'failed').sentiment, 'positive');
  assert.equal(emailDashboardComparison(12, 10, [], 'failed').sentiment, 'negative');
  assert.equal(emailDashboardComparison(12, 10, [], 'campaigns').sentiment, 'neutral');
  assert.equal(emailDashboardComparison(12, null, [], 'sent').direction, 'unavailable');
});

test('daily sparkline fills empty buckets and preserves the metric total', () => {
  const period = emailDashboardPeriod('7d', 'UTC', new Date('2026-08-08T12:00:00.000Z'));
  const values = [new Date('2026-08-02T12:00:00.000Z'), new Date('2026-08-02T18:00:00.000Z'), new Date('2026-08-06T08:00:00.000Z')];
  const sparkline = emailDashboardSparkline(values, period);
  assert.equal(sparkline.reduce((total, point) => total + point.value, 0), values.length);
  assert.ok(sparkline.some((point) => point.value === 0));
});

test('timezone bucketing keeps near-midnight outcomes on the community date', () => {
  const period = emailDashboardPeriod('7d', 'America/Los_Angeles', new Date('2026-08-08T12:00:00.000Z'));
  const sparkline = emailDashboardSparkline([new Date('2026-08-08T00:30:00.000Z')], period);
  const nonzero = sparkline.find((point) => point.value === 1);
  assert.equal(nonzero?.date, '2026-08-07T07:00:00.000Z');
});
