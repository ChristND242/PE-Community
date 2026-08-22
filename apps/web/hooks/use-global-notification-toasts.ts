'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { useNotificationToastReplayState } from '../components/notification-toast-replay-provider';
import { useI18n } from '../lib/i18n';
import { memberNotificationHref } from '../lib/member-notification-link';
import {
  completeNotificationToastReplay,
  markNotificationToastPresented,
  notificationToastCandidates,
  notificationToastContextKey,
} from '../lib/notification-toast-replay';
import { taskNotificationHref } from '../lib/task-notification-link';
import type { AdminNotificationItem } from './use-admin-notifications';
import type { MemberNotificationItem } from './use-member-notifications';

const taskNotificationTypes = new Set([
  'EVENT_TASK_ASSIGNED',
  'EVENT_TASK_COMMENTED',
  'EVENT_TASK_DUE_SOON',
  'EVENT_TASK_OVERDUE',
  'EVENT_TASK_ATTACHMENT_ADDED',
  'EVENT_TASK_ATTACHMENT_REMOVED',
]);

type NotificationAudience = 'admin' | 'member';
type GlobalNotificationItem = AdminNotificationItem | MemberNotificationItem;

export function useGlobalNotificationToasts({
  audience,
  communityId,
  userId,
  notifications,
  notificationsReady,
}: {
  audience: NotificationAudience;
  communityId: string;
  userId?: string;
  notifications: GlobalNotificationItem[];
  notificationsReady: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const replayStateRef = useNotificationToastReplayState();
  const contextKey = userId
    ? notificationToastContextKey({ audience, communityId, userId })
    : null;

  useEffect(() => {
    if (!contextKey || !notificationsReady) return;

    const replayState = replayStateRef.current;
    const candidates = notificationToastCandidates(
      replayState,
      contextKey,
      notifications,
      notificationsReady,
    );

    for (const notification of candidates) {
      presentNotificationToast(notification, audience, t, router.push);
      markNotificationToastPresented(replayState, contextKey, notification.id);
    }

    completeNotificationToastReplay(replayState, contextKey);
  }, [audience, contextKey, notifications, notificationsReady, replayStateRef, router, t]);
}

function presentNotificationToast(
  notification: GlobalNotificationItem,
  audience: NotificationAudience,
  t: ReturnType<typeof useI18n>['t'],
  navigate: (href: string) => void,
) {
  if (taskNotificationTypes.has(notification.type ?? '')) {
    const target = taskNotificationTarget(notification, audience);
    toast(taskNotificationTitle(notification, t), {
      description: notification.body,
      id: `${audience}-notification-${notification.id}`,
      action: target
        ? {
            label: taskNotificationActionLabel(notification.type ?? '', t),
            onClick: () => navigate(target),
          }
        : undefined,
    });
    return;
  }

  if (audience === 'admin') {
    toast(adminNotificationTitle(notification, t), {
      description: adminNotificationBody(notification, t),
      duration: 5000,
      id: `admin-notification-${notification.id}`,
    });
    return;
  }

  const target = memberNotificationHref(notification);
  toast(t.dashboard.notificationTypeLabel(notification.type ?? ''), {
    description: notification.body,
    id: `member-notification-${notification.id}`,
    action: target
      ? {
          label: t.dashboard.notificationActionLabel(notification.type ?? ''),
          onClick: () => navigate(target),
        }
      : undefined,
  });
}

function taskNotificationTitle(
  notification: GlobalNotificationItem,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (notification.type === 'EVENT_TASK_COMMENTED') return t.common.newTaskComment;
  if (notification.type === 'EVENT_TASK_DUE_SOON') return t.common.taskDueSoon;
  if (notification.type === 'EVENT_TASK_OVERDUE') return t.common.taskOverdue;
  if (notification.type === 'EVENT_TASK_ATTACHMENT_ADDED') return t.common.newTaskAttachment;
  if (notification.type === 'EVENT_TASK_ATTACHMENT_REMOVED') return t.common.taskAttachmentRemoved;
  return t.dashboard.eventTaskAssignmentNotificationTitle;
}

function taskNotificationActionLabel(
  type: string,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (type === 'EVENT_TASK_COMMENTED') return t.common.viewComments;
  if (type === 'EVENT_TASK_ATTACHMENT_ADDED' || type === 'EVENT_TASK_ATTACHMENT_REMOVED') {
    return t.common.viewAttachments;
  }
  return t.common.viewTask;
}

function taskNotificationTarget(
  notification: GlobalNotificationItem,
  audience: NotificationAudience,
) {
  const admin = audience === 'admin';
  return taskNotificationHref(notification, admin)
    ?? (admin ? '/admin/task-boards' : '/dashboard/task-boards');
}

function adminNotificationTitle(
  notification: GlobalNotificationItem,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (notification.type === 'REGISTRATION_SUBMITTED') {
    return t.admin.registrationSubmittedNotificationTitle;
  }
  return notification.title;
}

function adminNotificationBody(
  notification: GlobalNotificationItem,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (notification.type === 'REGISTRATION_SUBMITTED') {
    return t.admin.registrationSubmittedNotificationBody;
  }
  return notification.body;
}
