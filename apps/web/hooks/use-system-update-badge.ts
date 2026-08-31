'use client';

import { useEffect, useState } from 'react';
import { apiFetch, COMMUNITY_ID } from '../lib/api';

export function useSystemUpdateBadge(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let disposed = false;
    async function refresh() {
      try {
        const response = await apiFetch<{ release?: { status?: string } }>(`/admin/${COMMUNITY_ID}/system-updates`);
        if (!disposed) setCount(response.release?.status === 'UPDATE_AVAILABLE' ? 1 : 0);
      } catch {
        if (!disposed) setCount(0);
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 15 * 60_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [enabled]);
  return count;
}
