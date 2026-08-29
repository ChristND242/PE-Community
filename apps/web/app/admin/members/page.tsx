'use client';

import { ArrowUpDown, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppSelect } from '../../../components/app-select';
import { IdentityVerificationBadge } from '../../../components/identity-verification-badge';
import { AppShell } from '../../../components/shell';
import { ProfilePhoto } from '../../../components/profile-photo';
import { Card, DataTablePagination, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { identityVerificationForRole } from '../../../lib/identity-verification';
import { statusLabel, useI18n } from '../../../lib/i18n';
import { userRoleLabel } from '../../../lib/user-role';
import { formatDate } from '../../../lib/utils';

type Member = {
  id: string;
  status: string;
  joinedAt: string;
  role: { name: string; key: string };
  user: { name: string; email: string; createdAt: string };
  profile?: { title?: string; avatarUrl?: string | null; dicebearStyle?: string | null; dicebearSeed?: string | null; location?: string };
};

type SortKey = 'name' | 'email' | 'role' | 'status' | 'joinedAt';

const pageSizes = [5, 10, 20, 50];

export default function MembersPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<Member[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('joinedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  async function load() {
    setError('');
    try {
      setData(await apiFetch<Member[]>(`/admin/${COMMUNITY_ID}/members`));
    } catch {
      setError(t.common.error);
    }
  }

  useEffect(() => {
    load();
  }, [t.common.error]);

  // Client-side table state for the first admin slice. The API still returns real data only;
  // this can move server-side later by mapping these controls to query params.
  const sortedMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = (data ?? []).filter((member) => {
      const haystack = `${member.user.name} ${member.user.email}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
    return [...filtered].sort((a, b) => {
      const values: Record<SortKey, [string | number, string | number]> = {
        name: [a.user.name, b.user.name],
        email: [a.user.email, b.user.email],
        role: [userRoleLabel(t, a.role.key), userRoleLabel(t, b.role.key)],
        status: [statusLabel(t, a.status), statusLabel(t, b.status)],
        joinedAt: [new Date(a.joinedAt ?? a.user.createdAt).getTime(), new Date(b.joinedAt ?? b.user.createdAt).getTime()],
      };
      const [left, right] = values[sortKey];
      const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
      return sortDirection === 'asc' ? result : -result;
    });
  }, [data, query, sortDirection, sortKey, t]);

  const total = sortedMembers.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const pageRows = sortedMembers.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(nextKey: SortKey) {
    setPage(1);
    if (nextKey === sortKey) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(nextKey);
      setSortDirection(nextKey === 'joinedAt' ? 'desc' : 'asc');
    }
  }

  return (
    <AppShell admin>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.admin.membersTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.admin.membersSubtitle}</p>
        </header>

        <Card className="overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-0 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t.admin.searchMembers} className="w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-accent/60" />
            </label>
            <AppSelect
              value={sortKey}
              label={t.admin.sortBy}
              options={[
                { value: 'name', label: t.admin.sortName },
                { value: 'email', label: t.admin.sortEmail },
                { value: 'role', label: t.admin.sortRole },
                { value: 'status', label: t.admin.sortStatus },
                { value: 'joinedAt', label: t.admin.sortJoined },
              ]}
              onChange={(value) => { setSortKey(value); setPage(1); }}
            />
          </div>

          {error ? (
            <div className="p-4"><TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} /></div>
          ) : !data ? (
            <div className="p-4"><TableSkeleton rows={5} columns={7} /></div>
          ) : pageRows.length === 0 ? (
            <div className="p-4"><TableEmptyState title={query ? t.admin.noMatchingMembers : t.admin.noMembers} description={query ? t.admin.searchMembers : undefined} /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42">
                    <tr>
                      <SortableHeader label={t.admin.tableName} active={sortKey === 'name'} onClick={() => toggleSort('name')} />
                      <SortableHeader label={t.admin.tableEmail} active={sortKey === 'email'} onClick={() => toggleSort('email')} />
                      <SortableHeader label={t.admin.tableRole} active={sortKey === 'role'} onClick={() => toggleSort('role')} />
                      <SortableHeader label={t.admin.tableStatus} active={sortKey === 'status'} onClick={() => toggleSort('status')} />
                      <th className="px-4 py-3 font-medium">{t.admin.tableProfile}</th>
                      <SortableHeader label={t.admin.tableJoined} active={sortKey === 'joinedAt'} onClick={() => toggleSort('joinedAt')} />
                      <th className="px-4 py-3 font-medium">{t.admin.tableActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {pageRows.map((member) => (
                      <tr key={member.id} className="transition hover:bg-white/[0.025]">
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <ProfilePhoto name={member.user.name} avatarUrl={member.profile?.avatarUrl} dicebearStyle={member.profile?.dicebearStyle} dicebearSeed={member.profile?.dicebearSeed} size="sm" />
                            <span className="flex min-w-0 items-center gap-1.5 font-medium text-white"><span className="truncate">{member.user.name}</span><IdentityVerificationBadge kind={identityVerificationForRole(member.role.key)} size="sm" /></span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-white/58">{member.user.email}</td>
                        <td className="px-4 py-4"><StatusBadge>{userRoleLabel(t, member.role.key)}</StatusBadge></td>
                        <td className="px-4 py-4"><StatusBadge tone={member.status === 'ACTIVE' ? 'good' : member.status === 'PENDING' ? 'warn' : 'bad'}>{statusLabel(t, member.status)}</StatusBadge></td>
                        <td className="px-4 py-4 text-white/58">{member.profile?.location ?? member.profile?.title ?? t.admin.memberProfileFallback}</td>
                        <td className="px-4 py-4 text-white/58">{formatDate(member.joinedAt ?? member.user.createdAt, lang === 'fr' ? 'fr-FR' : 'en-US')}</td>
                        <td className="px-4 py-4">
                          <Link href={`/admin/members/${member.id}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent">
                            {t.admin.viewDetails}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DataTablePagination page={safePage} pageSize={pageSize} pageSizeOptions={pageSizes} total={total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(start, end, total)} onPageChange={setPage} onPageSizeChange={(next) => { setPageSize(next); setPage(1); }} />
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function SortableHeader({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className="px-4 py-3 font-medium">
      <button onClick={onClick} className={`inline-flex items-center gap-2 transition hover:text-white ${active ? 'text-accent' : ''}`}>
        {label}
        <ArrowUpDown size={13} />
      </button>
    </th>
  );
}
