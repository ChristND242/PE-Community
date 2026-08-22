'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, COMMUNITY_ID } from '../lib/api';

export type AdminNotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt?: string | null;
};

type UnreadCountResponse = {
  count: number;
};

type NotificationResponse = {
  notifications: AdminNotificationItem[];
};

export function useAdminNotifications(enabled: boolean, trayOpen: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsInitialized, setNotificationsInitialized] = useState(false);
  const unreadCountRef = useRef(0);
  const unreadControllerRef = useRef<AbortController | null>(null);
  const notificationsControllerRef = useRef<AbortController | null>(null);
  const notificationsInitializedRef = useRef(false);

  const refreshNotifications = useCallback(async (options?: { loading?: boolean }) => {
    if (!enabled) return;
    notificationsControllerRef.current?.abort();
    const controller = new AbortController();
    notificationsControllerRef.current = controller;
    if (options?.loading) setNotificationsLoading(true);
    try {
      const response = await apiFetch<NotificationResponse>(`/admin/${COMMUNITY_ID}/notifications`, { signal: controller.signal });
      if (notificationsControllerRef.current !== controller) return;
      setNotifications((response.notifications ?? []).filter((notification) => !notification.readAt));
      notificationsInitializedRef.current = true;
      setNotificationsInitialized(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    } finally {
      if (notificationsControllerRef.current === controller) notificationsControllerRef.current = null;
      if (options?.loading) setNotificationsLoading(false);
    }
  }, [enabled]);

  const refreshUnreadCount = useCallback(async () => {
    if (!enabled) return;
    unreadControllerRef.current?.abort();
    const controller = new AbortController();
    unreadControllerRef.current = controller;
    try {
      const response = await apiFetch<UnreadCountResponse>(`/admin/${COMMUNITY_ID}/notifications/unread-count`, { signal: controller.signal });
      const nextCount = Number.isFinite(response.count) ? response.count : 0;
      const previousCount = unreadCountRef.current;
      unreadCountRef.current = nextCount;
      setUnreadCount(nextCount);
      if (nextCount > previousCount) refreshNotifications();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      unreadCountRef.current = 0;
      setUnreadCount(0);
    } finally {
      if (unreadControllerRef.current === controller) unreadControllerRef.current = null;
    }
  }, [enabled, refreshNotifications]);

  const refreshAll = useCallback(async (options?: { loading?: boolean }) => {
    await Promise.all([refreshUnreadCount(), refreshNotifications(options)]);
  }, [refreshNotifications, refreshUnreadCount]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!enabled) return;
    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    unreadCountRef.current = Math.max(0, unreadCountRef.current - 1);
    setUnreadCount((current) => Math.max(0, current - 1));
    await apiFetch(`/admin/${COMMUNITY_ID}/notifications/${notificationId}/read`, { method: 'PATCH' }).catch(() => undefined);
    await refreshAll();
  }, [enabled, refreshAll]);

  useEffect(() => {
    if (!enabled) {
      unreadControllerRef.current?.abort();
      notificationsControllerRef.current?.abort();
      unreadCountRef.current = 0;
      setUnreadCount(0);
      setNotifications([]);
      setNotificationsLoading(false);
      notificationsInitializedRef.current = false;
      setNotificationsInitialized(false);
      return;
    }

    refreshAll();
    const interval = window.setInterval(() => {
      refreshUnreadCount();
      if (trayOpen || !notificationsInitializedRef.current) refreshNotifications();
    }, 30_000);
    const refreshOnFocus = () => {
      refreshUnreadCount();
      if (trayOpen) refreshNotifications();
    };
    const refreshFromEvent = () => {
      refreshAll();
    };
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('pe:admin-notifications-refresh', refreshFromEvent);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('pe:admin-notifications-refresh', refreshFromEvent);
    };
  }, [enabled, refreshAll, refreshNotifications, refreshUnreadCount, trayOpen]);

  useEffect(() => {
    if (!enabled || !trayOpen) return;
    refreshAll({ loading: true });
  }, [enabled, refreshAll, trayOpen]);

  useEffect(() => {
    return () => {
      unreadControllerRef.current?.abort();
      notificationsControllerRef.current?.abort();
    };
  }, []);

  return {
    unreadCount,
    notifications,
    notificationsLoading,
    notificationsInitialized,
    refreshAll,
    refreshNotifications,
    refreshUnreadCount,
    markAsRead,
  };
}
