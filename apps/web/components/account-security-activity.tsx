'use client';

import { Clock3, Download, Laptop, LogOut, ShieldAlert, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiDownload, apiFetch, isApiRequestError } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { AppSelect } from './app-select';
import { Button, Card, LoadingButton, TableErrorState, TableSkeleton } from './ui';
import { isStepUpCancellation, useStepUpAuthentication } from './step-up-authentication-dialog';

type AccountSession = {
  id: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  browser: string;
  operatingSystem: string;
  ipAddress: string;
  country: string;
  createdIpAddress: string;
  createdCountry: string;
  authenticationMethod: string;
};

type SecurityActivityItem = {
  id: string;
  eventType: string;
  result: 'SUCCESS' | 'FAILURE';
  occurredAt: string;
  ipAddress: string;
  country: string;
  browser: string;
  operatingSystem: string;
  authenticationMethod: string | null;
};

type ActivityResponse = {
  items: SecurityActivityItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  retentionDays: number;
};

type ExportRange = '7' | '30' | '90' | '180' | 'custom';

export function AccountSecurityActivity() {
  const { lang, t } = useI18n();
  const stepUp = useStepUpAuthentication();
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [busy, setBusy] = useState<string>('');
  const [revokePending, setRevokePending] = useState(false);
  const revokePendingRef = useRef(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');
  const [page, setPage] = useState(1);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

  const loadSessions = useCallback(async () => {
    setSessionsError(false);
    try {
      const response = await apiFetch<{ sessions: AccountSession[] }>('/auth/sessions');
      setSessions(response.sessions);
    } catch {
      setSessionsError(true);
    }
  }, []);

  const loadActivity = useCallback(async (requestedPage: number) => {
    setActivityError(false);
    try {
      setActivity(await apiFetch<ActivityResponse>(`/auth/security-activity?page=${requestedPage}&pageSize=10`));
    } catch {
      setActivityError(true);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void loadActivity(page);
  }, [loadActivity, page]);

  async function revoke(path: string, busyKey: string) {
    if (revokePendingRef.current) return;
    revokePendingRef.current = true;
    setRevokePending(true);
    try {
      await stepUp.run(async () => {
        setBusy(busyKey);
        try {
          await apiFetch(path, { method: 'DELETE' });
        } finally {
          setBusy('');
        }
      });
      await Promise.all([loadSessions(), loadActivity(1)]);
      setPage(1);
      toast.success(t.security.sessionRevoked);
    } catch (error) {
      if (!isStepUpCancellation(error)) toast.error(t.security.sessionRevokeFailed);
    } finally {
      setBusy('');
      revokePendingRef.current = false;
      setRevokePending(false);
    }
  }

  async function exportActivity(range: ExportRange, from: string, to: string) {
    if (revokePendingRef.current) return;
    revokePendingRef.current = true;
    setRevokePending(true);
    setExportError('');
    const query = new URLSearchParams({ range, format: 'csv' });
    if (range === 'custom') {
      if (!from || !to) {
        setExportError(t.security.securityLogsRangeInvalid);
        revokePendingRef.current = false;
        setRevokePending(false);
        return;
      }
      query.set('from', `${from}T00:00:00.000Z`);
      query.set('to', to === utcDatePart(new Date()) ? new Date().toISOString() : `${to}T23:59:59.999Z`);
    }
    try {
      const download = await stepUp.run(async () => {
        setExportLoading(true);
        try {
          return await apiDownload(`/auth/security-activity/export?${query.toString()}`);
        } finally {
          setExportLoading(false);
        }
      });
      saveDownload(download.blob, download.filename ?? 'pe-community-security-activity.csv');
      setExportOpen(false);
      setPage(1);
      await loadActivity(1);
      toast.success(t.security.securityLogsExported);
    } catch (error) {
      if (!isStepUpCancellation(error)) {
        setExportError(
          isApiRequestError(error, 413, 'SECURITY_EXPORT_TOO_LARGE')
            ? t.security.securityLogsTooLarge
            : isApiRequestError(error, 400, 'SECURITY_EXPORT_INVALID_RANGE') || isApiRequestError(error, 400, 'SECURITY_EXPORT_INVALID_FORMAT')
              ? t.security.securityLogsRangeInvalid
              : t.security.securityLogsExportFailed,
        );
      }
    } finally {
      setExportLoading(false);
      revokePendingRef.current = false;
      setRevokePending(false);
    }
  }

  const otherSessionCount = sessions?.filter((session) => !session.current).length ?? 0;

  return (
    <div className="space-y-5">
      <Card className="min-w-0 overflow-hidden rounded-[1.35rem] border-white/[0.08] bg-white/[0.035] p-0">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-5 sm:flex-row sm:items-start sm:justify-between md:px-6">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-white md:text-lg"><Laptop size={18} className="text-emerald-300" />{t.security.activeSessions}</h2>
            <p className="mt-2 text-sm leading-6 text-white/48">{t.security.activeSessionsDescription}</p>
          </div>
          <LoadingButton
            loading={busy === 'others'}
            loadingLabel={t.security.signingOutOtherSessions}
            disabled={!otherSessionCount || revokePending}
            onClick={() => revoke('/auth/sessions/others', 'others')}
            className="shrink-0 bg-white/[0.07] text-white hover:bg-white/[0.11]"
          >
            <LogOut size={15} />{t.security.signOutOtherSessions}
          </LoadingButton>
        </div>
        <div className="p-5 md:p-6">
          {sessionsError ? (
            <TableErrorState title={t.security.sessionsLoadFailed} retryLabel={t.common.retry} onRetry={() => void loadSessions()} />
          ) : !sessions ? (
            <TableSkeleton rows={2} columns={1} />
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {sessions.map((session) => (
                <div key={session.id} className="flex min-w-0 flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{t.security.deviceOnOperatingSystem(session.browser, session.operatingSystem)}</p>
                      {session.current && <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">{t.security.currentSession}</span>}
                    </div>
                    <p className="mt-1 text-sm text-white/55">{session.country} · <span className="break-all font-mono text-xs text-white/68">{session.ipAddress}</span></p>
                    <p className="mt-1 text-xs text-white/38">{session.current ? t.security.activeNow : t.security.lastActiveAt(formatDate(session.lastSeenAt, locale))} · {t.security.authenticationMethod}: {session.authenticationMethod}</p>
                    {(session.createdIpAddress !== session.ipAddress || session.createdCountry !== session.country) && (
                      <p className="mt-1 text-xs text-white/34">{t.security.sessionCreatedFrom(session.createdCountry, session.createdIpAddress)}</p>
                    )}
                  </div>
                  {!session.current && (
                    <LoadingButton
                      loading={busy === session.id}
                      loadingLabel={t.security.revokingSession}
                      disabled={revokePending}
                      onClick={() => revoke(`/auth/sessions/${encodeURIComponent(session.id)}`, session.id)}
                      className="self-start bg-white/[0.07] text-white hover:bg-white/[0.11] sm:self-center"
                    >
                      {t.security.revokeSession}
                    </LoadingButton>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="min-w-0 overflow-hidden rounded-[1.35rem] border-white/[0.08] bg-white/[0.035] p-0">
        <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-5 sm:flex-row sm:items-start sm:justify-between md:px-6">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-white md:text-lg"><ShieldAlert size={18} className="text-emerald-300" />{t.security.recentSecurityActivity}</h2>
            <p className="mt-2 text-sm leading-6 text-white/48">{t.security.recentSecurityActivityDescription}</p>
          </div>
          <Button disabled={revokePending} onClick={() => { setExportError(''); setExportOpen(true); }} className="shrink-0 bg-white/[0.07] text-white hover:bg-white/[0.11]"><Download size={15} />{t.security.exportLogs}</Button>
        </div>
        <div className="p-5 md:p-6">
          {activityError ? (
            <TableErrorState title={t.security.securityActivityLoadFailed} retryLabel={t.common.retry} onRetry={() => void loadActivity(page)} />
          ) : !activity ? (
            <TableSkeleton rows={4} columns={1} />
          ) : !activity.items.length ? (
            <p className="py-8 text-center text-sm text-white/48">{t.security.noSecurityActivity}</p>
          ) : (
            <>
              <div className="divide-y divide-white/[0.06]">
                {activity.items.map((item) => (
                  <div key={item.id} className="py-4 first:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-semibold text-white">{t.security.securityEventLabel(item.eventType)}</p>
                      <span className={`text-xs font-semibold ${item.result === 'SUCCESS' ? 'text-emerald-300' : 'text-amber-200'}`}>{item.result === 'SUCCESS' ? t.security.success : t.security.unsuccessful}</span>
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-white/40"><Clock3 size={13} />{formatDate(item.occurredAt, locale)}</p>
                    <p className="mt-2 text-sm text-white/54">{t.security.deviceOnOperatingSystem(item.browser, item.operatingSystem)}</p>
                    <p className="mt-1 text-sm text-white/54">{item.country} · <span className="break-all font-mono text-xs text-white/68">{item.ipAddress}</span>{item.authenticationMethod ? ` · ${item.authenticationMethod}` : ''}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
                <Button disabled={activity.pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="bg-white/[0.07] text-white hover:bg-white/[0.11]">{t.common.previous}</Button>
                <span className="text-xs text-white/42">{t.security.activityPage(activity.pagination.page, activity.pagination.totalPages)}</span>
                <Button disabled={activity.pagination.page >= activity.pagination.totalPages} onClick={() => setPage((current) => current + 1)} className="bg-white/[0.07] text-white hover:bg-white/[0.11]">{t.common.next}</Button>
              </div>
            </>
          )}
        </div>
      </Card>
      <SecurityActivityExportDialog
        open={exportOpen}
        retentionDays={activity?.retentionDays ?? 180}
        loading={exportLoading}
        protectedActionPending={revokePending}
        error={exportError}
        onClose={() => { if (!exportLoading && !revokePending) setExportOpen(false); }}
        onExport={(range, from, to) => void exportActivity(range, from, to)}
      />
      {stepUp.dialog}
    </div>
  );
}

function SecurityActivityExportDialog({
  open,
  retentionDays,
  loading,
  protectedActionPending,
  error,
  onClose,
  onExport,
}: {
  open: boolean;
  retentionDays: number;
  loading: boolean;
  protectedActionPending: boolean;
  error: string;
  onClose: () => void;
  onExport: (range: ExportRange, from: string, to: string) => void;
}) {
  const { t } = useI18n();
  const [range, setRange] = useState<ExportRange>('30');
  const [from, setFrom] = useState(() => utcDatePart(new Date(Date.now() - 29 * 24 * 60 * 60 * 1_000)));
  const [to, setTo] = useState(() => utcDatePart(new Date()));
  const closeRef = useRef<HTMLButtonElement>(null);
  const maximumDate = utcDatePart(new Date());
  const minimumDate = utcDatePart(new Date(Date.now() - Math.max(0, retentionDays - 1) * 24 * 60 * 60 * 1_000));
  const options = [
    { value: '7' as const, label: t.security.last7Days, days: 7 },
    { value: '30' as const, label: t.security.last30Days, days: 30 },
    { value: '90' as const, label: t.security.last90Days, days: 90 },
    { value: '180' as const, label: t.security.last180Days, days: 180 },
    { value: 'custom' as const, label: t.security.customRange, days: 0 },
  ].filter((option) => option.value === 'custom' || option.days <= retentionDays).map(({ value, label }) => ({ value, label }));

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !protectedActionPending) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, protectedActionPending, onClose]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] grid h-dvh place-items-center p-4">
      <button type="button" aria-label={t.common.close} onClick={onClose} disabled={protectedActionPending} className="absolute inset-0 h-full w-full bg-[var(--app-overlay)]" />
      <section role="dialog" aria-modal="true" aria-labelledby="security-export-title" className="relative w-full max-w-md rounded-2xl border border-[var(--app-border)] bg-[var(--app-dialog)] p-5 text-[var(--app-foreground)] shadow-2xl shadow-black/50 sm:p-6">
        <button ref={closeRef} type="button" onClick={onClose} disabled={protectedActionPending} aria-label={t.common.close} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-[var(--app-muted-foreground)] hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-foreground)] disabled:opacity-40"><X size={17} /></button>
        <h2 id="security-export-title" className="pr-12 text-lg font-semibold">{t.security.exportSecurityLogs}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--app-muted-foreground)]">{t.security.securityHistoryRetentionNotice}</p>
        <div className="mt-5 space-y-4">
          <AppSelect value={range} onChange={setRange} options={options} label={t.security.timeRange} disabled={protectedActionPending} />
          {range === 'custom' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-sm font-medium">{t.security.from}</span><input type="date" value={from} min={minimumDate} max={maximumDate} disabled={protectedActionPending} onChange={(event) => setFrom(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm outline-none focus:border-emerald-300/50" /></label>
              <label className="block"><span className="text-sm font-medium">{t.security.to}</span><input type="date" value={to} min={minimumDate} max={maximumDate} disabled={protectedActionPending} onChange={(event) => setTo(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm outline-none focus:border-emerald-300/50" /></label>
            </div>
          )}
          <div><span className="text-sm font-medium">{t.security.exportFormat}</span><div className="mt-2 flex h-11 items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 text-sm">{t.security.csvFormat}</div></div>
          {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-[var(--app-border)] pt-4 sm:flex-row sm:justify-end">
          <Button type="button" onClick={onClose} disabled={protectedActionPending} className="bg-[var(--app-panel-muted)] text-[var(--app-foreground)]">{t.common.cancel}</Button>
          <LoadingButton type="button" loading={loading} loadingLabel={t.security.exportingLogs} disabled={protectedActionPending && !loading} onClick={() => onExport(range, from, to)}><Download size={15} />{t.security.export}</LoadingButton>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function utcDatePart(value: Date) {
  return value.toISOString().slice(0, 10);
}

function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
