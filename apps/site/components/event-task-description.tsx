'use client';

import { useState } from 'react';

const TASK_DESCRIPTION_PREVIEW_LENGTH = 140;

export function EventTaskDescription({ description, readMoreLabel, showLessLabel }: { description?: string | null; readMoreLabel: string; showLessLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const normalizedDescription = description?.trim();
  if (!normalizedDescription) return null;

  const canExpand = normalizedDescription.length > TASK_DESCRIPTION_PREVIEW_LENGTH;
  return (
    <div className="mt-2 space-y-1.5">
      <p className={`text-xs leading-5 text-white/45 ${canExpand && !expanded ? 'line-clamp-2' : ''}`}>{normalizedDescription}</p>
      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          className="rounded-sm text-xs font-semibold text-emerald-300 outline-none transition hover:text-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-300/40"
        >
          {expanded ? showLessLabel : readMoreLabel}
        </button>
      )}
    </div>
  );
}
