'use client';

import { ArrowLeft, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../../components/shell';
import {
  TaskBoardOverview,
  type TaskBoardOverviewData,
} from '../../../../components/task-board-overview';
import {
  Card,
  StatusBadge,
  TableEmptyState,
  TableErrorState,
  TableSkeleton,
} from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { useEventTaskRealtime } from '../../../../hooks/use-event-task-realtime';
import { useI18n } from '../../../../lib/i18n';
import { MemberEventTasks } from '../../events/[id]/event-tasks';

type Board = {
  id: string;
  name: string;
  description?: string | null;
  visibility: 'PRIVATE' | 'PUBLIC';
  linkedEvent?: { id: string; title: string; startsAt?: string | null } | null;
  memberRole: 'ASSIGNED' | 'VIEWER';
  taskCounts: {
    total: number;
    assignedToMe: number;
    done: number;
    overdue: number;
    dueSoon: number;
  };
  checklistProgress: { completed: number; total: number };
  overview: TaskBoardOverviewData;
};

export default function MemberTaskBoardDetailPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState(false);
  const section = searchParams.get('taskId') || searchParams.get('section') === 'board' ? 'board' : 'overview';
  function selectSection(nextSection: 'overview' | 'board') {
    const next = new URLSearchParams(searchParams.toString()); next.set('section', nextSection);
    if (nextSection !== 'board') { next.delete('taskId'); next.delete('tab'); }
    router.replace(`/dashboard/task-boards/${boardId}?${next.toString()}`, { scroll: false });
  }
  const load = useCallback(async () => {
    setError(false);
    try {
      setBoard(
        await apiFetch<Board>(
          `/communities/${COMMUNITY_ID}/task-boards/${boardId}`,
        ),
      );
    } catch {
      setError(true);
    }
  }, [boardId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEventTaskRealtime(board?.linkedEvent?.id ?? '', () => {
    void load();
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          href="/dashboard/task-boards"
          className="inline-flex items-center gap-2 text-sm font-semibold text-white/50 hover:text-accent"
        >
          <ArrowLeft size={14} />
          {t.dashboard.taskBoards}
        </Link>
        {error ? (
          <TableErrorState
            title={t.dashboard.taskBoardLoadFailed}
            retryLabel={t.common.retry}
            onRetry={load}
          />
        ) : !board ? (
          <TableSkeleton rows={5} columns={2} />
        ) : (
          <>
            <header className="rounded-xl border border-white/[0.08] bg-[#07100c] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent/70">
                    {t.admin.taskBoard}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold text-white">
                    {board.name}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-white/45">
                    {board.description || t.dashboard.taskBoardsDescription}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    tone={board.memberRole === 'ASSIGNED' ? 'good' : 'neutral'}
                  >
                    {board.memberRole === 'ASSIGNED'
                      ? t.dashboard.assigned
                      : t.dashboard.viewer}
                  </StatusBadge>
                  <StatusBadge
                    tone={board.visibility === 'PUBLIC' ? 'good' : 'neutral'}
                  >
                    {board.visibility === 'PUBLIC'
                      ? t.admin.publicVisibility
                      : t.admin.privateVisibility}
                  </StatusBadge>
                  <StatusBadge tone="neutral">
                    {board.linkedEvent
                      ? t.admin.eventLinked
                      : t.admin.standalone}
                  </StatusBadge>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-white/45">
                <span>
                  {t.admin.boardProgress}: {board.taskCounts.done}/
                  {board.taskCounts.total}
                </span>
                <span>
                  {t.dashboard.assignedToMe}: {board.taskCounts.assignedToMe}
                </span>
                <span>
                  {t.admin.checklistProgress}:{' '}
                  {board.checklistProgress.completed}/
                  {board.checklistProgress.total}
                </span>
                {board.taskCounts.overdue > 0 && (
                  <span className="text-rose-200">
                    {board.taskCounts.overdue} {t.common.overdue}
                  </span>
                )}
                {board.taskCounts.dueSoon > 0 && (
                  <span className="text-amber-200">
                    {board.taskCounts.dueSoon} {t.common.dueSoon}
                  </span>
                )}
              </div>
              {board.linkedEvent && (
                <Link
                  href={`/dashboard/events/${board.linkedEvent.id}`}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-accent hover:text-emerald-200"
                >
                  <CalendarDays size={14} />
                  {t.admin.linkedEvent}: {board.linkedEvent.title}
                </Link>
              )}
            </header>
            <nav className="flex overflow-x-auto border-b border-white/[0.08]" aria-label={t.admin.taskBoard}><BoardTab active={section === 'overview'} onClick={() => selectSection('overview')}>{t.admin.boardOverviewTab}</BoardTab><BoardTab active={section === 'board'} onClick={() => selectSection('board')}>{t.admin.boardBoardTab}</BoardTab></nav>
            {section === 'overview' && <TaskBoardOverview
              overview={board.overview}
              mode="member"
              memberRole={board.memberRole}
              onOpenTask={(taskId, tab) =>
                router.push(
                  `/dashboard/task-boards/${board.id}?section=board&taskId=${encodeURIComponent(taskId)}&tab=${tab}`,
                  { scroll: false },
                )
              }
            />}
            {section === 'board' && (board.linkedEvent ? (
              <MemberEventTasks eventId={board.linkedEvent.id} />
            ) : (
              <Card className="rounded-xl">
                <TableEmptyState
                  title={t.dashboard.noBoardTasks}
                  description={t.dashboard.noBoardTasksDescription}
                />
              </Card>
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}

function BoardTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent/30 ${active ? 'border-accent bg-accent/[0.06] text-accent' : 'border-transparent text-white/45 hover:text-white/75'}`}>{children}</button>; }
