export type NotificationToastReplayItem = {
  id: string;
  readAt?: string | null;
  createdAt?: string | null;
};

export type NotificationToastReplayState = {
  contextKey: string | null;
  replayCompleted: boolean;
  presentedIds: Set<string>;
};

export function createNotificationToastReplayState(): NotificationToastReplayState {
  return {
    contextKey: null,
    replayCompleted: false,
    presentedIds: new Set<string>(),
  };
}

export function notificationToastContextKey(input: {
  audience: 'admin' | 'member';
  communityId: string;
  userId: string;
}) {
  return `${input.communityId}:${input.userId}:${input.audience}`;
}

export function notificationToastCandidates<T extends NotificationToastReplayItem>(
  state: NotificationToastReplayState,
  contextKey: string,
  notifications: T[],
  ready: boolean,
) {
  syncNotificationToastContext(state, contextKey);
  if (!ready) return [];

  return notifications
    .filter((notification) => !notification.readAt && !state.presentedIds.has(notification.id))
    .sort(compareNotificationAge);
}

export function markNotificationToastPresented(
  state: NotificationToastReplayState,
  contextKey: string,
  notificationId: string,
) {
  syncNotificationToastContext(state, contextKey);
  state.presentedIds.add(notificationId);
}

export function completeNotificationToastReplay(
  state: NotificationToastReplayState,
  contextKey: string,
) {
  syncNotificationToastContext(state, contextKey);
  state.replayCompleted = true;
}

function syncNotificationToastContext(
  state: NotificationToastReplayState,
  contextKey: string,
) {
  if (state.contextKey === contextKey) return;
  state.contextKey = contextKey;
  state.replayCompleted = false;
  state.presentedIds.clear();
}

function compareNotificationAge(
  first: NotificationToastReplayItem,
  second: NotificationToastReplayItem,
) {
  const timeDifference = notificationTime(first.createdAt) - notificationTime(second.createdAt);
  if (timeDifference !== 0) return timeDifference;
  return first.id.localeCompare(second.id);
}

function notificationTime(createdAt?: string | null) {
  if (!createdAt) return 0;
  const time = new Date(createdAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}
