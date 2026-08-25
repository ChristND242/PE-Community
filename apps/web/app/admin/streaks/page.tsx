'use client';

import { Activity, Award, Crown, Flame, RefreshCw, RotateCcw, Search, ShieldAlert, Trophy, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../components/app-select';
import { AppShell } from '../../../components/shell';
import { ProfilePhoto } from '../../../components/profile-photo';
import { Card, DataTablePagination, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { userRoleLabel } from '../../../lib/user-role';

type StreakStatus = 'ACTIVE_TODAY' | 'AT_RISK' | 'LOST' | 'NO_STREAK';
type Leader = { userId: string; displayName: string; avatarUrl?: string | null; currentStreak: number; longestStreak: number };
type AvatarFields = { avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null };
type LeaderboardRow = AvatarFields & {
  rank: number | null;
  userId: string;
  displayName: string;
  role: string;
  currentStreak: number;
  longestStreak: number;
  lastActiveDay: string | null;
  status: StreakStatus;
};
type AtRiskRow = Pick<LeaderboardRow, 'userId' | 'displayName' | 'role' | 'avatarUrl' | 'dicebearStyle' | 'dicebearSeed' | 'currentStreak' | 'lastActiveDay'>;
type StreakEvent = {
  id: string;
  userId: string;
  displayName: string;
  role: string;
  type: string;
  loginDate: string;
  previousCurrentStreak: number;
  newCurrentStreak: number;
  previousLongestStreak: number;
  newLongestStreak: number;
};
type StreakAudit = {
  summary: { activeToday: number; rankedUsers: number; averageCurrentStreak: number; longestActiveStreak: number; atRiskCount: number; resetsRecently: number };
  board: { leader: Leader | null; totalRankedUsers: number };
  leaderboard: LeaderboardRow[];
  atRisk: AtRiskRow[];
  events: StreakEvent[];
};

const pageSizes = [10, 25, 50];

export default function AdminStreakAuditPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<StreakAudit | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StreakStatus | 'ALL'>('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

  async function load(notifyOnFailure = false) {
    if (notifyOnFailure) setRefreshing(true);
    else setError('');
    try {
      setData(await apiFetch<StreakAudit>(`/admin/${COMMUNITY_ID}/streaks`));
    } catch {
      if (notifyOnFailure) toast.error(t.admin.streakLoadFailed);
      else setError(t.admin.streakLoadFailed);
    } finally {
      if (notifyOnFailure) setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, [t.admin.streakLoadFailed]);

  const roleOptions = useMemo(() => Array.from(new Set((data?.leaderboard ?? []).map((row) => row.role))).sort(), [data]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (data?.leaderboard ?? []).filter((row) => {
      const matchesQuery = row.displayName.toLocaleLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
      const matchesRole = roleFilter === 'ALL' || row.role === roleFilter;
      return matchesQuery && matchesStatus && matchesRole;
    });
  }, [data, query, roleFilter, statusFilter]);
  const total = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <AppShell admin>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">{t.admin.streakAuditTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.streakAuditSubtitle}</p>
          </div>
          <LoadingButton loading={refreshing} loadingLabel={t.admin.streakRefreshing} onClick={() => load(true)} disabled={refreshing} className="cursor-pointer gap-2 bg-white/10 text-white hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-emerald-300/40">
            <RefreshCw size={16} />
            {t.common.refresh}
          </LoadingButton>
        </header>

        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={() => load()} />
        ) : !data ? (
          <div className="space-y-5"><TableSkeleton rows={4} columns={4} /><TableSkeleton rows={6} columns={7} /></div>
        ) : (
          <>
            <CommunityStreakBoard data={data} t={t} />
            <HealthStrip data={data} locale={locale} t={t} />

            <Card className="overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-0 shadow-2xl shadow-black/25">
              <div className="border-b border-white/10 p-5">
                <h2 className="text-base font-semibold text-white">{t.admin.streakLeaderboard}</h2>
                <p className="mt-1 text-sm leading-6 text-white/50">{t.admin.streakLeaderboardDescription}</p>
                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
                  <label className="relative block min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} />
                    <input
                      value={query}
                      onChange={(event) => { setQuery(event.target.value); setPage(1); }}
                      placeholder={t.admin.streakSearchMembers}
                      className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-emerald-300/50 focus-visible:ring-2 focus-visible:ring-emerald-300/20"
                    />
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <AppSelect
                      value={statusFilter}
                      label={t.admin.streakStatus}
                      options={[
                        { value: 'ALL', label: t.admin.streakAllStatuses },
                        { value: 'ACTIVE_TODAY', label: t.admin.streakStatusActiveToday },
                        { value: 'AT_RISK', label: t.admin.streakStatusAtRisk },
                        { value: 'LOST', label: t.admin.streakStatusLost },
                        { value: 'NO_STREAK', label: t.admin.streakStatusNoStreak },
                      ]}
                      onChange={(value) => { setStatusFilter(value as StreakStatus | 'ALL'); setPage(1); }}
                    />
                    <AppSelect
                      value={roleFilter}
                      label={t.common.role}
                      options={[{ value: 'ALL', label: t.admin.streakAllRoles }, ...roleOptions.map((role) => ({ value: role, label: userRoleLabel(t, role) }))]}
                      onChange={(value) => { setRoleFilter(value); setPage(1); }}
                    />
                  </div>
                </div>
              </div>

              {pageRows.length === 0 ? (
                <div className="p-5"><TableEmptyState title={t.admin.streakNoLeaderboard} /></div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase text-white/42">
                        <tr>
                          <th className="px-4 py-3 font-medium">{t.admin.streakRank}</th>
                          <th className="px-4 py-3 font-medium">{t.admin.streakMember}</th>
                          <th className="px-4 py-3 font-medium">{t.common.role}</th>
                          <th className="px-4 py-3 font-medium">{t.admin.streakCurrent}</th>
                          <th className="px-4 py-3 font-medium">{t.admin.streakBest}</th>
                          <th className="px-4 py-3 font-medium">{t.admin.streakLastActiveDay}</th>
                          <th className="px-4 py-3 font-medium">{t.admin.streakStatus}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {pageRows.map((row) => (
                          <tr key={row.userId} className="transition hover:bg-white/[0.03]">
                            <td className="px-4 py-4"><RankBadge rank={row.rank} /></td>
                            <td className="px-4 py-4">
                              <div className="flex min-w-0 items-center gap-3">
                                <ProfilePhoto name={row.displayName} avatarUrl={row.avatarUrl} dicebearStyle={row.dicebearStyle} dicebearSeed={row.dicebearSeed} size="sm" alt={row.displayName} className="h-10 w-10" />
                                <span className="truncate font-semibold text-white">{row.displayName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-white/58">{userRoleLabel(t, row.role)}</td>
                            <td className="px-4 py-4 font-semibold text-white">{t.admin.streakDays(row.currentStreak)}</td>
                            <td className="px-4 py-4 text-white/65">{t.admin.streakDays(row.longestStreak)}</td>
                            <td className="px-4 py-4 text-white/58">{formatDayKey(row.lastActiveDay, locale)}</td>
                            <td className="px-4 py-4"><StreakStatusBadge status={row.status} t={t} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <DataTablePagination page={safePage} pageSize={pageSize} pageSizeOptions={pageSizes} total={total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(start, end, total)} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />
                </>
              )}
            </Card>

            <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
              <AtRiskSection rows={data.atRisk} locale={locale} t={t} />
              <StreakEventsSection events={data.events} locale={locale} t={t} />
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function CommunityStreakBoard({ data, t }: { data: StreakAudit; t: ReturnType<typeof useI18n>['t'] }) {
  const leader = data.board.leader;
  const items = [
    { key: 'active', title: t.admin.streakActiveToday, value: data.summary.activeToday, caption: t.admin.streakUsersLoggedToday(data.summary.activeToday), Icon: Flame, tone: 'app-status-warning', valueTone: 'app-text-warning' },
    { key: 'ranked', title: t.admin.streakRankedUsers, value: data.summary.rankedUsers, caption: t.admin.streakRankedUsersCount(data.summary.rankedUsers), Icon: Users, tone: 'app-status-info', valueTone: 'app-text-info' },
    { key: 'leader', title: t.admin.streakCurrentLeader, value: leader ? t.admin.streakDays(leader.currentStreak) : '—', caption: leader?.displayName ?? t.admin.streakNoLeader, Icon: Crown, tone: 'app-status-warning', valueTone: 'app-text-warning' },
    { key: 'longest', title: t.admin.streakLongestActive, value: t.admin.streakDays(data.summary.longestActiveStreak), caption: t.admin.streakLongestActiveDescription, Icon: Trophy, tone: 'app-status-success', valueTone: 'app-text-success' },
  ];
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-emerald-300/15 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_32%),linear-gradient(135deg,rgba(2,6,23,0.97),rgba(6,78,59,0.42))] shadow-2xl shadow-black/20">
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:38px_38px]" />
      <div className="relative border-b border-white/10 px-6 py-5">
        <h2 className="text-lg font-semibold text-white">{t.admin.streakCommunityBoard}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-white/55">{t.admin.streakCommunityBoardSubtitle}</p>
      </div>
      <div className="relative grid md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className={`group relative min-h-[185px] border-b border-white/10 p-6 transition-colors hover:bg-white/[0.04] md:odd:border-r md:[&:nth-child(n+3)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0 ${item.key === 'leader' ? 'bg-amber-200/[0.025]' : ''}`}>
            <span className={`absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full border transition motion-safe:group-hover:scale-105 ${item.tone}`}><item.Icon size={19} /></span>
            <div className="flex min-h-[137px] flex-col pr-12">
              <p className="text-sm font-semibold text-white/58">{item.title}</p>
              <p className={`mt-7 text-4xl font-semibold tabular-nums ${item.valueTone}`}>{item.value}</p>
              <p className="mt-auto pt-4 text-sm leading-5 text-white/50">{item.caption}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HealthStrip({ data, locale, t }: { data: StreakAudit; locale: string; t: ReturnType<typeof useI18n>['t'] }) {
  const items = [
    { title: t.admin.streakAverage, value: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(data.summary.averageCurrentStreak), caption: t.admin.streakAverageDescription, Icon: Activity, tone: 'text-cyan-200' },
    { title: t.admin.streakAtRisk, value: data.summary.atRiskCount, caption: t.admin.streakAtRiskCount(data.summary.atRiskCount), Icon: ShieldAlert, tone: 'app-text-warning' },
    { title: t.admin.streakResetsRecently, value: data.summary.resetsRecently, caption: t.admin.streakRecentResetCount(data.summary.resetsRecently), Icon: RotateCcw, tone: 'app-text-danger' },
  ];
  return (
    <section className="grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-xl shadow-black/10 md:grid-cols-3">
      {items.map((item) => (
        <div key={item.title} className="flex min-h-[125px] items-start gap-4 border-b border-white/10 p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.055] ${item.tone}`}><item.Icon size={16} /></span>
          <div><p className="text-sm font-medium text-white/55">{item.title}</p><p className="mt-1 text-2xl font-semibold text-white">{item.value}</p><p className="mt-2 text-xs leading-5 text-white/42">{item.caption}</p></div>
        </div>
      ))}
    </section>
  );
}

function AtRiskSection({ rows, locale, t }: { rows: AtRiskRow[]; locale: string; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <Card className="rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(251,191,36,0.05),rgba(255,255,255,0.025))] p-0 shadow-xl shadow-black/15">
      <div className="border-b border-white/10 p-5"><h2 className="text-base font-semibold text-white">{t.admin.streakAtRisk}</h2><p className="mt-1 text-sm leading-6 text-white/50">{t.admin.streakAtRiskDescription}</p></div>
      {rows.length === 0 ? <div className="p-5"><TableEmptyState title={t.admin.streakNoAtRisk} /></div> : (
        <div className="divide-y divide-white/10">
          {rows.map((row) => (
            <div key={row.userId} className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.025]">
              <ProfilePhoto name={row.displayName} avatarUrl={row.avatarUrl} dicebearStyle={row.dicebearStyle} dicebearSeed={row.dicebearSeed} size="sm" alt={row.displayName} className="h-10 w-10" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{row.displayName}</p><p className="mt-1 text-xs text-white/42">{userRoleLabel(t, row.role)} · {formatDayKey(row.lastActiveDay, locale)}</p></div>
              <span className="app-text-warning shrink-0 text-sm font-semibold">{t.admin.streakDays(row.currentStreak)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StreakEventsSection({ events, locale, t }: { events: StreakEvent[]; locale: string; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <Card className="overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-0 shadow-xl shadow-black/15">
      <div className="border-b border-white/10 p-5"><h2 className="text-base font-semibold text-white">{t.admin.streakEvents}</h2><p className="mt-1 text-sm leading-6 text-white/50">{t.admin.streakEventsDescription}</p></div>
      {events.length === 0 ? <div className="p-5"><TableEmptyState title={t.admin.streakNoEvents} /></div> : (
        <div className="max-h-[440px] overflow-y-auto">
          <div className="divide-y divide-white/10">
            {events.map((event) => {
              const bestChanged = event.previousLongestStreak !== event.newLongestStreak;
              return (
                <div key={event.id} className="grid gap-3 px-5 py-4 transition hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-white">{event.displayName}</p><StatusBadge tone={event.type === 'RESET' ? 'bad' : event.type === 'INCREMENTED' ? 'good' : 'neutral'}>{streakEventLabel(event.type, t)}</StatusBadge></div><p className="mt-1 text-xs text-white/42">{userRoleLabel(t, event.role)} · {formatDayKey(event.loginDate, locale)}</p></div>
                  <div className="text-left sm:text-right"><p className="text-sm font-semibold text-white">{event.previousCurrentStreak} → {event.newCurrentStreak}</p><p className="mt-1 text-xs text-white/42">{t.admin.streakChange}{bestChanged ? ` · ${t.admin.streakBestChange}: ${event.previousLongestStreak} → ${event.newLongestStreak}` : ''}</p></div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function RankBadge({ rank }: { rank: number | null }) {
  return <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-semibold ${rank && rank <= 3 ? 'border-amber-300/25 bg-amber-300/10 text-amber-100' : 'border-white/10 bg-white/[0.035] text-white/58'}`}>{rank ? `#${rank}` : '—'}</span>;
}

function StreakStatusBadge({ status, t }: { status: StreakStatus; t: ReturnType<typeof useI18n>['t'] }) {
  const labels = { ACTIVE_TODAY: t.admin.streakStatusActiveToday, AT_RISK: t.admin.streakStatusAtRisk, LOST: t.admin.streakStatusLost, NO_STREAK: t.admin.streakStatusNoStreak };
  const tones = { ACTIVE_TODAY: 'good', AT_RISK: 'warn', LOST: 'bad', NO_STREAK: 'neutral' } as const;
  return <StatusBadge tone={tones[status]}>{labels[status]}</StatusBadge>;
}

function streakEventLabel(type: string, t: ReturnType<typeof useI18n>['t']) {
  if (type === 'CREATED') return t.admin.streakEventCreated;
  if (type === 'INCREMENTED') return t.admin.streakEventIncremented;
  if (type === 'RESET') return t.admin.streakEventReset;
  if (type === 'BEST_UPDATED') return t.admin.streakEventBestUpdated;
  return t.admin.streakEventSameDay;
}

function formatDayKey(value: string | null, locale: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}
