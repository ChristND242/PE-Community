'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n';
import { EventTaskCollaboration } from './event-task-collaboration';

export function EventTaskCollaborationDrawer({ taskTitle, endpointBase, taskId, canComment, refreshToken, initialTab, summary, onClose }: {
  taskTitle: string;
  endpointBase: string;
  taskId: string;
  canComment: boolean;
  refreshToken: number;
  initialTab: 'comments' | 'activity' | 'attachments' | 'checklist';
  summary?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] h-[100dvh] w-full overflow-hidden">
      <button type="button" aria-label={t.common.closeComments} className="absolute inset-0 h-full w-full bg-black/75 backdrop-blur-md" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId} className="event-task-collaboration-drawer absolute right-0 top-0 flex h-[100dvh] w-full max-w-[560px] flex-col overflow-hidden border-l border-white/[0.08] bg-[#07120e] shadow-2xl shadow-black/55">
        <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent/75">{t.common.taskDiscussion}</p>
            <h2 id={titleId} className="mt-1 truncate text-lg font-semibold text-white">{taskTitle}</h2>
          </div>
          <button type="button" onClick={onClose} title={t.common.closeComments} aria-label={t.common.closeComments} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20 text-white/55 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"><X size={16} /></button>
        </header>
        <EventTaskCollaboration endpointBase={endpointBase} taskId={taskId} canComment={canComment} refreshToken={refreshToken} initialTab={initialTab} summary={summary} />
      </aside>
      <style jsx>{`
        .event-task-collaboration-drawer {
          animation: event-task-drawer-in 180ms ease-out;
        }
        @keyframes event-task-drawer-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        :global(.task-discussion-scrollbar) {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.16) transparent;
        }
        :global(.task-discussion-scrollbar::-webkit-scrollbar) { width: 4px; }
        :global(.task-discussion-scrollbar::-webkit-scrollbar-track) { background: transparent; }
        :global(.task-discussion-scrollbar::-webkit-scrollbar-thumb) {
          background: rgba(255, 255, 255, 0.16);
          border-radius: 999px;
        }
        :global(.task-discussion-scrollbar::-webkit-scrollbar-thumb:hover) { background: rgba(255, 255, 255, 0.24); }
        @media (prefers-reduced-motion: reduce) {
          .event-task-collaboration-drawer { animation: none; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
