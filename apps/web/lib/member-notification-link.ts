import { taskNotificationHref } from './task-notification-link';

export type MemberNotificationLinkSource = {
  type?: string;
  metadata?: Record<string, unknown> | null;
};

export function memberNotificationHref(notification: MemberNotificationLinkSource) {
  const taskHref = taskNotificationHref(notification, false);
  if (taskHref) return taskHref;
  const eventId = metadataString(notification, 'eventId');
  if (notification.type === 'EVENT_CREATED' && eventId) {
    return `/dashboard/events/${eventId}`;
  }
  if (notification.type === 'ANNOUNCEMENT_PUBLISHED') return '/dashboard/feed';
  return null;
}

function metadataString(notification: MemberNotificationLinkSource, key: string) {
  const value = notification.metadata?.[key];
  return typeof value === 'string' ? value : '';
}
