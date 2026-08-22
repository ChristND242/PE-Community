import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('./page.tsx', import.meta.url);
const chartUrl = new URL('../../../components/email-operations-charts.tsx', import.meta.url);

test('the Recent delivery trend selector is the single global range control', async () => {
  const [page, chart] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(chartUrl, 'utf8')]);
  assert.equal((page.match(/<SharedRecentDeliveryTrendAreaChart/g) ?? []).length, 1);
  assert.equal((page.match(/emails\/overview\?range=/g) ?? []).length, 1);
  assert.match(page, /rangeOptions=\{rangeOptions\}/);
  assert.match(chart, /<AppSelect value=\{timeRange\}/);
  assert.doesNotMatch(chart, /filterTrendData/);
});

test('range state is URL-backed, preserves data, and rejects stale responses', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /window\.history\.pushState/);
  assert.match(page, /window\.addEventListener\('popstate'/);
  assert.match(page, /const requestId = \+\+overviewRequestRef\.current/);
  assert.match(page, /requestId === overviewRequestRef\.current/);
  assert.match(page, /controller\.abort\(\)/);
  assert.doesNotMatch(page, /setOverview\(null\)/);
});

test('period analytics share one response and pending has no comparison or sparkline', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /overview\.comparisons\.totalCampaigns/);
  assert.match(page, /overview\.comparisons\.sentEmails/);
  assert.match(page, /overview\.comparisons\.failedEmails/);
  assert.match(page, /overview\?\.charts\.recipientsByStatus/);
  assert.match(page, /overview\?\.charts\.campaignsByStatus/);
  assert.match(page, /overview\?\.charts\.recentDeliveryTrend/);
  const pendingMetric = page.match(/\{ label: t\.admin\.pendingRecipients[^\n]+/)?.[0] ?? '';
  assert.ok(pendingMetric);
  assert.doesNotMatch(pendingMetric, /comparison:/);
  assert.doesNotMatch(pendingMetric, /sparkline/);
});

test('the c9ebf2a8 chart structures are restored while metric sparklines stay isolated', async () => {
  const [page, chart] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(chartUrl, 'utf8')]);
  const deliveryChart = chart.slice(
    chart.indexOf('export function DeliveryStatusDistributionLineCard'),
    chart.indexOf('export function CampaignsByStatusRadarCard'),
  );
  const recentChart = chart.slice(
    chart.indexOf('export function RecentDeliveryTrendAreaChart'),
    chart.indexOf('function CampaignStatusTooltip'),
  );

  assert.match(page, /trendData=\{trendData\}/);
  assert.match(page, /<SharedRecentDeliveryTrendAreaChart data=\{trendData\}/);
  assert.match(deliveryChart, /<LineChart data=\{trendData\}/);
  assert.match(deliveryChart, /useState<DeliveryStatusKey>\('failed'\)/);
  assert.match(deliveryChart, /setActiveStatus\(item\.key\)/);
  assert.match(deliveryChart, /aria-pressed=\{selected\}/);
  assert.match(deliveryChart, /<Line type="monotone" dataKey=\{active\.key\}/);
  assert.match(deliveryChart, /<CartesianGrid/);
  assert.match(deliveryChart, /<XAxis/);
  assert.match(deliveryChart, /<YAxis/);
  assert.doesNotMatch(deliveryChart, /<Line type="monotone" dataKey="sent"|<Line type="monotone" dataKey="failed"|MetricSparkline/);
  assert.match(recentChart, /<AreaChart data=\{data\}/);
  assert.match(recentChart, /\{hasSent && <Area type="monotone" dataKey="sent"/);
  assert.match(recentChart, /\{hasFailed && <Area type="monotone" dataKey="failed"/);
  assert.match(recentChart, /<CartesianGrid/);
  assert.match(recentChart, /<XAxis/);
  assert.match(recentChart, /<YAxis/);
  assert.match(recentChart, /<Legend content=\{<DeliveryTrendLegend \/>\} \/>\{hasSent && <Area/);
  assert.doesNotMatch(recentChart, /MetricSparkline/);
  assert.equal((page.match(/<MetricSparkline/g) ?? []).length, 1);
});

test('comparison direction is textual and failed sentiment comes from the API', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /comparison\.direction === 'up' \? '↑' : '↓'/);
  assert.match(page, /emailComparisonNew/);
  assert.match(page, /emailComparisonFlat/);
  assert.match(page, /emailComparisonUnavailable/);
  assert.match(page, /comparison\.sentiment/);
  assert.doesNotMatch(page, /Math\.random/);
});

test('metric, locale, campaign radar, and endpoint contracts remain intact', async () => {
  const [page, chart] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(chartUrl, 'utf8')]);
  assert.equal((page.match(/comparison: overview\.comparisons\./g) ?? []).length, 3);
  assert.match(page, /label: t\.admin\.pendingRecipients/);
  assert.match(chart, /lang === 'fr' \? 'Envoyés' : 'Sent'/);
  assert.match(chart, /lang === 'fr' \? 'Échecs' : 'Failed'/);
  assert.match(chart, /<RadarChart data=\{data\}/);
  assert.match(chart, /<Radar dataKey="count"/);
  assert.equal((page.match(/\/emails\/overview/g) ?? []).length, 1);
  assert.doesNotMatch(page, /Math\.random/);
  assert.doesNotMatch(chart, /Math\.random/);
});
