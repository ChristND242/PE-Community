'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { MemberNotificationLinkSource } from '../lib/member-notification-link';

export type MemberNotificationItem = MemberNotificationLinkSource & {
  id: string;
  title: string;
  body: string;
  readAt?: string | null;
  createdAt?: string | null;
};

type NotificationResponse = {
  notifications: MemberNotificationItem[];
};

export function useMemberNotifications(enabled: boolean, trayOpen: boolean) {
  const [notifications, setNotifications] = useState<MemberNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [notificationsInitialized, setNotificationsInitialized] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (!enabled) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (showLoading) setLoading(true);
    try {
      const response = await apiFetch<NotificationResponse>('/me/notifications', { signal: controller.signal });
      if (controllerRef.current !== controller) return;
      setNotifications((response.notifications ?? []).filter((notification) => !notification.readAt));
      setNotificationsInitialized(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (showLoading) setLoading(false);
    }
  }, [enabled]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!enabled) return;
    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
    try {
      await apiFetch(`/me/notifications/${notificationId}/read`, { method: 'PATCH' });
      window.dispatchEvent(new Event('pe:sidebar-counts-refresh'));
    } catch {
      await refresh();
    }
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) {
      controllerRef.current?.abort();
      setNotifications([]);
      setLoading(false);
      setNotificationsInitialized(false);
      return;
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const refreshOnFocus = () => void refresh();
    window.addEventListener('focus', refreshOnFocus);
    window.addEventListener('pe:sidebar-counts-refresh', refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshOnFocus);
      window.removeEventListener('pe:sidebar-counts-refresh', refreshOnFocus);
    };
  }, [enabled, refresh]);

  useEffect(() => {
    if (enabled && trayOpen) void refresh(true);
  }, [enabled, refresh, trayOpen]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return {
    notifications,
    loading,
    notificationsInitialized,
    unreadCount: notifications.length,
    markAsRead,
  };
}
