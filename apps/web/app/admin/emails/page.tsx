'use client';

import { CheckCircle2, Clock3, Mail, Search, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppSelect } from '../../../components/app-select';
import { CampaignsByStatusRadarCard as SharedCampaignsByStatusRadarCard, DeliveryStatusDistributionLineCard as SharedDeliveryStatusDistributionLineCard, RecentDeliveryTrendAreaChart as SharedRecentDeliveryTrendAreaChart } from '../../../components/email-operations-charts';
import type { EmailTrendRange } from '../../../components/email-operations-charts';
import { AppShell } from '../../../components/shell';
import { Card, DataTablePagination, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { formatDate } from '../../../lib/utils';

type ChartDatum = { label: string; value: number };
type DeliveryStatusKey = 'failed' | 'sent';
type DeliveryStatusTotal = { key: DeliveryStatusKey; label: string; value: number; color: string };
type DeliveryTrendPoint = { label: string; sent: number; failed: number; date: string };
type CampaignStatusPoint = { status: string; count: number };
type TrendRange = EmailTrendRange;
type MetricComparison = {
  value: number;
  previousValue: number | null;
  changePercent: number | null;
  direction: 'up' | 'down' | 'flat' | 'new' | 'unavailable';
  sentiment: 'positive' | 'negative' | 'neutral';
  sparkline: Array<{ date: string; value: number }>;
};
const campaignStatusAxes = ['QUEUED', 'SENDING', 'SENT', 'FAILED', 'PARTIAL', 'CANCELED'] as const;
type EmailOverview = {
  range: { preset: TrendRange; timezone: string; from: string | null; to: string; previousFrom: string | null; previousTo: string | null };
  metrics: {
    totalCampaigns: number;
    queuedCampaigns: number;
    sentEmails: number;
    failedEmails: number;
    deliverySuccessRate: number;
    pendingRecipients: number;
    failedRecipients: number;
    lastDeliveryAttemptAt?: string | null;
  };
  comparisons: {
    totalCampaigns: MetricComparison;
    sentEmails: MetricComparison;
    failedEmails: MetricComparison;
  };
  charts: {
    recipientsByStatus: ChartDatum[];
    campaignsByStatus: ChartDatum[];
    recentDeliveryTrend: Array<{ label: string; sent: number; failed: number }>;
  };
};
type Campaign = {
  id: string;
  type: string;
  subject: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  createdAt: string;
  sentAt?: string | null;
  lastAttemptAt?: string | null;
  lastErrorMessage?: string | null;
};
type CampaignResponse = { page: number; pageSize: number; total: number; campaigns: Campaign[] };

export default function EmailDashboardPage() {
  const { lang, t } = useI18n();
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const [overview, setOverview] = useState<EmailOverview | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignResponse | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [trendRange, setTrendRange] = useState<TrendRange>('30d');
  const [rangeReady, setRangeReady] = useState(false);
  const [overviewPending, setOverviewPending] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [campaignError, setCampaignError] = useState('');
  const [overviewReload, setOverviewReload] = useState(0);
  const [campaignReload, setCampaignReload] = useState(0);
  const overviewRequestRef = useRef(0);

  useEffect(() => {
    const applyRangeFromUrl = () => {
      const url = new URL(window.location.href);
      const requested = url.searchParams.get('range');
      const nextRange = isTrendRange(requested) ? requested : '30d';
      if (requested && requested !== nextRange) {
        url.searchParams.set('range', nextRange);
        window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`);
      }
      setTrendRange(nextRange);
      setRangeReady(true);
    };
    applyRangeFromUrl();
    window.addEventListener('popstate', applyRangeFromUrl);
    return () => window.removeEventListener('popstate', applyRangeFromUrl);
  }, []);

  useEffect(() => {
    if (!rangeReady) return;
    const controller = new AbortController();
    const requestId = ++overviewRequestRef.current;
    setOverviewPending(true);
    setOverviewError('');
    apiFetch<EmailOverview>(`/admin/${COMMUNITY_ID}/emails/overview?range=${encodeURIComponent(trendRange)}`, { signal: controller.signal })
      .then((data) => {
        if (requestId === overviewRequestRef.current) setOverview(data);
      })
      .catch((error: unknown) => {
        if (requestId === overviewRequestRef.current && !(error instanceof DOMException && error.name === 'AbortError')) setOverviewError(t.admin.emailDashboardRangeLoadFailed);
      })
      .finally(() => {
        if (requestId === overviewRequestRef.current) setOverviewPending(false);
      });
    return () => controller.abort();
  }, [overviewReload, rangeReady, t.admin.emailDashboardRangeLoadFailed, trendRange]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), status, type });
    if (search.trim()) params.set('search', search.trim());
    setCampaignError('');
    apiFetch<CampaignResponse>(`/admin/${COMMUNITY_ID}/emails/campaigns?${params.toString()}`, { signal: controller.signal })
      .then(setCampaigns)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setCampaignError(t.admin.emailDashboardLoadFailed);
      });
    return () => controller.abort();
  }, [campaignReload, page, pageSize, status, t.admin.emailDashboardLoadFailed, type]);

  function changeRange(nextRange: TrendRange) {
    if (nextRange === trendRange || overviewPending) return;
    const url = new URL(window.location.href);
    url.searchParams.set('range', nextRange);
    window.history.pushState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}`);
    setTrendRange(nextRange);
  }

  function retryDashboard() {
    setOverviewReload((value) => value + 1);
    setCampaignReload((value) => value + 1);
  }

  const metrics = overview ? [
    { label: t.admin.totalCampaigns, value: overview.metrics.totalCampaigns, detail: t.admin.emailCampaignsQueued(overview.metrics.queuedCampaigns), icon: Mail, comparison: overview.comparisons.totalCampaigns },
    { label: t.admin.sentEmails, value: overview.metrics.sentEmails, detail: t.admin.deliverySuccessRateValue(overview.metrics.deliverySuccessRate), icon: CheckCircle2, comparison: overview.comparisons.sentEmails },
    { label: t.admin.failedEmails, value: overview.metrics.failedEmails, detail: t.admin.failedRecipientsValue(overview.metrics.failedRecipients), icon: XCircle, comparison: overview.comparisons.failedEmails },
    { label: t.admin.pendingRecipients, value: overview.metrics.pendingRecipients, detail: overview.metrics.lastDeliveryAttemptAt ? t.admin.lastDeliveryAttempt(formatDate(overview.metrics.lastDeliveryAttemptAt, locale)) : t.admin.noDeliveryAttempts, icon: Clock3, operationalLabel: overview.metrics.pendingRecipients === 0 ? t.admin.emailQueueClear : t.admin.emailQueueProcessing },
  ] : [];

  const trendData = useMemo(() => overview?.charts.recentDeliveryTrend.map((item) => ({ ...item, date: item.label })) ?? [], [overview]);
  const deliveryStatusTotals = useMemo(() => {
    const counts = new Map((overview?.charts.recipientsByStatus ?? []).map((item) => [item.label, item.value]));
    return [
      { key: 'failed' as const, label: emailStatusLabel(t, 'FAILED'), value: counts.get('FAILED') ?? 0, color: deliveryStatusColor('FAILED', 0) },
      { key: 'sent' as const, label: emailStatusLabel(t, 'SENT'), value: counts.get('SENT') ?? 0, color: deliveryStatusColor('SENT', 1) },
    ];
  }, [overview, t]);
  const campaignStatusData = useMemo(() => {
    const counts = new Map((overview?.charts.campaignsByStatus ?? []).map((item) => [item.label, item.value]));
    return campaignStatusAxes.map((status) => ({ status: emailStatusLabel(t, status), count: counts.get(status) ?? 0 }));
  }, [overview, t]);
  const showingLabel = campaigns ? t.admin.showingRange(Math.min((campaigns.page - 1) * campaigns.pageSize + 1, campaigns.total), Math.min(campaigns.page * campaigns.pageSize, campaigns.total), campaigns.total) : '';
  const rangeOptions = emailRangeOptions(t);
  const error = overviewError || campaignError;

  return (
    <AppShell admin>
      <div className="space-y-6">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent/90">{t.admin.emailOperations}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.admin.emailDashboard}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.emailDashboardSubtitle}</p>
          </div>
        </header>

        {error && <TableErrorState title={error} retryLabel={t.common.retry} onRetry={retryDashboard} />}

        {!overview || !campaigns ? (
          <TableSkeleton rows={8} columns={4} />
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy={overviewPending}>
              {metrics.map((metric) => <MetricCard key={metric.label} {...metric} t={t} />)}
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <SharedDeliveryStatusDistributionLineCard emptyText={deliveryStatusEmptyText(lang)} lang={lang} title={t.admin.deliveryStatusDistribution} totals={deliveryStatusTotals} trendData={trendData} timeZone={overview.range.timezone} />
              <SharedCampaignsByStatusRadarCard data={campaignStatusData} emptyText={campaignStatusEmptyText(lang)} lang={lang} title={t.admin.campaignsByStatus} />
            </section>

            <SharedRecentDeliveryTrendAreaChart data={trendData} disabled={overviewPending} emptyText={emailTrendEmptyText(lang)} lang={lang} timeRange={trendRange} onTimeRangeChange={changeRange} rangeLabel={overviewPending ? t.admin.emailDashboardRangeLoading : t.admin.emailDashboardRangeLabel} rangeOptions={rangeOptions} title={t.admin.recentDeliveryTrend} timeZone={overview.range.timezone} />

            <Card className="overflow-hidden rounded-2xl border-white/10 bg-white/[0.035] p-0">
              <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white">{t.admin.recentCampaigns}</h2>
                  <p className="mt-1 text-sm text-white/50">{t.admin.recentCampaignsDescription}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="relative min-w-[16rem]">
                    <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-white/35" />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setPage(1); setCampaignReload((value) => value + 1); } }} placeholder={t.admin.searchCampaigns} className="w-full rounded-xl border border-white/10 bg-black/20 px-9 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent/60" />
                  </label>
                  <AppSelect value={status} label={t.common.status} options={['all', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'PARTIAL', 'CANCELED'].map((value) => ({ value, label: value === 'all' ? t.common.all : emailStatusLabel(t, value) }))} onChange={(value) => { setStatus(value); setPage(1); }} />
                  <AppSelect value={type} label={t.admin.campaignType} options={['all', 'TEST', 'PASSWORD_RESET', 'ANNOUNCEMENT', 'EVENT_ATTENDEES', 'PASSPORT_EXPIRATION', 'TASK_BOARD_AUTOMATION_DUE_BEFORE', 'TASK_BOARD_AUTOMATION_OVERDUE', 'TASK_BOARD_AUTOMATION_TEST'].map((value) => ({ value, label: value === 'all' ? t.common.all : emailTypeLabel(t, value) }))} onChange={(value) => { setType(value); setPage(1); }} />
                </div>
              </div>
              {campaigns.campaigns.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[940px] text-left text-sm">
                      <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42">
                        <tr><th className="px-4 py-3">{t.admin.emailSubject}</th><th className="px-4 py-3">{t.admin.campaignType}</th><th className="px-4 py-3">{t.common.status}</th><th className="px-4 py-3">{t.admin.recipients}</th><th className="px-4 py-3">{t.admin.deliveryAttempts}</th><th className="px-4 py-3">{t.admin.createdAt}</th><th className="px-4 py-3">{t.admin.tableActions}</th></tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {campaigns.campaigns.map((campaign) => (
                          <tr key={campaign.id} className="hover:bg-white/[0.025]">
                            <td className="px-4 py-4 font-medium text-white">{campaign.subject}</td>
                            <td className="px-4 py-4 text-white/58">{emailTypeLabel(t, campaign.type)}</td>
                            <td className="px-4 py-4"><StatusBadge tone={emailStatusTone(campaign.status)}>{emailStatusLabel(t, campaign.status)}</StatusBadge></td>
                            <td className="px-4 py-4 text-white/58">{campaign.sentCount}/{campaign.failedCount}/{campaign.recipientCount}</td>
                            <td className="px-4 py-4 text-white/58">{campaign.lastAttemptAt ? formatDate(campaign.lastAttemptAt, locale) : '-'}</td>
                            <td className="px-4 py-4 text-white/58">{formatDate(campaign.createdAt, locale)}</td>
                            <td className="px-4 py-4"><Link href={`/admin/emails/${campaign.id}`} className="font-semibold text-accent hover:text-[#74e4b1]">{t.admin.viewDetails}</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <DataTablePagination page={campaigns.page} pageSize={campaigns.pageSize} pageSizeOptions={[5, 10, 25]} total={campaigns.total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={showingLabel} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />
                </>
              ) : (
                <div className="p-4"><TableEmptyState title={t.admin.noEmailCampaigns} description={t.admin.noEmailCampaignsDescription} /></div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value, detail, icon: Icon, comparison, operationalLabel, t }: { label: string; value: number; detail: string; icon: React.ComponentType<{ size?: number; className?: string }>; comparison?: MetricComparison; operationalLabel?: string; t: ReturnType<typeof useI18n>['t'] }) {
  const comparisonLabel = comparison ? metricComparisonLabel(comparison, t) : null;
  const showSparkline = Boolean(comparison && comparison.sparkline.length >= 2);
  return (
    <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.026))] p-4" aria-label={label}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-sm font-medium text-white/58">{label}</p><p className="mt-2 text-2xl font-semibold text-white">{value.toLocaleString()}</p></div>
        {showSparkline && comparison ? <MetricSparkline data={comparison.sparkline} sentiment={comparison.sentiment} /> : <span className="rounded-xl border border-accent/18 bg-accent/10 p-2 text-accent"><Icon size={17} aria-hidden="true" /></span>}
      </div>
      {comparisonLabel && <p aria-label={comparison ? metricComparisonAccessibleLabel(comparison, t) : undefined} className={`mt-3 inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${comparisonTone(comparison?.sentiment ?? 'neutral')}`}>{comparisonLabel}</p>}
      {operationalLabel && <p className="mt-3 inline-flex min-h-6 items-center rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-2.5 py-1 text-[11px] font-semibold text-cyan-100/80">{operationalLabel}</p>}
      <p className="mt-3 min-h-10 text-xs leading-5 text-white/42">{detail}</p>
    </Card>
  );
}

function MetricSparkline({ data, sentiment }: { data: Array<{ date: string; value: number }>; sentiment: MetricComparison['sentiment'] }) {
  const color = sentiment === 'positive' ? '#5ed29c' : sentiment === 'negative' ? '#fb7185' : '#93c5fd';
  return <div className="h-12 w-24 shrink-0" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>;
}

function metricComparisonLabel(comparison: MetricComparison, t: ReturnType<typeof useI18n>['t']) {
  if (comparison.direction === 'unavailable') return t.admin.emailComparisonUnavailable;
  if (comparison.direction === 'new') return t.admin.emailComparisonNew;
  if (comparison.direction === 'flat') return t.admin.emailComparisonFlat;
  const percent = Math.abs(comparison.changePercent ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${comparison.direction === 'up' ? '↑' : '↓'} ${percent}% ${t.admin.emailComparisonVsPrevious}`;
}

function metricComparisonAccessibleLabel(comparison: MetricComparison, t: ReturnType<typeof useI18n>['t']) {
  if (comparison.direction === 'unavailable') return t.admin.emailComparisonUnavailable;
  if (comparison.direction === 'new') return t.admin.emailComparisonNew;
  if (comparison.direction === 'flat') return t.admin.emailComparisonFlat;
  const percent = Math.abs(comparison.changePercent ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${comparison.direction === 'up' ? t.admin.emailComparisonIncrease : t.admin.emailComparisonDecrease} ${percent}% ${t.admin.emailComparisonVsPrevious}`;
}

function comparisonTone(sentiment: MetricComparison['sentiment']) {
  if (sentiment === 'positive') return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100';
  if (sentiment === 'negative') return 'border-rose-300/20 bg-rose-400/10 text-rose-100';
  return 'border-white/10 bg-white/[0.045] text-white/58';
}

function DeliveryStatusDistributionLineCard({
  emptyText,
  lang,
  title,
  totals,
  trendData,
}: {
  emptyText: string;
  lang: string;
  title: string;
  totals: DeliveryStatusTotal[];
  trendData: DeliveryTrendPoint[];
}) {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const [activeStatus, setActiveStatus] = useState<DeliveryStatusKey>('failed');
  const active = totals.find((item) => item.key === activeStatus) ?? totals[0] ?? null;
  const hasTrendData = trendData.some((item) => item.failed > 0 || item.sent > 0);

  useEffect(() => {
    const preferredStatus = totals.find((item) => item.value > 0)?.key ?? (hasTrendData ? (trendData.some((item) => item.failed > 0) ? 'failed' : 'sent') : totals[0]?.key);
    if (preferredStatus && !totals.some((item) => item.key === activeStatus && (item.value > 0 || hasTrendData))) {
      setActiveStatus(preferredStatus);
    }
  }, [activeStatus, hasTrendData, totals, trendData]);

  return (
    <Card className="overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-0">
      <div className="flex flex-col items-stretch border-b border-white/10 xl:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-5 py-4">
          <h2 className="text-sm font-semibold text-white/82">{title}</h2>
          <p className="text-xs leading-5 text-white/45">{deliveryStatusDescription(lang)}</p>
        </div>

        {totals.length > 0 && (
          <div className="grid grid-cols-2 border-t border-white/10 xl:flex xl:border-l xl:border-t-0">
            {totals.map((item) => {
              const selected = active?.key === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveStatus(item.key)}
                  className={`flex min-w-[7.25rem] flex-col justify-center gap-1 border-l border-white/10 px-4 py-3 text-left transition first:border-l-0 hover:bg-white/[0.045] focus:outline-none focus:ring-2 focus:ring-emerald-300/35 ${selected ? 'bg-white/[0.065]' : ''}`}
                  aria-pressed={selected}
                >
                  <span className="inline-flex items-center gap-2 text-xs text-white/55">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                  <span className="text-xl font-semibold leading-none text-white">{item.value.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-2 py-5 sm:p-6">
        {!hasTrendData || !active ? (
          <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-4 text-center text-sm text-white/50">
            {emptyText}
          </div>
        ) : (
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 16, right: 18, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickFormatter={(value) => formatTrendTick(String(value), locale)} />
                <YAxis tick={{ fill: 'var(--chart-axis-muted)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<DeliveryStatusTooltip activeStatus={active} locale={locale} />} cursor={{ stroke: 'var(--chart-grid)', strokeWidth: 1 }} />
                <Line type="monotone" dataKey={active.key} name={active.label} stroke={active.color} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: active.color, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

function CampaignsByStatusRadarCard({ data, emptyText, lang, title }: { data: CampaignStatusPoint[]; emptyText: string; lang: string; title: string }) {
  const hasData = data.some((item) => item.count > 0);

  return (
    <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-5">
      <div className="mb-4 space-y-1">
        <h2 className="text-sm font-semibold text-white/82">{title}</h2>
        <p className="text-xs leading-5 text-white/45">{campaignStatusDescription(lang)}</p>
      </div>

      {!hasData ? (
        <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-4 text-center text-sm text-white/50">
          {emptyText}
        </div>
      ) : (
        <div className="mx-auto h-[270px] max-w-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data} margin={{ top: 24, right: 28, bottom: 24, left: 28 }}>
              <Tooltip content={<CampaignStatusTooltip />} cursor={false} />
              <PolarAngleAxis dataKey="status" tick={(props) => <CampaignStatusTick {...props} data={data} />} />
              <PolarGrid stroke="var(--chart-grid)" radialLines />
              <Radar dataKey="count" name={campaignStatusSeriesLabel(lang)} fill="#5ed29c" stroke="#5ed29c" fillOpacity={0.38} strokeWidth={2.25} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function RecentDeliveryTrendAreaChart({
  data,
  emptyText,
  lang,
  onTimeRangeChange,
  timeRange,
  title,
}: {
  data: DeliveryTrendPoint[];
  emptyText: string;
  lang: string;
  onTimeRangeChange: (value: TrendRange) => void;
  timeRange: TrendRange;
  title: string;
}) {
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const filteredData = useMemo(() => filterTrendData(data, timeRange), [data, timeRange]);
  const hasSent = filteredData.some((item) => item.sent > 0);
  const hasFailed = filteredData.some((item) => item.failed > 0);
  const hasData = hasSent || hasFailed;
  const options = trendRangeOptions(lang);

  return (
    <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.026))] p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white/82">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-white/45">{trendDescription(lang, hasFailed)}</p>
        </div>
        <AppSelect value={timeRange} options={options} onChange={onTimeRangeChange} className="min-w-[9.5rem] sm:w-[10rem]" />
      </div>

      {!hasData ? (
        <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10 px-4 text-center text-sm text-white/50">
          {emptyText}
        </div>
      ) : (
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="emailTrendSentFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#5ed29c" stopOpacity={0.7} />
                  <stop offset="95%" stopColor="#5ed29c" stopOpacity={0.08} />
                </linearGradient>
                <linearGradient id="emailTrendFailedFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fb7185" stopOpacity={0.58} />
                  <stop offset="95%" stopColor="#fb7185" stopOpacity={0.06} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} tickFormatter={(value) => formatTrendTick(String(value), locale)} />
              <YAxis tick={{ fill: 'var(--chart-axis-muted)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<DeliveryTrendTooltip locale={locale} />} cursor={{ stroke: 'var(--chart-grid)', strokeWidth: 1 }} />
              {hasFailed && <Area dataKey="failed" name={trendFailedLabel(lang)} type="natural" fill="url(#emailTrendFailedFill)" stroke="#fb7185" strokeWidth={2} stackId={hasSent ? 'delivery' : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />}
              {hasSent && <Area dataKey="sent" name={trendSentLabel(lang)} type="natural" fill="url(#emailTrendSentFill)" stroke="#5ed29c" strokeWidth={2} stackId={hasFailed ? 'delivery' : undefined} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />}
              {hasSent && hasFailed ? <Legend verticalAlign="bottom" height={28} content={<DeliveryTrendLegend />} /> : null}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function DeliveryStatusTooltip({ active, label, locale, payload, activeStatus }: { active?: boolean; label?: string; locale: string; payload?: Array<{ value?: number }>; activeStatus: DeliveryStatusTotal | null }) {
  if (!active || !payload?.length || !activeStatus) return null;
  const value = payload.find((item) => typeof item.value === 'number')?.value;
  if (typeof value !== 'number') return null;
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2 text-xs shadow-2xl shadow-black/20 backdrop-blur">
      <p className="font-semibold text-[var(--app-foreground)]">{formatTrendTooltipLabel(label ?? '', locale)}</p>
      <p className="mt-1 inline-flex items-center gap-2 text-[var(--app-muted-foreground)]">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeStatus.color }} />
        <span>{activeStatus.label}</span>
        <span className="font-semibold text-[var(--app-foreground)]">{value.toLocaleString()}</span>
      </p>
    </div>
  );
}

function CampaignStatusTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; payload?: CampaignStatusPoint }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const value = item.payload?.count ?? item.value;
  if (typeof value !== 'number') return null;
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2 text-xs shadow-2xl shadow-black/20 backdrop-blur">
      <p className="font-semibold text-[var(--app-foreground)]">{item.payload?.status ?? label}</p>
      <p className="mt-1 text-accent">{value.toLocaleString()}</p>
    </div>
  );
}

function CampaignStatusTick({ x, y, textAnchor, index, data }: { x?: number; y?: number; textAnchor?: 'start' | 'middle' | 'end' | 'inherit'; index?: number; data: CampaignStatusPoint[] }) {
  const item = typeof index === 'number' ? data[index] : null;
  if (!item || typeof x !== 'number' || typeof y !== 'number') return null;
  return (
    <text x={x} y={y} textAnchor={textAnchor} className="fill-[var(--app-foreground)] text-[11px] font-medium">
      <tspan x={x}>{item.count.toLocaleString()}</tspan>
      <tspan x={x} dy="1rem" className="fill-[var(--app-muted-foreground)] text-[10px]">
        {item.status}
      </tspan>
    </text>
  );
}

function DeliveryTrendTooltip({ active, payload, label, locale }: { active?: boolean; payload?: Array<{ color?: string; name?: string; value?: number }>; label?: string; locale: string }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => typeof item.value === 'number');
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-elevated)] px-3 py-2 text-xs shadow-2xl shadow-black/20 backdrop-blur">
      <p className="font-semibold text-[var(--app-foreground)]">{formatTrendTooltipLabel(label ?? '', locale)}</p>
      <div className="mt-2 space-y-1.5">
        {rows.map((item) => (
          <div key={item.name} className="flex min-w-28 items-center justify-between gap-4 text-[var(--app-muted-foreground)]">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color ?? '#5ed29c' }} />
              {item.name}
            </span>
            <span className="font-semibold text-[var(--app-foreground)]">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeliveryTrendLegend({ payload }: { payload?: Array<{ color?: string; value?: string }> }) {
  if (!payload?.length) return null;
  return (
    <div className="flex justify-center gap-4 pt-2 text-xs text-white/55">
      {payload.map((item) => (
        <span key={item.value} className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color ?? '#5ed29c' }} />
          {item.value}
        </span>
      ))}
    </div>
  );
}

function filterTrendData(data: DeliveryTrendPoint[], timeRange: TrendRange) {
  const dated = data
    .map((item) => ({ item, date: trendDate(item.date) }))
    .filter((entry): entry is { item: DeliveryTrendPoint; date: Date } => Boolean(entry.date));
  if (!dated.length) return data;
  const referenceDate = new Date(Math.max(...dated.map((entry) => entry.date.getTime())));
  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const startDate = new Date(referenceDate);
  startDate.setDate(startDate.getDate() - days);
  return dated.filter((entry) => entry.date >= startDate).map((entry) => entry.item);
}

function trendDate(value: string) {
  const monthDay = value.match(/^(\d{2})-(\d{2})$/);
  if (monthDay) {
    const year = new Date().getFullYear();
    const date = new Date(year, Number(monthDay[1]) - 1, Number(monthDay[2]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTrendTick(value: string, locale: string) {
  const date = trendDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
}

function formatTrendTooltipLabel(value: string, locale: string) {
  const date = trendDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
}

function trendRangeOptions(lang: string) {
  return [
    { value: '7d' as const, label: lang === 'fr' ? '7 derniers jours' : 'Last 7 days' },
    { value: '30d' as const, label: lang === 'fr' ? '30 derniers jours' : 'Last 30 days' },
    { value: '90d' as const, label: lang === 'fr' ? '90 derniers jours' : 'Last 90 days' },
  ];
}

function trendDescription(lang: string, hasFailed: boolean) {
  if (lang === 'fr') return hasFailed ? 'Destinataires envoyés et échoués au fil du temps.' : 'Destinataires envoyés au fil du temps.';
  return hasFailed ? 'Sent and failed recipients over time.' : 'Sent recipients over time.';
}

function emailTrendEmptyText(lang: string) {
  return lang === 'fr' ? 'Aucune activité d’envoi pour le moment.' : 'No delivery activity yet.';
}

function trendSentLabel(lang: string) {
  return lang === 'fr' ? 'Envoyés' : 'Sent';
}

function trendFailedLabel(lang: string) {
  return lang === 'fr' ? 'Échecs' : 'Failed';
}

function deliveryStatusDescription(lang: string) {
  return lang === 'fr' ? 'Résultats d’envoi par statut.' : 'Delivery outcomes by status.';
}

function deliveryStatusEmptyText(lang: string) {
  return lang === 'fr' ? 'Aucune donnée de statut d’envoi pour le moment.' : 'No delivery status data yet.';
}

function deliveryStatusColor(status: string, index: number) {
  const colors: Record<string, string> = {
    SENT: '#5ed29c',
    FAILED: '#fb7185',
    QUEUED: '#67e8f9',
    SENDING: '#fbbf24',
    PENDING: '#a78bfa',
    CANCELED: '#94a3b8',
  };
  const fallback = ['#5ed29c', '#67e8f9', '#a78bfa', '#fbbf24', '#fb7185', '#93c5fd'];
  return colors[status] ?? fallback[index % fallback.length];
}

function campaignStatusDescription(lang: string) {
  return lang === 'fr' ? 'Totaux des campagnes regroupés par statut actuel.' : 'Campaign totals grouped by current status.';
}

function campaignStatusEmptyText(lang: string) {
  return lang === 'fr' ? 'Aucune donnée de statut de campagne pour le moment.' : 'No campaign status data yet.';
}

function campaignStatusSeriesLabel(lang: string) {
  return lang === 'fr' ? 'Campagnes' : 'Campaigns';
}

function emailStatusTone(status: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (status === 'SENT') return 'good';
  if (status === 'FAILED') return 'bad';
  if (status === 'PARTIAL' || status === 'SENDING' || status === 'QUEUED') return 'warn';
  return 'neutral';
}

function emailStatusLabel(t: ReturnType<typeof useI18n>['t'], status: string) {
  const labels: Record<string, string> = { QUEUED: t.admin.emailStatusQueued, SENDING: t.admin.emailStatusSending, SENT: t.admin.emailStatusSent, FAILED: t.admin.emailStatusFailed, PARTIAL: t.admin.emailStatusPartial, PENDING: t.admin.emailStatusPending, CANCELED: t.admin.emailStatusCanceled };
  return labels[status] ?? status;
}

function emailTypeLabel(t: ReturnType<typeof useI18n>['t'], type: string) {
  const labels: Record<string, string> = { TEST: t.admin.emailTypeTest, PASSWORD_RESET: t.admin.emailTypePasswordReset, ANNOUNCEMENT: t.admin.emailTypeAnnouncement, EVENT_ATTENDEES: t.admin.emailTypeEventAttendees, PASSPORT_EXPIRATION: t.admin.emailTypePassportExpiration, TASK_BOARD_AUTOMATION_DUE_BEFORE: t.admin.emailTypeAutomation, TASK_BOARD_AUTOMATION_OVERDUE: t.admin.emailTypeAutomation, TASK_BOARD_AUTOMATION_TEST: t.admin.emailTypeAutomationTest };
  return labels[type] ?? type;
}

function isTrendRange(value: string | null): value is TrendRange {
  return value === '7d' || value === '30d' || value === '90d' || value === 'this_month' || value === 'last_month' || value === 'all';
}

function emailRangeOptions(t: ReturnType<typeof useI18n>['t']): Array<{ value: TrendRange; label: string }> {
  return [
    { value: '7d', label: t.admin.emailRangeLast7Days },
    { value: '30d', label: t.admin.emailRangeLast30Days },
    { value: '90d', label: t.admin.emailRangeLast90Days },
    { value: 'this_month', label: t.admin.emailRangeThisMonth },
    { value: 'last_month', label: t.admin.emailRangeLastMonth },
    { value: 'all', label: t.admin.emailRangeAllTime },
  ];
}
