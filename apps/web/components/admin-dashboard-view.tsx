'use client';

import { Activity, CalendarDays, ClipboardList, Megaphone, ShieldAlert, Users, UserCheck, Waves } from 'lucide-react';
import { useMemo } from 'react';
import { DonutChart, VerticalBarChart } from './charts';
import { Card, EmptyState } from './ui';
import { auditLabel, statusLabel, useI18n } from '../lib/i18n';
import { formatDashboardDate } from '../lib/utils';

export type AdminDashboardChartDatum = { label: string; value: number };

export type AdminDashboardViewModel = {
  metrics: {
    totalMembers?: number;
    activeMembers: number;
    suspendedMembers?: number;
    pendingRegistrations: number;
    recentRsvps?: number;
    announcements: number;
    upcomingEvents: number;
    recentAdminActions?: number;
  };
  charts: {
    membersByStatus: AdminDashboardChartDatum[];
    registrationPipeline: AdminDashboardChartDatum[];
    eventRsvps: AdminDashboardChartDatum[];
    recentAdminActivity?: AdminDashboardChartDatum[];
  };
  recentActivity: { id: string; action: string; targetType: string; createdAt: string }[];
};

export function AdminDashboardView({ data, feedback, locale, timeZone, presentation = 'application' }: { data: AdminDashboardViewModel; feedback?: React.ReactNode; locale?: 'en' | 'fr'; timeZone?: string; presentation?: 'application' | 'marketing-preview' }) {
  const { lang, t, timezone } = useI18n();
  const dashboardLanguage = locale ?? lang;
  const dashboardLocale = dashboardLanguage === 'fr' ? 'fr-FR' : 'en-US';
  const dashboardTimeZone = timeZone ?? timezone;
  const compact = presentation === 'marketing-preview';
  const translatedCharts = useMemo(() => ({
    membersByStatus: data.charts.membersByStatus.map((item) => ({ ...item, label: statusLabel(t, item.label) })),
    registrationPipeline: data.charts.registrationPipeline.map((item) => ({ ...item, label: statusLabel(t, item.label) })),
    eventRsvps: data.charts.eventRsvps,
    recentAdminActivity: (data.charts.recentAdminActivity ?? []).map((item) => ({ ...item, label: activityChartLabel(t, item.label), tooltipLabel: auditLabel(t, item.label) })),
  }), [data, t]);
  const metrics = [
    { label: t.admin.totalMembers, value: data.metrics.totalMembers ?? data.metrics.activeMembers, detail: t.admin.totalMembersInsight(data.metrics.totalMembers ?? data.metrics.activeMembers), icon: Users },
    { label: t.admin.activeMembers, value: data.metrics.activeMembers, detail: t.admin.memberStatusInsight(data.metrics.activeMembers), icon: UserCheck },
    { label: t.admin.pendingRegistrations, value: data.metrics.pendingRegistrations, detail: t.admin.pendingInsight(data.metrics.pendingRegistrations), icon: ClipboardList },
    { label: t.admin.suspendedMembers, value: data.metrics.suspendedMembers ?? 0, detail: t.admin.suspendedInsight(data.metrics.suspendedMembers ?? 0), icon: ShieldAlert },
    { label: t.admin.upcomingEvents, value: data.metrics.upcomingEvents, detail: t.admin.eventInsight(data.metrics.upcomingEvents), icon: CalendarDays },
    { label: t.admin.recentRsvps, value: data.metrics.recentRsvps ?? 0, detail: t.admin.rsvpInsight(data.metrics.recentRsvps ?? 0), icon: Waves },
    { label: t.admin.recentAnnouncements, value: data.metrics.announcements, detail: t.admin.announcementInsight(data.metrics.announcements), icon: Megaphone },
    { label: t.admin.recentAdminActions, value: data.metrics.recentAdminActions ?? data.recentActivity.length, detail: t.admin.actionInsight(data.metrics.recentAdminActions ?? data.recentActivity.length), icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <AdminDashboardHeader />
      {feedback}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-0 shadow-2xl shadow-black/25">
            <div className="flex flex-col gap-1 border-b border-white/10 px-5 py-4">
              <h2 className="text-base font-semibold text-white">{t.admin.chartOverview}</h2>
              <p className="text-sm text-white/50">{t.admin.chartDescription}</p>
            </div>
            <div className={`grid min-w-0 ${compact ? 'grid-cols-1' : 'lg:grid-cols-2'}`}>
              <ChartPanel title={t.admin.membersByStatus} compact={compact}>
                <DonutChart data={translatedCharts.membersByStatus} emptyText={t.admin.noChartData} compact={compact} />
              </ChartPanel>
              <ChartPanel title={t.admin.registrationPipeline} divided compact={compact}>
                <DonutChart data={translatedCharts.registrationPipeline} emptyText={t.admin.noChartData} compact={compact} />
              </ChartPanel>
            </div>
          </Card>

          <div className={`grid gap-5 ${compact ? 'grid-cols-1' : 'lg:grid-cols-2'}`}>
            <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.026))] p-5 shadow-2xl shadow-black/20">
              <SectionTitle title={t.admin.eventRsvpCounts} legend={t.charts.legendRsvps} />
              <VerticalBarChart data={translatedCharts.eventRsvps} emptyText={t.admin.noChartData} height={210} />
            </Card>
            <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.052),rgba(255,255,255,0.026))] p-5 shadow-2xl shadow-black/20">
              <SectionTitle title={t.admin.recentActivityChart} legend={t.charts.legendActions} />
              <VerticalBarChart data={translatedCharts.recentAdminActivity} emptyText={t.common.noRecentActivity} height={210} />
            </Card>
          </div>
        </div>

        <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-5 shadow-2xl shadow-black/25">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white">{t.admin.activityPanel}</h2>
              <p className="mt-1 text-sm leading-5 text-white/50">{t.admin.activityPanelDescription}</p>
            </div>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">{data.recentActivity.length}</span>
          </div>
          {data.recentActivity.length ? (
            <div className="mt-5 space-y-3">
              {data.recentActivity.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/15 p-4 transition hover:border-white/15 hover:bg-white/[0.035]">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 rounded-full bg-accent shadow-[0_0_18px_rgba(94,210,156,0.5)]" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-white">{auditLabel(t, item.action)}</p>
                      <p className="mt-1 text-xs text-white/42">{formatDashboardDate(item.createdAt, dashboardLocale, dashboardTimeZone)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5"><EmptyState text={t.common.noRecentActivity} /></div>
          )}
        </Card>
      </section>
    </div>
  );
}

