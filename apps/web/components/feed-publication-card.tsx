'use client';

import { CheckCircle2, Heart, MessageCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { identityVerificationForPublisher } from '../lib/identity-verification';
import { formatDate } from '../lib/utils';
import { IdentityVerificationBadge } from './identity-verification-badge';
import { ProfilePhoto } from './profile-photo';
import { LoadingButton } from './ui';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export type FeedPublisher = {
  id: string | null;
  name: string;
  avatarUrl: string | null;
  dicebearStyle: string | null;
  dicebearSeed: string | null;
  mode?: 'USER' | 'COMMUNITY_TEAM';
  verification?: 'ADMINISTRATOR' | 'OWNER' | 'OFFICIAL_COMMUNITY' | null;
};

export type FeedPublication = {
  id: string;
  title: string;
  body: string;
  coverUrl?: string | null;
  coverSource?: 'UPLOAD' | 'EXTERNAL' | null;
  publishedAt: string;
  publisher: FeedPublisher | null;
  readReceipt: { notificationId: string; readAt: string | null } | null;
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
};

type FeedPublicationCardLabels = {
  communityTeam: string;
  published: string;
  unread: string;
  read: string;
  markAsRead: string;
  markingRead: string;
  like: string;
  unlike: string;
  comments: string;
};

export function FeedPublicationCard({ item, labels, locale, marking, liking, onMarkRead, onToggleLike, onOpenComments }: {
  item: FeedPublication;
  labels: FeedPublicationCardLabels;
  locale: string;
  marking: boolean;
  liking: boolean;
  onMarkRead: () => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const publisherName = item.publisher?.mode === 'COMMUNITY_TEAM' ? labels.communityTeam : item.publisher?.name || labels.communityTeam;
  const unread = Boolean(item.readReceipt && !item.readReceipt.readAt);
  const verificationKind = identityVerificationForPublisher(item.publisher?.verification);

  useEffect(() => setCoverFailed(false), [item.coverUrl]);

  return (
    <article className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-foreground)] shadow-lg shadow-black/10 transition hover:border-[rgb(var(--app-accent-rgb)/0.22)]">
      <div className="p-5 sm:p-6">
        <header className="flex min-w-0 items-start gap-3">
          <ProfilePhoto
            size="sm"
            className="h-10 w-10 shrink-0 rounded-full"
            imageClassName="rounded-full"
            name={publisherName}
            avatarUrl={item.publisher?.mode === 'COMMUNITY_TEAM' ? null : item.publisher?.avatarUrl}
            dicebearStyle={item.publisher?.mode === 'COMMUNITY_TEAM' ? null : item.publisher?.dicebearStyle}
            dicebearSeed={item.publisher?.mode === 'COMMUNITY_TEAM' ? null : item.publisher?.dicebearSeed}
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-sm font-semibold">{publisherName}</p>
              <IdentityVerificationBadge kind={verificationKind} size="md" />
            </div>
            <time dateTime={item.publishedAt} className="mt-0.5 block text-xs text-[var(--app-muted-foreground)]">
              {labels.published} {formatDate(item.publishedAt, locale)}
            </time>
          </div>
          {unread ? <span className="app-status-info shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold">{labels.unread}</span> : null}
        </header>
      </div>

      {item.coverUrl && !coverFailed ? (
        <div className="aspect-video w-full overflow-hidden border-y border-[var(--app-border)] bg-[var(--app-panel-muted)]">
          <img
            src={item.coverUrl}
            alt=""
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover"
          />
        </div>
      ) : null}

      <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
        <h2 className="text-lg font-semibold leading-7 text-[var(--app-accent)]">{item.title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-7 text-[var(--app-muted-foreground)]">{item.body}</p>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onToggleLike}
                    disabled={liking}
                    aria-label={item.viewerHasLiked ? labels.unlike : labels.like}
                    className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm transition hover:bg-[var(--app-panel-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent-rgb)/0.3)] disabled:cursor-not-allowed disabled:opacity-50 ${item.viewerHasLiked ? 'text-[var(--app-accent)]' : 'text-[var(--app-muted-foreground)]'}`}
                  >
                    <Heart className={`size-4 ${item.viewerHasLiked ? 'fill-current' : ''}`} aria-hidden="true" />
                    <span className="font-semibold tabular-nums">{item.likeCount}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{item.viewerHasLiked ? labels.unlike : labels.like}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onOpenComments}
                    aria-label={labels.comments}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm text-[var(--app-muted-foreground)] transition hover:bg-[var(--app-panel-muted)] hover:text-[var(--app-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent-rgb)/0.3)]"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    <span className="font-semibold tabular-nums">{item.commentCount}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{labels.comments}</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          {item.readReceipt && (item.readReceipt.readAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--app-muted-foreground)]">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              {labels.read}
            </span>
          ) : (
            <LoadingButton
              type="button"
              loading={marking}
              loadingLabel={labels.markingRead}
              disabled={marking}
              onClick={onMarkRead}
              className="min-h-9 rounded-lg border border-[var(--app-info-border)] bg-[var(--app-info-soft)] px-3 py-1.5 text-xs text-[var(--app-info-foreground)] hover:bg-[var(--app-panel-muted)]"
            >
              {labels.markAsRead}
            </LoadingButton>
          ))}
        </footer>
      </div>
    </article>
  );
}
