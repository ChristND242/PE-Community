const taskNotificationTypes = new Set([
  'EVENT_TASK_ASSIGNED',
  'EVENT_TASK_COMMENTED',
  'EVENT_TASK_ATTACHMENT_ADDED',
  'EVENT_TASK_ATTACHMENT_REMOVED',
  'EVENT_TASK_DUE_SOON',
  'EVENT_TASK_OVERDUE',
]);

type TaskNotification = {
  type?: string;
  metadata?: Record<string, unknown> | null;
};

export function taskNotificationHref(notification: TaskNotification, admin: boolean) {
  if (!taskNotificationTypes.has(notification.type ?? '')) return null;
  const actionUrl = metadataString(notification, 'actionUrl');
  if (actionUrl.startsWith('/') && !actionUrl.startsWith('//')) return actionUrl;
  const taskId = metadataString(notification, 'taskId');
  if (!taskId) return null;
  const eventId = metadataString(notification, 'eventId');
  const boardId = metadataString(notification, 'boardId') || metadataString(notification, 'taskBoardId');
  const tab = taskNotificationTab(notification);
  const query = `taskId=${encodeURIComponent(taskId)}&tab=${tab}`;
  if (eventId) return `${admin ? '/admin' : '/dashboard'}/events/${eventId}?${query}`;
  if (boardId) return `${admin ? '/admin' : '/dashboard'}/task-boards/${boardId}?section=board&${query}`;
  return null;
}

function taskNotificationTab(notification: TaskNotification) {
  const requested = metadataString(notification, 'tab');
  if (requested === 'comments' || requested === 'activity' || requested === 'attachments' || requested === 'checklist') return requested;
  if (notification.type === 'EVENT_TASK_COMMENTED') return 'comments';
  if (notification.type === 'EVENT_TASK_ATTACHMENT_ADDED' || notification.type === 'EVENT_TASK_ATTACHMENT_REMOVED') return 'attachments';
  return 'activity';
}

function metadataString(notification: TaskNotification, key: string) {
  const value = notification.metadata?.[key];
  return typeof value === 'string' ? value : '';
}
