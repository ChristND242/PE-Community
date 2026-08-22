'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

const chatUnreadRefreshEvent = 'pe:chat-unread-refresh';

type ChatUnreadCountResponse = {
  count: number;
};

export function useChatUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const response = await fetch(apiUrl('/chat/unread-count'), { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('Chat unread count unavailable.');
      const data = await response.json() as ChatUnreadCountResponse;
      setCount(Number.isFinite(data.count) ? Math.max(0, data.count) : 0);
    } catch {
      // Sidebar badges are supporting metadata; keep failures quiet.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    function refreshOnFocus() {
      if (document.visibilityState === 'visible') refresh();
    }
    window.addEventListener(chatUnreadRefreshEvent, refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(chatUnreadRefreshEvent, refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [enabled, refresh]);

  return { count, refresh };
}

export function dispatchChatUnreadRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(chatUnreadRefreshEvent));
}
