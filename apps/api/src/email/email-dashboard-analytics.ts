import {
  analyticsComparison,
  analyticsPeriod,
  analyticsRanges,
  analyticsSparkline,
  dateInPeriod,
  isAnalyticsRange,
  parseAnalyticsRange,
  safeAnalyticsTimezone,
  type AnalyticsDirection,
  type AnalyticsMetricComparison,
  type AnalyticsPeriod,
  type AnalyticsRange,
  type AnalyticsSentiment,
  type AnalyticsSparklinePoint,
} from '../period-analytics';

export const emailDashboardRanges = analyticsRanges;
export type EmailDashboardRange = AnalyticsRange;
export type EmailDashboardDirection = AnalyticsDirection;
export type EmailDashboardSentiment = AnalyticsSentiment;
export type EmailDashboardPeriod = AnalyticsPeriod;
export type EmailDashboardSparklinePoint = AnalyticsSparklinePoint;
export type EmailDashboardMetricComparison = AnalyticsMetricComparison;

export { dateInPeriod };
export const isEmailDashboardRange = isAnalyticsRange;
export const parseEmailDashboardRange = parseAnalyticsRange;
export const safeEmailDashboardTimezone = safeAnalyticsTimezone;
export const emailDashboardPeriod = analyticsPeriod;
export const emailDashboardSparkline = analyticsSparkline;

export function emailDashboardComparison(value: number, previousValue: number | null, sparkline: EmailDashboardSparklinePoint[], metric: 'campaigns' | 'sent' | 'failed'): EmailDashboardMetricComparison {
  const upwardSentiment = metric === 'campaigns' ? 'neutral' : metric === 'failed' ? 'negative' : 'positive';
  return analyticsComparison(value, previousValue, sparkline, upwardSentiment);
}

export function emailDashboardDeliveryTrend(sent: Date[], failed: Date[], period: EmailDashboardPeriod) {
  const sentBuckets = emailDashboardSparkline(sent, period);
  const failedBuckets = emailDashboardSparkline(failed, period);
  const dates = new Set([...sentBuckets.map((item) => item.date), ...failedBuckets.map((item) => item.date)]);
  const sentMap = new Map(sentBuckets.map((item) => [item.date, item.value]));
  const failedMap = new Map(failedBuckets.map((item) => [item.date, item.value]));
  return Array.from(dates).sort().map((date) => ({ label: date, sent: sentMap.get(date) ?? 0, failed: failedMap.get(date) ?? 0 }));
}