export function AdminDashboardHeader() {
  const { t } = useI18n();
  return (
    <header className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent/90">{t.admin.operations}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.admin.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.subtitle}</p>
      </div>
    </header>
  );
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: React.ComponentType<{ size?: number; className?: string }> }) {
  return (
    <Card className="group rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.026))] p-4 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-white/15 hover:shadow-2xl hover:shadow-black/25">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/58">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <span className="rounded-xl border border-accent/18 bg-accent/10 p-2 text-accent transition group-hover:bg-accent/15"><Icon size={17} /></span>
      </div>
      <p className="mt-3 min-h-10 text-xs leading-5 text-white/42">{detail}</p>
    </Card>
  );
}

function ChartPanel({ title, divided, compact = false, children }: { title: string; divided?: boolean; compact?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 overflow-hidden p-5 ${divided ? compact ? 'border-t border-white/10' : 'border-t border-white/10 lg:border-l lg:border-t-0' : ''}`}>
      <SectionTitle title={title} />
      {children}
    </div>
  );
}

function activityChartLabel(t: ReturnType<typeof useI18n>['t'], action: string) {
  if (action.startsWith('registration.')) return t.nav.registrations;
  if (action.startsWith('announcement.')) return t.nav.announcements;
  if (action.startsWith('settings.')) return t.nav.settings;
  if (action.startsWith('email.')) return t.nav.emailAudit;
  return auditLabel(t, action);
}

function SectionTitle({ title, legend }: { title: string; legend?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-sm font-semibold text-white/78">{title}</h3>
      {legend && <span className="rounded-full bg-white/[0.055] px-2.5 py-1 text-[11px] font-medium text-white/45">{legend}</span>}
    </div>
  );
}
