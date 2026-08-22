export const analyticsRanges = ['7d', '30d', '90d', 'this_month', 'last_month', 'all'] as const;

export type AnalyticsRange = (typeof analyticsRanges)[number];
export type AnalyticsDirection = 'up' | 'down' | 'flat' | 'new' | 'unavailable';
export type AnalyticsSentiment = 'positive' | 'negative' | 'neutral';
export type AnalyticsPeriod = {
  range: AnalyticsRange;
  timezone: string;
  current: { from: Date | null; to: Date };
  previous: { from: Date; to: Date } | null;
  bucket: 'day' | 'month';
};
export type AnalyticsSparklinePoint = { date: string; value: number };
export type AnalyticsMetricComparison = {
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  direction: AnalyticsDirection;
  sentiment: AnalyticsSentiment;
  sparkline: AnalyticsSparklinePoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function isAnalyticsRange(value: unknown): value is AnalyticsRange {
  return typeof value === 'string' && analyticsRanges.includes(value as AnalyticsRange);
}

export function parseAnalyticsRange(value: unknown): AnalyticsRange | null {
  if (value === undefined || value === null || value === '') return '30d';
  return isAnalyticsRange(value) ? value : null;
}

export function safeAnalyticsTimezone(value: string | null | undefined) {
  const timezone = value?.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'UTC';
  }
}

export function analyticsPeriod(range: AnalyticsRange, timezone: string, now = new Date()): AnalyticsPeriod {
  const safeTimezone = safeAnalyticsTimezone(timezone);
  if (range === 'all') return { range, timezone: safeTimezone, current: { from: null, to: now }, previous: null, bucket: 'month' };

  if (range === 'this_month') {
    const local = zonedParts(now, safeTimezone);
    const currentFrom = zonedDateTimeToUtc({ year: local.year, month: local.month, day: 1 }, safeTimezone);
    const previousMonth = shiftMonth(local.year, local.month, -1);
    const previousFrom = zonedDateTimeToUtc({ ...previousMonth, day: 1 }, safeTimezone);
    const previousMonthDays = new Date(Date.UTC(previousMonth.year, previousMonth.month, 0)).getUTCDate();
    const previousTo = local.day > previousMonthDays
      ? currentFrom
      : zonedDateTimeToUtc({ ...previousMonth, day: local.day, hour: local.hour, minute: local.minute, second: local.second, millisecond: now.getUTCMilliseconds() }, safeTimezone);
    return { range, timezone: safeTimezone, current: { from: currentFrom, to: now }, previous: { from: previousFrom, to: previousTo }, bucket: 'day' };
  }

  if (range === 'last_month') {
    const local = zonedParts(now, safeTimezone);
    const currentMonth = { year: local.year, month: local.month };
    const lastMonth = shiftMonth(local.year, local.month, -1);
    const previousMonth = shiftMonth(local.year, local.month, -2);
    const currentFrom = zonedDateTimeToUtc({ ...lastMonth, day: 1 }, safeTimezone);
    const currentTo = zonedDateTimeToUtc({ ...currentMonth, day: 1 }, safeTimezone);
    const previousFrom = zonedDateTimeToUtc({ ...previousMonth, day: 1 }, safeTimezone);
    return { range, timezone: safeTimezone, current: { from: currentFrom, to: currentTo }, previous: { from: previousFrom, to: currentFrom }, bucket: 'day' };
  }

  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const currentFrom = new Date(now.getTime() - days * DAY_MS);
  const previousFrom = new Date(currentFrom.getTime() - days * DAY_MS);
  return { range, timezone: safeTimezone, current: { from: currentFrom, to: now }, previous: { from: previousFrom, to: currentFrom }, bucket: 'day' };
}

export function dateInPeriod(value: Date, period: { from: Date | null; to: Date }) {
  return (!period.from || value >= period.from) && value < period.to;
}

export function analyticsComparison(value: number, previousValue: number | null, sparkline: AnalyticsSparklinePoint[], upwardSentiment: AnalyticsSentiment): AnalyticsMetricComparison {
  if (previousValue === null) return { value, previousValue, changePercent: null, direction: 'unavailable', sentiment: 'neutral', sparkline };
  if (previousValue === 0 && value === 0) return { value, previousValue, changePercent: 0, direction: 'flat', sentiment: 'neutral', sparkline };
  if (previousValue === 0) return { value, previousValue, changePercent: null, direction: 'new', sentiment: 'neutral', sparkline };
  const changePercent = ((value - previousValue) / previousValue) * 100;
  const direction: AnalyticsDirection = value === previousValue ? 'flat' : value > previousValue ? 'up' : 'down';
  const sentiment = direction === 'flat' || upwardSentiment === 'neutral'
    ? 'neutral'
    : direction === 'up'
      ? upwardSentiment
      : upwardSentiment === 'positive' ? 'negative' : 'positive';
  return { value, previousValue, changePercent, direction, sentiment, sparkline };
}

export function analyticsSparkline(values: Date[], period: AnalyticsPeriod): AnalyticsSparklinePoint[] {
  if (!values.length && period.current.from === null) return [];
  const start = period.current.from ?? earliest(values);
  if (!start) return [];
  const counts = new Map<string, number>();
  for (const value of values) {
    if (dateInPeriod(value, period.current)) {
      const key = period.bucket === 'month' ? monthKey(value, period.timezone) : dayKey(value, period.timezone);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const keys = period.bucket === 'month'
    ? monthKeysBetween(start, period.current.to, period.timezone)
    : dayKeysBetween(start, period.current.to, period.timezone);
  return keys.map((key) => ({ date: bucketDate(key, period.bucket, period.timezone).toISOString(), value: counts.get(key) ?? 0 }));
}

function earliest(values: Date[]) {
  return values.length ? new Date(Math.min(...values.map((value) => value.getTime()))) : null;
}

function dayKey(value: Date, timezone: string) {
  const parts = zonedParts(value, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function monthKey(value: Date, timezone: string) {
  const parts = zonedParts(value, timezone);
  return `${parts.year}-${pad(parts.month)}`;
}

function dayKeysBetween(from: Date, to: Date, timezone: string) {
  const start = zonedParts(from, timezone);
  const end = zonedParts(new Date(to.getTime() - 1), timezone);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  const last = new Date(Date.UTC(end.year, end.month - 1, end.day));
  const keys: string[] = [];
  while (cursor <= last) {
    keys.push(`${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function monthKeysBetween(from: Date, to: Date, timezone: string) {
  const start = zonedParts(from, timezone);
  const end = zonedParts(new Date(to.getTime() - 1), timezone);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, 1));
  const last = new Date(Date.UTC(end.year, end.month - 1, 1));
  const keys: string[] = [];
  while (cursor <= last) {
    keys.push(`${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function bucketDate(key: string, bucket: 'day' | 'month', timezone: string) {
  const [year, month, day] = key.split('-').map(Number);
  return zonedDateTimeToUtc({ year, month, day: bucket === 'month' ? 1 : day }, timezone);
}

function zonedParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') };
}

function zonedDateTimeToUtc(value: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number; millisecond?: number }, timezone: string) {
  const desired = Date.UTC(value.year, value.month - 1, value.day, value.hour ?? 0, value.minute ?? 0, value.second ?? 0, value.millisecond ?? 0);
  let result = new Date(desired);
  for (let index = 0; index < 3; index += 1) {
    const observed = zonedParts(result, timezone);
    const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    const correction = desired - observedUtc;
    if (correction === 0) break;
    result = new Date(result.getTime() + correction);
  }
  return result;
}

function shiftMonth(year: number, month: number, delta: number) {
  const value = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}
