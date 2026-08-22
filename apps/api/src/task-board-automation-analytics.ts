import {
  analyticsComparison,
  analyticsPeriod,
  analyticsRanges,
  analyticsSparkline,
  parseAnalyticsRange,
  type AnalyticsMetricComparison,
  type AnalyticsPeriod,
  type AnalyticsRange,
} from './period-analytics';

export const taskBoardAutomationRanges = analyticsRanges;
export type TaskBoardAutomationRange = AnalyticsRange;
export type TaskBoardAutomationPeriod = AnalyticsPeriod;
export type TaskBoardAutomationMetricComparison = AnalyticsMetricComparison;

export const parseTaskBoardAutomationRange = parseAnalyticsRange;
export const taskBoardAutomationPeriod = analyticsPeriod;
export const taskBoardAutomationSparkline = analyticsSparkline;

export function taskBoardAutomationComparison(value: number, previousValue: number | null, sparkline: AnalyticsMetricComparison['sparkline'], metric: 'runs' | 'failedRuns' | 'emailNotificationsSent') {
  return analyticsComparison(value, previousValue, sparkline, metric === 'failedRuns' ? 'negative' : 'neutral');
}
