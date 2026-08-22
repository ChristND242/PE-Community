'use client';

import { ArrowLeft, Archive, CornerUpLeft, EyeOff, Heart, MessageCircle, Send, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppSelect } from '../../../../components/app-select';
import { ProfilePhoto } from '../../../../components/profile-photo';
import { AppShell } from '../../../../components/shell';
import { Card, ConfirmDialog, DataTablePagination, LoadingButton, StatusBadge, TableEmptyState, TableErrorState, TableSkeleton } from '../../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../../lib/api';
import { statusLabel, useI18n } from '../../../../lib/i18n';
import { userRoleLabel } from '../../../../lib/user-role';
import { formatDate } from '../../../../lib/utils';

type Announcement = { id: string; title: string; body: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; publishedAt?: string | null; updatedAt: string; createdAt: string };
type Recipient = { membershipId: string; name: string; email: string; role: string; status: 'read' | 'unread'; readAt?: string | null; createdAt?: string | null };
type Report = { announcement: Announcement; metrics: { totalActiveMembers: number; notificationsCreated: number; readCount: number; unreadCount: number; readRate: number; engagement: { likeCount: number; commentCount: number } }; recipients: Recipient[] };
type CurrentUser = { role: string };
type AnnouncementComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string | null; name: string; avatarUrl: string | null; dicebearStyle: string | null; dicebearSeed: string | null; mode: 'USER' | 'COMMUNITY_TEAM' };
  likeCount: number;
  viewerHasLiked: boolean;
  replies: AnnouncementComment[];
};

const pageSizes = [5, 10, 20, 50];

