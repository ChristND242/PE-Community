'use client';

import { LayoutList, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppSelect } from '../../../components/app-select';
import { ProfilePhoto } from '../../../components/profile-photo';
import { AppShell } from '../../../components/shell';
import {
  Card,
  DataTablePagination,
  StatusBadge,
  TableEmptyState,
  TableErrorState,
  TableSkeleton,
} from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { formatDate } from '../../../lib/utils';

type Board = {
  id: string;
  name: string;
  description?: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  linkedEvent?: { id: string; title: string; startsAt?: string | null } | null;
  createdAt: string;
  updatedAt: string;
  memberRole: 'ASSIGNED' | 'VIEWER';
  taskCounts: {
    total: number;
    assignedToMe: number;
    todo: number;
    inProgress: number;
    done: number;
    overdue: number;
    dueSoon: number;
  };
  checklistProgress: { completed: number; total: number };
  assignees: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
    dicebearStyle?: string | null;
    dicebearSeed?: string | null;
  }>;
};
type Response = {
  items: Board[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  metrics: {
    assignedBoards: number;
    publicBoards: number;
    dueSoon: number;
    overdue: number;
  };
};

export default function MemberTaskBoardsPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState('updatedAt');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setError(false);
    try {
      const params = new URLSearchParams({
        q: query,
        scope,
        status,
        sort,
        direction: sort === 'name' ? 'asc' : 'desc',
        page: String(page),
        pageSize: String(pageSize),
      });
      setData(
        await apiFetch<Response>(
          `/communities/${COMMUNITY_ID}/task-boards?${params}`,
        ),
      );
    } catch {
      setError(true);
    }
  }, [page, pageSize, query, scope, sort, status]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {t.dashboard.taskBoards}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
            {t.dashboard.taskBoardsDescription}
          </p>
        </header>
        {data && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label={t.dashboard.assignedBoards}
              value={data.metrics.assignedBoards}
            />
            <Metric
              label={t.dashboard.publicBoards}
              value={data.metrics.publicBoards}
            />
            <Metric
              label={t.common.dueSoon}
              value={data.metrics.dueSoon}
              tone={data.metrics.dueSoon ? 'warn' : undefined}
            />
            <Metric
              label={t.common.overdue}
              value={data.metrics.overdue}
              tone={data.metrics.overdue ? 'bad' : undefined}
            />
          </div>
        )}
        <Card className="rounded-xl p-0">
          <div className="flex flex-col gap-3 border-b border-white/10 p-4 xl:flex-row xl:items-center">
            <label className="relative min-w-0 flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35"
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder={t.common.search}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent/50"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <AppSelect
                value={scope}
                options={[
                  { value: 'ALL', label: t.common.all },
                  { value: 'ASSIGNED_TO_ME', label: t.dashboard.assignedToMe },
                  { value: 'PUBLIC', label: t.admin.publicVisibility },
                  { value: 'EVENT_LINKED', label: t.admin.eventLinked },
                  { value: 'STANDALONE', label: t.admin.standalone },
                ]}
                onChange={(next) => {
                  setScope(next);
                  setPage(1);
                }}
              />
              <AppSelect
                value={status}
                options={[
                  { value: 'ALL', label: t.common.all },
                  { value: 'TODO', label: t.dashboard.eventTaskTodo },
                  {
                    value: 'IN_PROGRESS',
                    label: t.dashboard.eventTaskInProgress,
                  },
                  { value: 'DONE', label: t.dashboard.eventTaskDone },
                  { value: 'AT_RISK', label: t.admin.planningAtRisk },
                ]}
                onChange={(next) => {
                  setStatus(next);
                  setPage(1);
                }}
              />
              <AppSelect
                value={sort}
                options={[
                  { value: 'updatedAt', label: t.admin.sortUpdated },
                  { value: 'name', label: t.admin.boardName },
                  { value: 'progress', label: t.admin.boardProgress },
                  { value: 'dueDate', label: t.admin.eventTaskDueDate },
                ]}
                onChange={setSort}
              />
            </div>
          </div>
          {error ? (
            <div className="p-4">
              <TableErrorState
                title={t.dashboard.taskBoardsLoadFailed}
                retryLabel={t.common.retry}
                onRetry={load}
              />
            </div>
          ) : !data ? (
            <div className="p-4">
              <TableSkeleton rows={5} columns={7} />
            </div>
          ) : data.items.length === 0 ? (
            <div className="p-6">
              <TableEmptyState
                title={t.dashboard.noTaskBoards}
                description={t.dashboard.noTaskBoardsDescription}
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-[0.1em] text-white/38">
                    <tr>
                      <th className="px-4 py-3">{t.admin.taskBoard}</th>
                      <th className="px-4 py-3">{t.common.status}</th>
                      <th className="px-4 py-3">{t.admin.boardProgress}</th>
                      <th className="px-4 py-3">{t.dashboard.assignedToMe}</th>
                      <th className="px-4 py-3">{t.admin.eventTaskAssignee}</th>
                      <th className="px-4 py-3">{t.admin.sortUpdated}</th>
                      <th className="px-4 py-3">{t.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.07]">
                    {data.items.map((board) => (
                      <tr key={board.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-white/82">
                            {board.name}
                          </p>
                          <div className="mt-1 flex gap-2 text-[10px] text-white/35">
                            <span>
                              {board.linkedEvent
                                ? t.admin.eventLinked
                                : t.admin.standalone}
                            </span>
                            <span>·</span>
                            <span>
                              {board.visibility === 'PUBLIC'
                                ? t.admin.publicVisibility
                                : t.admin.privateVisibility}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge
                            tone={
                              board.memberRole === 'ASSIGNED'
                                ? 'good'
                                : 'neutral'
                            }
                          >
                            {board.memberRole === 'ASSIGNED'
                              ? t.dashboard.assigned
                              : t.dashboard.viewer}
                          </StatusBadge>
                          {board.taskCounts.overdue > 0 ? (
                            <p className="mt-1 text-[10px] text-rose-200">
                              {board.taskCounts.overdue} {t.common.overdue}
                            </p>
                          ) : board.taskCounts.dueSoon > 0 ? (
                            <p className="mt-1 text-[10px] text-amber-200">
                              {board.taskCounts.dueSoon} {t.common.dueSoon}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-xs text-white/55">
                            {board.taskCounts.done}/{board.taskCounts.total}{' '}
                            {t.admin.tasksDone}
                          </p>
                          <div className="mt-2 h-1 w-28 overflow-hidden rounded-full bg-white/[0.07]">
                            <span
                              className="block h-full rounded-full bg-accent/70"
                              style={{
                                width: `${board.taskCounts.total ? Math.round((board.taskCounts.done / board.taskCounts.total) * 100) : 0}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-white/50">
                          {board.taskCounts.assignedToMe}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex -space-x-2">
                            {board.assignees.slice(0, 2).map((assignee) => (
                              <span key={assignee.id} title={assignee.name}>
                                <ProfilePhoto
                                  name={assignee.name}
                                  avatarUrl={assignee.avatarUrl}
                                  dicebearStyle={assignee.dicebearStyle}
                                  dicebearSeed={assignee.dicebearSeed}
                                  size="sm"
                                  className="h-8 w-8 rounded-full border-2 border-[#07100c] text-[10px]"
                                />
                              </span>
                            ))}
                            {board.assignees.length > 2 && (
                              <span
                                title={board.assignees
                                  .slice(2)
                                  .map((item) => item.name)
                                  .join(', ')}
                                className="grid h-8 w-8 place-items-center rounded-full border-2 border-[#07100c] bg-white/[0.08] text-[10px] text-white/65"
                              >
                                +{board.assignees.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-white/45">
                          {formatDate(
                            board.updatedAt,
                            lang === 'fr' ? 'fr-FR' : 'en-US',
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <Link
                            href={`/dashboard/task-boards/${board.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-emerald-200"
                          >
                            <LayoutList size={13} />
                            {t.dashboard.viewBoard}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DataTablePagination
                page={data.pagination.page}
                pageSize={data.pagination.pageSize}
                pageSizeOptions={[5, 10, 20, 50]}
                total={data.pagination.total}
                previousLabel={t.common.previous}
                nextLabel={t.common.next}
                rowsPerPageLabel={t.common.rowsPerPage}
                showingLabel={t.admin.showingRange(
                  (data.pagination.page - 1) * data.pagination.pageSize + 1,
                  Math.min(
                    data.pagination.total,
                    data.pagination.page * data.pagination.pageSize,
                  ),
                  data.pagination.total,
                )}
                onPageChange={setPage}
                onPageSizeChange={(next) => {
                  setPageSize(next);
                  setPage(1);
                }}
              />
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'warn' | 'bad';
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <p
        className={`text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-rose-200' : tone === 'warn' ? 'text-amber-200' : 'text-white'}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-white/38">{label}</p>
    </div>
  );
}
