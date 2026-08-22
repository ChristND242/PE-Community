import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeNotificationToastReplay,
  createNotificationToastReplayState,
  markNotificationToastPresented,
  notificationToastCandidates,
  notificationToastContextKey,
} from './notification-toast-replay';

type TestNotification = {
  id: string;
  readAt?: string | null;
  createdAt?: string | null;
};

const adminContext = notificationToastContextKey({
  audience: 'admin',
  communityId: 'community-1',
  userId: 'user-1',
});

test('initial replay returns every unread notification oldest first', () => {
  const state = createNotificationToastReplayState();
  const notifications: TestNotification[] = [
    { id: 'newest', createdAt: '2026-07-24T10:00:00.000Z' },
    { id: 'read', readAt: '2026-07-24T09:30:00.000Z', createdAt: '2026-07-24T08:00:00.000Z' },
    { id: 'oldest', createdAt: '2026-07-24T07:00:00.000Z' },
  ];

  assert.deepEqual(
    notificationToastCandidates(state, adminContext, notifications, true).map(({ id }) => id),
    ['oldest', 'newest'],
  );
});

test('refetches and live/startup races do not present an ID twice', () => {
  const state = createNotificationToastReplayState();
  const notification = { id: 'notification-1', createdAt: '2026-07-24T10:00:00.000Z' };

  assert.equal(notificationToastCandidates(state, adminContext, [notification], true).length, 1);
  markNotificationToastPresented(state, adminContext, notification.id);
  completeNotificationToastReplay(state, adminContext);
  assert.equal(notificationToastCandidates(state, adminContext, [notification], true).length, 0);
});

test('an empty initial response does not suppress a later notification', () => {
  const state = createNotificationToastReplayState();

  assert.deepEqual(notificationToastCandidates(state, adminContext, [], true), []);
  completeNotificationToastReplay(state, adminContext);

  assert.deepEqual(
    notificationToastCandidates(
      state,
      adminContext,
      [{ id: 'live-notification', createdAt: '2026-07-24T10:00:00.000Z' }],
      true,
    ).map(({ id }) => id),
    ['live-notification'],
  );
});

test('a context change resets deduplication without mixing audiences', () => {
  const state = createNotificationToastReplayState();
  const notification = { id: 'shared-id', createdAt: '2026-07-24T10:00:00.000Z' };
  const memberContext = notificationToastContextKey({
    audience: 'member',
    communityId: 'community-1',
    userId: 'user-1',
  });

  markNotificationToastPresented(state, adminContext, notification.id);
  assert.equal(notificationToastCandidates(state, adminContext, [notification], true).length, 0);
  assert.equal(notificationToastCandidates(state, memberContext, [notification], true).length, 1);
});

test('the same ID may replay in a separate authenticated session', () => {
  const firstSession = createNotificationToastReplayState();
  const secondSession = createNotificationToastReplayState();
  const notification = { id: 'notification-1', createdAt: '2026-07-24T10:00:00.000Z' };

  markNotificationToastPresented(firstSession, adminContext, notification.id);

  assert.equal(notificationToastCandidates(firstSession, adminContext, [notification], true).length, 0);
  assert.equal(notificationToastCandidates(secondSession, adminContext, [notification], true).length, 1);
});

test('switching users resets the active presentation registry', () => {
  const state = createNotificationToastReplayState();
  const notification = { id: 'notification-1', createdAt: '2026-07-24T10:00:00.000Z' };
  const secondUserContext = notificationToastContextKey({
    audience: 'admin',
    communityId: 'community-1',
    userId: 'user-2',
  });

  markNotificationToastPresented(state, adminContext, notification.id);

  assert.equal(notificationToastCandidates(state, secondUserContext, [notification], true).length, 1);
});

test('a failed or incomplete load does not mark replay complete', () => {
  const state = createNotificationToastReplayState();

  assert.deepEqual(
    notificationToastCandidates(
      state,
      adminContext,
      [{ id: 'notification-1', createdAt: '2026-07-24T10:00:00.000Z' }],
      false,
    ),
    [],
  );
  assert.equal(state.replayCompleted, false);
  assert.equal(state.presentedIds.size, 0);
});
