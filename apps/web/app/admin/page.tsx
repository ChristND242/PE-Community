'use client';

import { useEffect, useState } from 'react';
import { AdminDashboardHeader, AdminDashboardView } from '../../components/admin-dashboard-view';
import type { AdminDashboardViewModel } from '../../components/admin-dashboard-view';
import { AppShell } from '../../components/shell';
import { apiFetch, COMMUNITY_ID } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

export default function AdminPage() {
  const { t } = useI18n();
  const [data, setData] = useState<AdminDashboardViewModel | null>(null);
  const [error, setError] = useState('');

  async function loadOverview() {
    setError('');
    try {
      setData(await apiFetch<AdminDashboardViewModel>(`/admin/${COMMUNITY_ID}/overview`));
    } catch {
      setError(t.admin.overviewFailed);
    }
  }

  useEffect(() => {
    loadOverview();
  }, [t.admin.overviewFailed]);

  return (
    <AppShell admin>
      {data ? (
        <AdminDashboardView data={data} feedback={error ? <DashboardError message={error} onRetry={loadOverview} retryLabel={t.admin.retry} /> : undefined} />
      ) : (
        <div className="space-y-6">
          <AdminDashboardHeader />
          {error && <DashboardError message={error} onRetry={loadOverview} retryLabel={t.admin.retry} />}
          <DashboardSkeleton label={t.admin.loadingOverview} />
        </div>
      )}
    </AppShell>
  );
}

function DashboardError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-4 text-sm text-rose-100 sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      <button onClick={onRetry} className="rounded-full border border-rose-200/20 px-3 py-1.5 text-xs font-semibold text-rose-50 transition hover:bg-rose-200/10">
        {retryLabel}
      </button>
    </div>
  );
}

function DashboardSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-5" aria-label={label}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="h-[340px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="h-[285px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />
            <div className="h-[285px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />
          </div>
        </div>
        <div className="h-[520px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />
      </div>
    </div>
  );
}
