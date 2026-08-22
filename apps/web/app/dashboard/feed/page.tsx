'use client';

import { CheckCircle2, CornerUpLeft, Heart, MessageCircle, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ProfilePhoto } from '../../../components/profile-photo';
import { AppShell } from '../../../components/shell';
import { LoadingButton, TableEmptyState, TableErrorState, TableSkeleton } from '../../../components/ui';
import { apiFetch, COMMUNITY_ID } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { formatDate } from '../../../lib/utils';

type FeedPublisher = {
  id: string | null;
  name: string;
  avatarUrl: string | null;
  dicebearStyle: string | null;
  dicebearSeed: string | null;
  mode?: 'USER' | 'COMMUNITY_TEAM';
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  publisher: FeedPublisher | null;
  readReceipt: { notificationId: string; readAt: string | null } | null;
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
};

type Feed = { announcements: Announcement[]; unreadCount: number; readTrackingAvailable: boolean };

type FeedComment = {
  id: string;
  body: string;
  createdAt: string;
  author: FeedPublisher;
  likeCount: number;
  viewerHasLiked: boolean;
  replies: FeedComment[];
};

export default function FeedPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<Feed | null>(null);
  const [error, setError] = useState('');
  const [markingId, setMarkingId] = useState('');
  const [likingId, setLikingId] = useState('');
  const [commentsItem, setCommentsItem] = useState<Announcement | null>(null);
  const [comments, setComments] = useState<FeedComment[] | null>(null);
  const [commentsError, setCommentsError] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [activeReplyId, setActiveReplyId] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [postingReply, setPostingReply] = useState(false);
  const [likingCommentId, setLikingCommentId] = useState('');
  const markingReadIdsRef = useRef(new Set<string>());
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';

  async function load() {
    setError('');
    try {
      setData(await apiFetch<Feed>(`/communities/${COMMUNITY_ID}/feed`));
    } catch {
      setError(t.dashboard.feedLoadFailed);
    }
  }

  useEffect(() => { load(); }, [t.dashboard.feedLoadFailed]);

  useEffect(() => {
    if (!commentsItem) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setCommentsItem(null);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [commentsItem]);

  async function markRead(item: Announcement, silent = false) {
    if (!item.readReceipt || item.readReceipt.readAt || markingReadIdsRef.current.has(item.id)) return;
    markingReadIdsRef.current.add(item.id);
    setMarkingId(item.id);
    try {
      const updated = await apiFetch<{ readAt: string | null }>(`/me/notifications/${item.readReceipt.notificationId}/read`, { method: 'PATCH' });
      setData((current) => {
        const currentItem = current?.announcements.find((announcement) => announcement.id === item.id);
        if (!current || !currentItem?.readReceipt || currentItem.readReceipt.readAt) return current;
        return {
          ...current,
          unreadCount: Math.max(0, current.unreadCount - 1),
          announcements: current.announcements.map((announcement) => announcement.id === item.id && announcement.readReceipt
            ? { ...announcement, readReceipt: { ...announcement.readReceipt, readAt: updated.readAt } }
            : announcement),
        };
      });
      window.dispatchEvent(new Event('pe:sidebar-counts-refresh'));
      if (!silent) toast.success(t.dashboard.notificationRead);
    } catch {
      if (!silent) toast.error(t.dashboard.notificationReadFailed);
    } finally {
      markingReadIdsRef.current.delete(item.id);
      setMarkingId((current) => current === item.id ? '' : current);
    }
  }

  async function markFeedItemReadFromInteraction(itemId: string) {
    const item = data?.announcements.find((announcement) => announcement.id === itemId);
    if (!item || !item.readReceipt || item.readReceipt.readAt) return;
    await markRead(item, true);
  }

  async function toggleLike(item: Announcement) {
    if (likingId) return;
    setLikingId(item.id);
    try {
      const updated = await apiFetch<{ announcementId: string; likeCount: number; viewerHasLiked: boolean }>(`/communities/${COMMUNITY_ID}/feed/${item.id}/like`, { method: 'POST' });
      setData((current) => current ? {
        ...current,
        announcements: current.announcements.map((announcement) => announcement.id === item.id
          ? { ...announcement, likeCount: updated.likeCount, viewerHasLiked: updated.viewerHasLiked }
          : announcement),
      } : current);
      void markFeedItemReadFromInteraction(item.id);
    } catch {
      toast.error(t.dashboard.feedLikeFailed);
    } finally {
      setLikingId('');
    }
  }

  async function loadComments(announcementId: string) {
    setComments(null);
    setCommentsError('');
    try {
      const response = await apiFetch<{ comments: FeedComment[] }>(`/communities/${COMMUNITY_ID}/feed/${announcementId}/comments`);
      setComments(response.comments);
    } catch {
      setComments([]);
      setCommentsError(t.dashboard.feedCommentsLoadFailed);
    }
  }

  function openComments(item: Announcement) {
    setCommentsItem(item);
    setCommentBody('');
    setActiveReplyId('');
    setReplyBody('');
    void loadComments(item.id);
    void markFeedItemReadFromInteraction(item.id);
  }

  async function postComment() {
    if (!commentsItem || postingComment || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      const response = await apiFetch<{ comment: FeedComment; commentCount: number }>(`/communities/${COMMUNITY_ID}/feed/${commentsItem.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentBody }),
      });
      setComments((current) => [...(current ?? []), response.comment]);
      setData((current) => current ? {
        ...current,
        announcements: current.announcements.map((announcement) => announcement.id === commentsItem.id
          ? { ...announcement, commentCount: response.commentCount }
          : announcement),
      } : current);
      setCommentBody('');
      void markFeedItemReadFromInteraction(commentsItem.id);
    } catch {
      toast.error(t.dashboard.feedCommentPostFailed);
    } finally {
      setPostingComment(false);
    }
  }

  function updateComment(commentId: string, update: (comment: FeedComment) => FeedComment) {
    setComments((current) => current?.map((comment) => {
      if (comment.id === commentId) return update(comment);
      const replyIndex = comment.replies.findIndex((reply) => reply.id === commentId);
      if (replyIndex < 0) return comment;
      return {
        ...comment,
        replies: comment.replies.map((reply) => reply.id === commentId ? update(reply) : reply),
      };
    }) ?? current);
  }

  async function toggleCommentLike(commentId: string) {
    if (!commentsItem || likingCommentId) return;
    setLikingCommentId(commentId);
    try {
      const updated = await apiFetch<{ commentId: string; likeCount: number; viewerHasLiked: boolean }>(`/communities/${COMMUNITY_ID}/feed/${commentsItem.id}/comments/${commentId}/like`, { method: 'POST' });
      updateComment(updated.commentId, (comment) => ({ ...comment, likeCount: updated.likeCount, viewerHasLiked: updated.viewerHasLiked }));
      void markFeedItemReadFromInteraction(commentsItem.id);
    } catch {
      toast.error(t.dashboard.feedCommentLikeFailed);
    } finally {
      setLikingCommentId('');
    }
  }

  async function postReply(parentId: string) {
    if (!commentsItem || postingReply || !replyBody.trim()) return;
    setPostingReply(true);
    try {
      const response = await apiFetch<{ comment: FeedComment; commentCount: number; parentId: string }>(`/communities/${COMMUNITY_ID}/feed/${commentsItem.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: replyBody, parentId }),
      });
      updateComment(parentId, (comment) => ({ ...comment, replies: [...comment.replies, response.comment] }));
      setData((current) => current ? {
        ...current,
        announcements: current.announcements.map((announcement) => announcement.id === commentsItem.id
          ? { ...announcement, commentCount: response.commentCount }
          : announcement),
      } : current);
      setReplyBody('');
      setActiveReplyId('');
      void markFeedItemReadFromInteraction(commentsItem.id);
    } catch {
      toast.error(t.dashboard.feedReplyPostFailed);
    } finally {
      setPostingReply(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6 xl:flex xl:h-[calc(100dvh-8rem)] xl:min-h-0 xl:flex-col">
        <header className="shrink-0">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{t.dashboard.feedTitle}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{t.dashboard.feedSubtitle}</p>
          </div>
        </header>

        {error ? (
          <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
        ) : !data ? (
          <TableSkeleton rows={5} columns={2} />
        ) : data.announcements.length ? (
          <div className="grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 space-y-5 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pb-10 xl:pr-3 xl:[-ms-overflow-style:none] xl:[scrollbar-width:none] xl:[&::-webkit-scrollbar]:hidden">
              {data.announcements.map((item, index) => {
                const publisherName = item.publisher?.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : item.publisher?.name || t.dashboard.communityTeam;
                const unread = Boolean(item.readReceipt && !item.readReceipt.readAt);
                const isLast = index === data.announcements.length - 1;
                return (
                  <div key={item.id} className="relative grid grid-cols-[24px_minmax(0,1fr)] gap-2">
                    <div className="relative flex justify-center">
                      <span className={`z-10 mt-8 h-3 w-3 rounded-full border border-accent/25 ring-4 ring-[#0b1511] ${unread ? 'bg-accent' : 'bg-[#18231f]'}`} aria-hidden="true" />
                      {!isLast && (
                        <span className="absolute bottom-[-0.75rem] left-1/2 top-[3.1rem] w-px -translate-x-1/2 rounded-full bg-gradient-to-b from-emerald-300/35 via-white/12 to-white/[0.08]" aria-hidden="true" />
                      )}
                    </div>
                    <article className="relative rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-xl shadow-black/10 transition hover:border-white/15 hover:bg-white/[0.045] sm:p-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <ProfilePhoto
                        size="sm"
                        className="h-10 w-10 rounded-full"
                        imageClassName="rounded-full"
                        name={publisherName}
                        avatarUrl={item.publisher?.avatarUrl}
                        dicebearStyle={item.publisher?.dicebearStyle}
                        dicebearSeed={item.publisher?.dicebearSeed}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{publisherName}</p>
                        <p className="mt-0.5 text-xs text-white/45">{t.dashboard.published} {formatDate(item.publishedAt, locale)}</p>
                      </div>
                      {unread && <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">{t.dashboard.unread}</span>}
                    </div>

                    <div className="mt-5">
                      <h2 className="text-lg font-semibold leading-7 text-emerald-300 sm:text-xl">{item.title}</h2>
                      <p className="mt-3 whitespace-pre-line text-sm leading-7 text-white/68">{item.body}</p>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                      <div className="flex items-center gap-4 text-white/50">
                        <button
                          type="button"
                          onClick={() => toggleLike(item)}
                          disabled={Boolean(likingId)}
                          aria-label={item.viewerHasLiked ? t.dashboard.unlikeFeedUpdate : t.dashboard.likeFeedUpdate}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-60 ${item.viewerHasLiked ? 'text-emerald-300' : 'hover:text-emerald-200'}`}
                        >
                          <Heart size={16} className={item.viewerHasLiked ? 'fill-current' : ''} />
                          <span className="text-xs font-semibold tabular-nums">{item.likeCount}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openComments(item)}
                          aria-label={t.dashboard.openFeedComments}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-1 py-1 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                        >
                          <MessageCircle size={16} />
                          <span className="text-xs font-semibold tabular-nums">{item.commentCount}</span>
                        </button>
                      </div>
                      {item.readReceipt && (item.readReceipt.readAt ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/55">
                          <CheckCircle2 size={14} />
                          {t.dashboard.read}
                        </span>
                      ) : (
                        <LoadingButton
                          type="button"
                          loading={markingId === item.id}
                          loadingLabel={t.dashboard.markingRead}
                          disabled={Boolean(markingId)}
                          onClick={() => markRead(item)}
                          className="border border-accent/25 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/15"
                        >
                          {t.dashboard.markAsRead}
                        </LoadingButton>
                      ))}
                    </div>
                    </article>
                  </div>
                );
              })}
            </section>

            {data.readTrackingAvailable && (
              <aside className="xl:min-h-0 xl:self-start">
                <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <h2 className="text-xs font-semibold uppercase text-white/45">{t.dashboard.unreadUpdates}</h2>
                  <p className="mt-3 text-3xl font-semibold text-white">{data.unreadCount}</p>
                  <p className="mt-1 text-sm leading-6 text-white/50">{t.dashboard.unreadUpdatesDescription}</p>
                </section>
              </aside>
            )}
          </div>
        ) : (
          <TableEmptyState title={t.dashboard.noFeedUpdates} description={t.dashboard.noFeedUpdatesDescription} />
        )}
      </div>
      {commentsItem && (
        <div className="fixed inset-0 z-[120] h-[100dvh] w-full overflow-hidden">
          <button type="button" aria-label={t.common.close} onClick={() => setCommentsItem(null)} className="absolute inset-0 h-full w-full bg-black/75 backdrop-blur-md" />
          <aside role="dialog" aria-modal="true" aria-labelledby="feed-comments-title" className="absolute right-0 top-0 flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden border-l border-white/[0.08] bg-[#07120e] shadow-2xl shadow-black/55">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5 sm:px-6">
              <div className="min-w-0">
                <h2 id="feed-comments-title" className="text-lg font-semibold text-white">{t.dashboard.feedComments}</h2>
                <p className="mt-1 truncate text-xs text-white/42">{commentsItem.title}</p>
              </div>
              <button type="button" onClick={() => setCommentsItem(null)} aria-label={t.common.close} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20 text-white/55 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><X size={16} /></button>
            </header>

            <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {commentsError ? (
                <div className="rounded-lg border border-rose-200/15 bg-rose-300/[0.06] p-4 text-sm text-rose-100">
                  <p>{commentsError}</p>
                  <button type="button" onClick={() => loadComments(commentsItem.id)} className="mt-2 font-semibold text-white underline-offset-2 hover:underline">{t.common.retry}</button>
                </div>
              ) : comments === null ? (
                <div className="space-y-3" aria-hidden="true">
                  {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg bg-white/[0.04]" />)}
                </div>
              ) : comments.length === 0 ? (
                <p className="py-10 text-center text-sm text-white/40">{t.dashboard.noFeedComments}</p>
              ) : (
                <div className="space-y-6">
                  {comments.map((comment) => (
                    <article key={comment.id}>
                      <div className="flex items-start gap-3">
                        <ProfilePhoto name={comment.author.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : comment.author.name} avatarUrl={comment.author.mode === 'COMMUNITY_TEAM' ? null : comment.author.avatarUrl} dicebearStyle={comment.author.mode === 'COMMUNITY_TEAM' ? null : comment.author.dicebearStyle} dicebearSeed={comment.author.mode === 'COMMUNITY_TEAM' ? null : comment.author.dicebearSeed} size="sm" className="h-9 w-9 shrink-0 rounded-full text-[10px]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold text-white">{comment.author.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : comment.author.name}</p>
                            <span className="text-xs text-white/30" aria-hidden="true">·</span>
                            <time dateTime={comment.createdAt} className="text-xs text-white/42">{formatFeedCommentTime(comment.createdAt, lang)}</time>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/72">{comment.body}</p>
                          <div className="mt-2 flex items-center gap-4 text-xs text-white/42">
                            <button
                              type="button"
                              onClick={() => toggleCommentLike(comment.id)}
                              disabled={Boolean(likingCommentId)}
                              aria-label={comment.viewerHasLiked ? t.dashboard.unlikeFeedComment : t.dashboard.likeFeedComment}
                              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-50 ${comment.viewerHasLiked ? 'text-emerald-300' : ''}`}
                            >
                              <Heart className={comment.viewerHasLiked ? 'fill-current' : ''} size={14} />
                              <span className="tabular-nums">{comment.likeCount}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveReplyId((current) => current === comment.id ? '' : comment.id);
                                setReplyBody('');
                              }}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30"
                            >
                              <CornerUpLeft size={14} />
                              <span>{t.dashboard.replyToFeedComment}</span>
                            </button>
                          </div>

                          {activeReplyId === comment.id && (
                            <form onSubmit={(event) => { event.preventDefault(); void postReply(comment.id); }} className="mt-3 rounded-lg border border-white/[0.08] bg-black/20 p-3">
                              <textarea
                                value={replyBody}
                                onChange={(event) => setReplyBody(event.target.value)}
                                maxLength={1000}
                                rows={2}
                                autoFocus
                                aria-label={t.dashboard.feedReplyPlaceholder}
                                placeholder={t.dashboard.feedReplyPlaceholder}
                                className="w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-white/28"
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <button type="button" disabled={postingReply} onClick={() => { setActiveReplyId(''); setReplyBody(''); }} className="h-8 rounded-full px-3 text-xs font-semibold text-white/50 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50">{t.common.cancel}</button>
                                <LoadingButton type="submit" loading={postingReply} loadingLabel={t.dashboard.postingFeedReply} disabled={!replyBody.trim()} className="h-8 px-3 text-xs">{t.dashboard.postFeedReply}</LoadingButton>
                              </div>
                            </form>
                          )}

                          {comment.replies.length > 0 && (
                            <div className="relative ml-5 mt-4 space-y-5 pl-6 sm:ml-7 sm:pl-7">
                              <span aria-hidden="true" className="absolute bottom-5 left-0 top-0 w-px rounded-full bg-gradient-to-b from-emerald-300/25 via-white/10 to-transparent" />
                              {comment.replies.map((reply) => (
                                <div key={reply.id} className="relative flex items-start gap-3">
                                  <span aria-hidden="true" className="absolute -left-6 top-0 h-4 w-5 rounded-bl-xl border-b border-l border-emerald-300/20 sm:-left-7" />
                                  <ProfilePhoto name={reply.author.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : reply.author.name} avatarUrl={reply.author.mode === 'COMMUNITY_TEAM' ? null : reply.author.avatarUrl} dicebearStyle={reply.author.mode === 'COMMUNITY_TEAM' ? null : reply.author.dicebearStyle} dicebearSeed={reply.author.mode === 'COMMUNITY_TEAM' ? null : reply.author.dicebearSeed} size="sm" className="h-8 w-8 shrink-0 rounded-full text-[10px]" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="text-sm font-semibold text-white">{reply.author.mode === 'COMMUNITY_TEAM' ? t.dashboard.communityTeam : reply.author.name}</p>
                                      <span className="text-xs text-white/30" aria-hidden="true">·</span>
                                      <time dateTime={reply.createdAt} className="text-xs text-white/42">{formatFeedCommentTime(reply.createdAt, lang)}</time>
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-white/68">{reply.body}</p>
                                    <div className="mt-2 text-xs text-white/42">
                                      <button
                                        type="button"
                                        onClick={() => toggleCommentLike(reply.id)}
                                        disabled={Boolean(likingCommentId)}
                                        aria-label={reply.viewerHasLiked ? t.dashboard.unlikeFeedComment : t.dashboard.likeFeedComment}
                                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 transition hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/30 disabled:cursor-not-allowed disabled:opacity-50 ${reply.viewerHasLiked ? 'text-emerald-300' : ''}`}
                                      >
                                        <Heart className={reply.viewerHasLiked ? 'fill-current' : ''} size={14} />
                                        <span className="tabular-nums">{reply.likeCount}</span>
                                      </button>
                                    </div>
                                  </div>
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
              <label htmlFor="feed-comment-body" className="text-xs font-semibold text-white/60">{t.dashboard.addFeedComment}</label>
              <textarea id="feed-comment-body" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={1000} rows={3} placeholder={t.dashboard.feedCommentPlaceholder} className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-accent/40 focus:ring-2 focus:ring-accent/15" />
              <div className="mt-3 flex justify-end">
                <LoadingButton type="submit" loading={postingComment} loadingLabel={t.dashboard.postingFeedComment} disabled={!commentBody.trim()}>{t.dashboard.postFeedComment}</LoadingButton>
              </div>
            </form>
          </aside>
        </div>
      )}
    </AppShell>
  );
}

function formatFeedCommentTime(value: string, lang: 'en' | 'fr') {
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
