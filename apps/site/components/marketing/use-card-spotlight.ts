'use client';

import { useRef } from 'react';
import type { PointerEvent } from 'react';

export const cardSpotlightLayerClassName = 'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 [background:radial-gradient(190px_circle_at_var(--spotlight-x)_var(--spotlight-y),rgba(52,211,153,0.16),transparent_70%)]';

export function useCardSpotlight<T extends HTMLElement>() {
  const spotlightRef = useRef<HTMLDivElement>(null);

  function handlePointerMove(event: PointerEvent<T>) {
    if (event.pointerType === 'touch') return;
    const spotlight = spotlightRef.current;
    if (!spotlight) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
    spotlight.style.opacity = '1';
  }

  function hideSpotlight() {
    if (spotlightRef.current) spotlightRef.current.style.opacity = '0';
  }

  return {
    spotlightRef,
    spotlightHandlers: {
      onPointerMove: handlePointerMove,
      onPointerLeave: hideSpotlight,
      onPointerCancel: hideSpotlight,
    },
  };
}
