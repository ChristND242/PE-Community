'use client';

import { GripVertical } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

type WorkspacePaneRenderer = (mobile: boolean) => ReactNode;

export function TaskBoardMasterDetailWorkspace({
  mobileView,
  renderListPane,
  renderDetailPane,
  resizeLabel,
  testId,
}: {
  mobileView: 'list' | 'detail';
  renderListPane: WorkspacePaneRenderer;
  renderDetailPane: WorkspacePaneRenderer;
  resizeLabel: string;
  testId: string;
}) {
  const [listPanePercent, setListPanePercent] = useState(60);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!workspaceRef.current) return;
    event.preventDefault();
    const bounds = workspaceRef.current.getBoundingClientRect();
    const onMove = (moveEvent: PointerEvent) => {
      const nextPercent = ((moveEvent.clientX - bounds.left) / bounds.width) * 100;
      setListPanePercent(Math.min(70, Math.max(42, nextPercent)));
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = stop;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  function resizeWithKeyboard(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? -2 : 2;
    setListPanePercent((current) => Math.min(70, Math.max(42, current + direction)));
  }

  return (
    <section
      data-task-board-master-detail={testId}
      className="h-[680px] min-h-[560px] overflow-hidden rounded-xl border border-white/[0.09] bg-[#07100c] shadow-2xl shadow-black/20"
    >
      <div className="h-full min-h-0 overflow-hidden md:hidden">
        {mobileView === 'list' ? renderListPane(true) : renderDetailPane(true)}
      </div>
      <div
        ref={workspaceRef}
        data-task-board-master-detail-split={testId}
        className="hidden h-full min-h-0 overflow-hidden md:grid"
        style={{ gridTemplateColumns: `${listPanePercent}% 12px minmax(0, 1fr)` }}
      >
        <div className="h-full min-h-0 min-w-0 overflow-hidden">
          {renderListPane(false)}
        </div>
        <div
          role="separator"
          aria-label={resizeLabel}
          aria-orientation="vertical"
          aria-valuemin={42}
          aria-valuemax={70}
          aria-valuenow={Math.round(listPanePercent)}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeWithKeyboard}
          className="group relative z-20 flex cursor-col-resize touch-none items-center justify-center border-x border-white/[0.06] bg-black/20 outline-none transition hover:bg-accent/[0.06] focus-visible:bg-accent/[0.08]"
        >
          <span className="grid h-9 w-5 place-items-center rounded-full border border-white/10 bg-[#0a1611] text-white/35 shadow-lg transition group-hover:border-accent/20 group-hover:text-accent/70">
            <GripVertical size={13} aria-hidden="true" />
          </span>
        </div>
        <div className="h-full min-h-0 min-w-0 overflow-hidden">
          {renderDetailPane(false)}
        </div>
      </div>
    </section>
  );
}