export default function AdminAnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { lang, t } = useI18n();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [confirming, setConfirming] = useState<'unpublish' | 'archive' | 'delete' | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [comments, setComments] = useState<AnnouncementComment[] | null>(null);
  const [commentsError, setCommentsError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentAsCommunityTeam, setCommentAsCommunityTeam] = useState(false);
  const [activeReplyId, setActiveReplyId] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [postingReply, setPostingReply] = useState(false);
  const [likingCommentId, setLikingCommentId] = useState('');
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [replyAsCommunityTeam, setReplyAsCommunityTeam] = useState(false);
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const viewerCanUseCommunityTeamIdentity = ['owner', 'admin'].includes(currentUser?.role.toLowerCase() ?? '');

  async function load() {
    setError('');
    try {
      setReport(await apiFetch<Report>(`/admin/${COMMUNITY_ID}/announcements/${id}/notification-report`));
    } catch {
      setError(t.admin.announcementReportLoadFailed);
    }
  }

  useEffect(() => { load(); }, [id, t.admin.announcementReportLoadFailed]);

  useEffect(() => {
    void apiFetch<CurrentUser>('/auth/me').then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  async function loadComments() {
    setComments(null);
    setCommentsError('');
    try {
      const response = await apiFetch<{ comments: AnnouncementComment[] }>(`/admin/${COMMUNITY_ID}/announcements/${id}/comments`);
      setComments(response.comments);
    } catch {
      setComments([]);
      setCommentsError(t.admin.announcementCommentsLoadFailed);
    }
  }

  useEffect(() => { void loadComments(); }, [id, t.admin.announcementCommentsLoadFailed]);

  useEffect(() => {
    if (!isCommentsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsCommentsOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isCommentsOpen]);

  function updateComment(commentId: string, update: (comment: AnnouncementComment) => AnnouncementComment) {
    setComments((current) => current?.map((comment) => {
      if (comment.id === commentId) return update(comment);
      return { ...comment, replies: comment.replies.map((reply) => reply.id === commentId ? update(reply) : reply) };
    }) ?? current);
  }

  async function toggleCommentLike(commentId: string) {
    if (likingCommentId) return;
    setLikingCommentId(commentId);
    try {
      const updated = await apiFetch<{ commentId: string; likeCount: number; viewerHasLiked: boolean }>(`/admin/${COMMUNITY_ID}/announcements/${id}/comments/${commentId}/like`, { method: 'POST' });
      updateComment(updated.commentId, (comment) => ({ ...comment, likeCount: updated.likeCount, viewerHasLiked: updated.viewerHasLiked }));
    } catch {
      toast.error(t.admin.announcementCommentLikeFailed);
    } finally {
      setLikingCommentId('');
    }
  }

  async function postReply(parentId: string) {
    if (postingReply || !replyBody.trim()) return;
    setPostingReply(true);
    try {
      const response = await apiFetch<{ comment: AnnouncementComment; commentCount: number; parentId: string }>(`/admin/${COMMUNITY_ID}/announcements/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: replyBody, parentId, authorMode: viewerCanUseCommunityTeamIdentity && replyAsCommunityTeam ? 'COMMUNITY_TEAM' : 'USER' }),
      });
      updateComment(parentId, (comment) => ({ ...comment, replies: [...comment.replies, response.comment] }));
      setReport((current) => current ? { ...current, metrics: { ...current.metrics, engagement: { ...current.metrics.engagement, commentCount: response.commentCount } } } : current);
      setReplyBody('');
      setActiveReplyId('');
      setReplyAsCommunityTeam(false);
    } catch {
      toast.error(t.admin.announcementReplyFailed);
    } finally {
      setPostingReply(false);
    }
  }

  async function postComment() {
    if (postingComment || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      const response = await apiFetch<{ comment: AnnouncementComment; commentCount: number }>(`/admin/${COMMUNITY_ID}/announcements/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          body: commentBody,
          authorMode: viewerCanUseCommunityTeamIdentity && commentAsCommunityTeam ? 'COMMUNITY_TEAM' : 'USER',
        }),
      });
      setComments((current) => [...(current ?? []), response.comment]);
      setReport((current) => current ? { ...current, metrics: { ...current.metrics, engagement: { ...current.metrics.engagement, commentCount: response.commentCount } } } : current);
      setCommentBody('');
      setCommentAsCommunityTeam(false);
    } catch {
      toast.error(t.dashboard.feedCommentPostFailed);
    } finally {
      setPostingComment(false);
    }
  }

  const recipients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (report?.recipients ?? []).filter((recipient) => {
      const matchesText = `${recipient.name} ${recipient.email}`.toLowerCase().includes(normalized);
      const matchesStatus = filter === 'all' || recipient.status === filter;
      return matchesText && matchesStatus;
    });
  }, [filter, query, report]);
  const total = recipients.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const pageRows = recipients.slice((safePage - 1) * pageSize, safePage * pageSize);

  async function action(nextAction: 'publish' | 'unpublish' | 'archive' | 'delete') {
    if (busyAction) return;
    setBusyAction(nextAction);
    try {
      const path = `/admin/${COMMUNITY_ID}/announcements/${id}${nextAction === 'delete' ? '' : `/${nextAction}`}`;
      await apiFetch(path, { method: nextAction === 'delete' ? 'DELETE' : 'POST' });
      if (nextAction === 'delete') {
        router.push('/admin/announcements');
        return;
      }
      toast.success(t.admin.announcementActionSuccess);
      setConfirming(null);
      await load();
    } catch {
      toast.error(t.admin.announcementActionFailed);
    } finally {
      setBusyAction('');
    }
  }

  const confirmTitle = confirming === 'delete' ? t.admin.deleteAnnouncementConfirmTitle : confirming === 'archive' ? t.admin.archiveAnnouncementConfirmTitle : t.admin.unpublishAnnouncementConfirmTitle;
  const confirmDescription = confirming === 'delete' ? t.admin.deleteAnnouncementConfirmDescription : confirming === 'archive' ? t.admin.archiveAnnouncementConfirmDescription : t.admin.unpublishAnnouncementConfirmDescription;

  return (
    <AppShell admin>
      <div className="space-y-6">
        <Link href="/admin/announcements" className="inline-flex items-center gap-2 text-sm font-semibold text-white/55 transition hover:text-accent"><ArrowLeft size={15} />{t.common.back}</Link>
        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        ) : !report ? (
          <TableSkeleton rows={7} columns={2} />
        ) : (
          <>
            <header className="rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.028))] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <StatusBadge tone={report.announcement.status === 'PUBLISHED' ? 'good' : report.announcement.status === 'DRAFT' ? 'warn' : 'neutral'}>{statusLabel(t, report.announcement.status)}</StatusBadge>
                  <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">{report.announcement.title}</h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60">{report.announcement.body}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
                  <button type="button" onClick={() => setIsCommentsOpen(true)} aria-label={t.dashboard.openFeedComments} title={t.admin.announcementComments} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 text-sm font-semibold text-white transition hover:border-emerald-300/30 hover:bg-emerald-300/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30">
                    <MessageCircle size={16} />
                    <span className="tabular-nums">{report.metrics.engagement.commentCount}</span>
                  </button>
                  {report.announcement.status !== 'PUBLISHED' && <LoadingButton loading={busyAction === 'publish'} loadingLabel={t.admin.publishingAnnouncement} onClick={() => action('publish')}><Send size={16} />{t.admin.publishAnnouncement}</LoadingButton>}
                  {report.announcement.status === 'PUBLISHED' && <LoadingButton loading={busyAction === 'unpublish'} className="bg-white/10 text-white hover:bg-white/15" onClick={() => setConfirming('unpublish')}><EyeOff size={16} />{t.admin.unpublishAnnouncement}</LoadingButton>}
                  {report.announcement.status !== 'ARCHIVED' && <LoadingButton loading={busyAction === 'archive'} className="bg-white/10 text-white hover:bg-white/15" onClick={() => setConfirming('archive')}><Archive size={16} />{t.admin.archiveAnnouncement}</LoadingButton>}
                  <LoadingButton loading={busyAction === 'delete'} className="bg-rose-300/15 text-rose-100 hover:bg-rose-300/20" onClick={() => setConfirming('delete')}><Trash2 size={16} />{t.admin.deleteAnnouncement}</LoadingButton>
                </div>
              </div>
            </header>

            <section className="grid gap-4 md:grid-cols-4">
              <Metric label={t.admin.totalTargeted} value={report.metrics.totalActiveMembers} />
              <Card className="rounded-2xl">
                <p className="text-sm text-white/55">{t.admin.engagement}</p>
                <div className="mt-3 flex items-center gap-5 text-2xl font-semibold text-white">
                  <span className="inline-flex items-center gap-2" title={t.admin.likesCountLabel(report.metrics.engagement.likeCount)}><Heart size={19} className="text-white/42" /><span className="tabular-nums">{report.metrics.engagement.likeCount}</span></span>
                  <span className="inline-flex items-center gap-2" title={t.admin.commentsCountLabel(report.metrics.engagement.commentCount)}><MessageCircle size={19} className="text-white/42" /><span className="tabular-nums">{report.metrics.engagement.commentCount}</span></span>
                </div>
              </Card>
              <Metric label={t.admin.readCount} value={report.metrics.readCount} />
              <Metric label={t.admin.readRate} value={`${report.metrics.readRate}%`} />
            </section>

            <Card className="overflow-hidden rounded-2xl border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-0">
              <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
                <div><h2 className="text-base font-semibold text-white">{t.admin.notificationReport}</h2><p className="mt-1 text-sm text-white/50">{t.admin.notificationReportDescription}</p></div>
                <div className="flex flex-wrap gap-2">
                  <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={t.admin.searchRecipients} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-accent/60" />
                  <AppSelect
                    value={filter}
                    options={[
                      { value: 'all', label: t.common.all },
                      { value: 'read', label: t.dashboard.read },
                      { value: 'unread', label: t.dashboard.unread },
                    ]}
                    onChange={(value) => { setFilter(value); setPage(1); }}
                    className="min-w-[8rem]"
                  />
                </div>
              </div>
              {pageRows.length ? (
                <>
                  <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-white/10 bg-white/[0.025] text-xs uppercase tracking-[0.12em] text-white/42"><tr><th className="px-4 py-3">{t.admin.tableName}</th><th className="px-4 py-3">{t.admin.tableEmail}</th><th className="px-4 py-3">{t.admin.tableRole}</th><th className="px-4 py-3">{t.common.status}</th><th className="px-4 py-3">{t.admin.readAt}</th><th className="px-4 py-3">{t.admin.notificationCreatedAt}</th></tr></thead><tbody className="divide-y divide-white/10">{pageRows.map((recipient) => <tr key={recipient.membershipId}><td className="px-4 py-4 font-medium text-white">{recipient.name}</td><td className="px-4 py-4 text-white/58">{recipient.email}</td><td className="px-4 py-4"><StatusBadge>{userRoleLabel(t, recipient.role)}</StatusBadge></td><td className="px-4 py-4"><StatusBadge tone={recipient.status === 'read' ? 'good' : 'warn'}>{recipient.status === 'read' ? t.dashboard.read : t.dashboard.unread}</StatusBadge></td><td className="px-4 py-4 text-white/58">{recipient.readAt ? formatDate(recipient.readAt, locale) : '-'}</td><td className="px-4 py-4 text-white/58">{recipient.createdAt ? formatDate(recipient.createdAt, locale) : '-'}</td></tr>)}</tbody></table></div>
                  <DataTablePagination page={safePage} pageSize={pageSize} pageSizeOptions={pageSizes} total={total} previousLabel={t.common.previous} nextLabel={t.common.next} rowsPerPageLabel={t.common.rowsPerPage} showingLabel={t.admin.showingRange(start, end, total)} onPageChange={setPage} onPageSizeChange={(next) => { setPageSize(next); setPage(1); }} />
                </>
              ) : <div className="p-4"><TableEmptyState title={report.metrics.notificationsCreated ? t.admin.noMatchingRecipients : t.admin.noNotificationReportRows} description={t.admin.noNotificationReportRowsDescription} /></div>}
            </Card>

            {isCommentsOpen && (
              <div className="fixed inset-0 z-[120] !m-0 h-dvh w-screen overflow-hidden bg-black/75 backdrop-blur-md">
                <button type="button" aria-label={t.common.close} onClick={() => setIsCommentsOpen(false)} className="absolute inset-0 h-full w-full" />
                <div className="absolute inset-y-0 right-0 flex w-full justify-end overflow-hidden">
                <aside role="dialog" aria-modal="true" aria-labelledby="admin-announcement-comments-title" className="relative flex h-dvh w-full max-w-[480px] flex-col overflow-hidden border-l border-white/[0.08] bg-[#07120e] shadow-2xl shadow-black/55">
                  <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5 sm:px-6">
                    <div className="min-w-0">
                      <h2 id="admin-announcement-comments-title" className="text-lg font-semibold text-white">{t.admin.announcementComments}</h2>
                      <p className="mt-1 truncate text-xs text-white/42">{report.announcement.title}</p>
                    </div>
                    <button type="button" onClick={() => setIsCommentsOpen(false)} aria-label={t.common.close} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20 text-white/55 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><X size={16} /></button>
                  </header>
                  <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {commentsError ? (
                  <div className="rounded-lg border border-rose-200/15 bg-rose-300/[0.06] p-4 text-sm text-rose-100"><p>{commentsError}</p><button type="button" onClick={() => void loadComments()} className="mt-2 font-semibold text-white underline-offset-2 hover:underline">{t.common.retry}</button></div>
                ) : comments === null ? (
                  <div className="space-y-3" aria-hidden="true">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg bg-white/[0.04]" />)}</div>
                ) : comments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-white/40">{t.admin.noAnnouncementComments}</p>
                ) : (
                  <div className="space-y-6">
                    {comments.map((comment) => (
                      <article key={comment.id}>
                        <div className="flex items-start gap-3">
                          <ProfilePhoto name={comment.author.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : comment.author.name} avatarUrl={comment.author.mode === 'COMMUNITY_TEAM' ? null : comment.author.avatarUrl} dicebearStyle={comment.author.mode === 'COMMUNITY_TEAM' ? null : comment.author.dicebearStyle} dicebearSeed={comment.author.mode === 'COMMUNITY_TEAM' ? null : comment.author.dicebearSeed} size="sm" className="h-9 w-9 shrink-0 rounded-full text-[10px]" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5"><p className="text-sm font-semibold text-white">{comment.author.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : comment.author.name}</p><span className="text-xs text-white/30" aria-hidden="true">·</span><time dateTime={comment.createdAt} className="text-xs text-white/42">{formatCommentTime(comment.createdAt, lang)}</time></div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/72">{comment.body}</p>
                            <div className="mt-2 flex items-center gap-4 text-xs text-white/42">
                              <CommentLikeButton comment={comment} busy={Boolean(likingCommentId)} onClick={() => void toggleCommentLike(comment.id)} likeLabel={t.dashboard.likeFeedComment} unlikeLabel={t.dashboard.unlikeFeedComment} />
                              <button type="button" onClick={() => { setActiveReplyId((current) => current === comment.id ? '' : comment.id); setReplyBody(''); setReplyAsCommunityTeam(false); }} className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30"><CornerUpLeft size={14} />{t.admin.replyToAnnouncementComment}</button>
                            </div>
                            {activeReplyId === comment.id && (
                              <form onSubmit={(event) => { event.preventDefault(); void postReply(comment.id); }} className="mt-3 rounded-lg border border-white/[0.08] bg-black/20 p-3">
                                {viewerCanUseCommunityTeamIdentity ? (
                                  <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-white/55"><input type="checkbox" checked={replyAsCommunityTeam} onChange={(event) => setReplyAsCommunityTeam(event.target.checked)} className="h-4 w-4 accent-[#5ed29c]" /><span>{t.admin.replyAsCommunityTeam}</span></label>
                                ) : null}
                                <textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} maxLength={1000} rows={2} autoFocus aria-label={t.admin.announcementReplyPlaceholder} placeholder={t.admin.announcementReplyPlaceholder} className="w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-white/28" />
                                <div className="mt-2 flex justify-end gap-2"><button type="button" disabled={postingReply} onClick={() => { setActiveReplyId(''); setReplyBody(''); setReplyAsCommunityTeam(false); }} className="h-8 rounded-full px-3 text-xs font-semibold text-white/50 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50">{t.common.cancel}</button><LoadingButton type="submit" loading={postingReply} loadingLabel={t.admin.postingAnnouncementReply} disabled={!replyBody.trim()} className="h-8 px-3 text-xs">{t.admin.postAnnouncementReply}</LoadingButton></div>
                              </form>
                            )}
                            {comment.replies.length > 0 && (
                              <div className="relative ml-5 mt-4 space-y-5 pl-6 sm:ml-7 sm:pl-7">
                                <span aria-hidden="true" className="absolute bottom-5 left-0 top-0 w-px rounded-full bg-gradient-to-b from-emerald-300/25 via-white/10 to-transparent" />
                                {comment.replies.map((reply) => (
                                  <div key={reply.id} className="relative flex items-start gap-3">
                                    <span aria-hidden="true" className="absolute -left-6 top-0 h-4 w-5 rounded-bl-xl border-b border-l border-emerald-300/20 sm:-left-7" />
                                    <ProfilePhoto name={reply.author.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : reply.author.name} avatarUrl={reply.author.mode === 'COMMUNITY_TEAM' ? null : reply.author.avatarUrl} dicebearStyle={reply.author.mode === 'COMMUNITY_TEAM' ? null : reply.author.dicebearStyle} dicebearSeed={reply.author.mode === 'COMMUNITY_TEAM' ? null : reply.author.dicebearSeed} size="sm" className="h-8 w-8 shrink-0 rounded-full text-[10px]" />
                                    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="text-sm font-semibold text-white">{reply.author.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : reply.author.name}</p><span className="text-xs text-white/30" aria-hidden="true">·</span><time dateTime={reply.createdAt} className="text-xs text-white/42">{formatCommentTime(reply.createdAt, lang)}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/68">{reply.body}</p><div className="mt-2 text-xs text-white/42"><CommentLikeButton comment={reply} busy={Boolean(likingCommentId)} onClick={() => void toggleCommentLike(reply.id)} likeLabel={t.dashboard.likeFeedComment} unlikeLabel={t.dashboard.unlikeFeedComment} /></div></div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
                  </div>
                  <form onSubmit={(event) => { event.preventDefault(); void postComment(); }} className="shrink-0 border-t border-white/[0.07] px-5 py-4 sm:px-6">
                    <label htmlFor="admin-announcement-comment-body" className="text-xs font-semibold text-white/60">{t.dashboard.addFeedComment}</label>
                    <textarea id="admin-announcement-comment-body" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={1000} rows={3} placeholder={t.dashboard.feedCommentPlaceholder} className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-accent/40 focus:ring-2 focus:ring-accent/15" />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      {viewerCanUseCommunityTeamIdentity ? (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-white/55"><input type="checkbox" checked={commentAsCommunityTeam} onChange={(event) => setCommentAsCommunityTeam(event.target.checked)} className="h-4 w-4 accent-[#5ed29c]" /><span>{t.admin.replyAsCommunityTeam}</span></label>
                      ) : <span />}
                      <LoadingButton type="submit" loading={postingComment} loadingLabel={t.dashboard.postingFeedComment} disabled={!commentBody.trim()}>{t.dashboard.postFeedComment}</LoadingButton>
                    </div>
                  </form>
                </aside>
                </div>
              </div>
            )}
          </>
        )}
        <ConfirmDialog open={Boolean(confirming)} title={confirmTitle} description={confirmDescription} confirmLabel={t.common.confirm} cancelLabel={t.common.cancel} loading={Boolean(busyAction)} onConfirm={() => confirming && action(confirming)} onCancel={() => setConfirming(null)} />
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <Card className="rounded-2xl"><p className="text-sm text-white/55">{label}</p><p className="mt-3 text-3xl font-semibold text-white">{value}</p></Card>;
}

function CommentLikeButton({ comment, busy, onClick, likeLabel, unlikeLabel }: { comment: AnnouncementComment; busy: boolean; onClick: () => void; likeLabel: string; unlikeLabel: string }) {
  return <button type="button" onClick={onClick} disabled={busy} aria-label={comment.viewerHasLiked ? unlikeLabel : likeLabel} className={`inline-flex items-center gap-1.5 rounded-md px-1 py-1 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-50 ${comment.viewerHasLiked ? 'text-emerald-300' : ''}`}><Heart className={comment.viewerHasLiked ? 'fill-current' : ''} size={14} /><span className="tabular-nums">{comment.likeCount}</span></button>;
}

function formatCommentTime(value: string, lang: 'en' | 'fr') {
  const timestamp = new Date(value).getTime();
  const elapsedSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { numeric: 'auto' });
  if (Math.abs(elapsedSeconds) < 60) return formatter.format(elapsedSeconds, 'second');
  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (Math.abs(elapsedMinutes) < 60) return formatter.format(elapsedMinutes, 'minute');
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 24) return formatter.format(elapsedHours, 'hour');
  const elapsedDays = Math.round(elapsedHours / 24);
  if (Math.abs(elapsedDays) < 7) return formatter.format(elapsedDays, 'day');
  return formatDate(value, lang === 'fr' ? 'fr-FR' : 'en-US');
}
