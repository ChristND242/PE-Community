'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppSelect } from '../../../components/app-select';
import { AppShell } from '../../../components/shell';
import { ProfilePhoto } from '../../../components/profile-photo';
import { Card, DataTablePagination, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { userRoleLabel } from '../../../lib/user-role';
import { formatDate } from '../../../lib/utils';

type Member = {
  id: string;
  status: string;
  joinedAt: string;
  role: { key: string; name: string };
  user: { name: string; email: string; createdAt: string };
  profile?: { title?: string | null; avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null; location?: string | null; bio?: string | null; interests?: string[]; skills?: string[] } | null;
};

const pageSizes = [5, 10, 20, 50];

export default function MemberDirectoryPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<Member[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  async function load() {
    setError('');
    try {
      setData(await apiFetch<Member[]>(`/communities/${COMMUNITY_ID}/members`));
    } catch {
      setError(t.common.error);
    }
  }

  useEffect(() => {
    load();
  }, [t.common.error]);

  const roles = useMemo(() => Array.from(new Set((data ?? []).map((member) => member.role.key))), [data]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data ?? []).filter((member) => {
      const haystack = `${member.user.name} ${member.user.email} ${member.profile?.location ?? ''} ${member.profile?.title ?? ''}`.toLowerCase();
      return (role === 'all' || member.role.key === role) && haystack.includes(normalized);
    });
  }, [data, query, role]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.dashboard.memberDirectoryTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.dashboard.memberDirectorySubtitle}</p>
        </header>

        <Card className="overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-0">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t.dashboard.searchMembers} className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/60" />
            </label>
            <AppSelect
              value={role}
              label={t.dashboard.filterRole}
              options={[{ value: 'all', label: t.dashboard.allRoles }, ...roles.map((item) => ({ value: item, label: userRoleLabel(t, item) }))]}
              onChange={(value) => { setRole(value); setPage(1); }}
            />
          </div>

          {error ? (
            <div className="p-4"><TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /></div>
          ) : !data ? (
            <div className="p-4"><TableSkeleton rows={6} columns={3} /></div>
          ) : pageRows.length === 0 ? (
            <div className="p-4"><TableEmptyState title={query || role !== 'all' ? t.dashboard.noMatchingMembers : t.dashboard.noDirectoryMembers} /></div>
          ) : (
            <>
              <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                {pageRows.map((member) => (
                  <article key={member.id} className="rounded-2xl border border-white/10 bg-black/15 p-4 shadow-xl shadow-black/10 transition hover:border-accent/25 hover:bg-white/[0.045]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ProfilePhoto name={member.user.name} avatarUrl={member.profile?.avatarUrl} dicebearStyle={member.profile?.dicebearStyle} dicebearSeed={member.profile?.dicebearSeed} size="md" />
                        <div className="min-w-0">
                        <h2 className="truncate text-base font-semibold text-white">{member.user.name}</h2>
                        <p className="mt-1 truncate text-sm text-white/50">{member.profile?.title ?? member.profile?.location ?? member.user.email}</p>
                        </div>
                      </div>
                      <StatusBadge tone="good">{userRoleLabel(t, member.role.key)}</StatusBadge>
                    </div>
                    <p className="mt-4 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-white/58">{member.profile?.bio || t.dashboard.noBio}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-white/42">
                      <span>{t.dashboard.memberSince} {formatDate(member.joinedAt ?? member.user.createdAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</span>
                      <Link href={`/dashboard/members/${member.id}`} className="rounded-full border border-white/10 px-3 py-1.5 font-semibold text-white/70 transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent">
                        {t.dashboard.viewProfile}
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
              <DataTablePagination page={safePage} pageSize={pageSize} pageSizeOptions={pageSizes} total={total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(start, end, total)} onPageChange={setPage} onPageSizeChange={(next) => { setPageSize(next); setPage(1); }} />
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
