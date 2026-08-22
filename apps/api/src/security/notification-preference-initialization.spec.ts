import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { AuthService, isNotificationPreferenceInitializationRace } from '../auth/auth.service';

const preference = {
  id: 'preference-1',
  userId: 'user-1',
  communityId: 'community-1',
  announcementNotifications: false,
  eventNotifications: true,
  birthdayReminderNotifications: false,
  passportExpirationRemindersEnabled: true,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-02T00:00:00.000Z'),
};

test('concurrent notification preference initialization recovers the exact compound race', async () => {
  let upsertCalls = 0;
  let winningRows = 0;
  const upsertArguments: Array<Record<string, unknown>> = [];
  const prisma = {
    notificationPreference: {
      upsert: async (args: Record<string, unknown>) => {
        upsertArguments.push(args);
        upsertCalls += 1;
        if (upsertCalls === 1) {
          winningRows += 1;
          await Promise.resolve();
          return preference;
        }
        throw uniqueError('NotificationPreference', ['userId', 'communityId']);
      },
      findUniqueOrThrow: async () => preference,
    },
  };
  const service = authService(prisma);

  const [first, second] = await Promise.all([
    service.notificationPreferences('user-1', 'community-1'),
    service.notificationPreferences('user-1', 'community-1'),
  ]);

  assert.equal(winningRows, 1);
  assert.deepEqual(first, preference);
  assert.deepEqual(second, preference);
  assert.deepEqual(upsertArguments[0], {
    where: { userId_communityId: { userId: 'user-1', communityId: 'community-1' } },
    update: {},
    create: { userId: 'user-1', communityId: 'community-1' },
  });
});

test('existing notification preferences are returned without resetting choices', async () => {
  let recovered = false;
  const prisma = {
    notificationPreference: {
      upsert: async (args: { update: Record<string, unknown> }) => {
        assert.deepEqual(args.update, {});
        return preference;
      },
      findUniqueOrThrow: async () => {
        recovered = true;
        return preference;
      },
    },
  };

  const result = await authService(prisma).notificationPreferences('user-1', 'community-1');

  assert.deepEqual(result, preference);
  assert.equal(recovered, false);
  assert.equal(result.announcementNotifications, false);
  assert.equal(result.birthdayReminderNotifications, false);
});

test('notification preference initialization remains scoped by user and community', async () => {
  const rows = new Map<string, typeof preference>();
  const prisma = {
    notificationPreference: {
      upsert: async (args: { create: { userId: string; communityId: string } }) => {
        const key = `${args.create.userId}:${args.create.communityId}`;
        const row = rows.get(key) ?? { ...preference, id: `preference-${rows.size + 1}`, ...args.create };
        rows.set(key, row);
        return row;
      },
      findUniqueOrThrow: async () => {
        throw new Error('Recovery should not run without a race.');
      },
    },
  };
  const service = authService(prisma);

  await service.notificationPreferences('user-1', 'community-1');
  await service.notificationPreferences('user-1', 'community-2');
  await service.notificationPreferences('user-2', 'community-1');

  assert.equal(rows.size, 3);
});

test('only the NotificationPreference user-community P2002 is recoverable', async () => {
  const expected = uniqueError('NotificationPreference', ['userId', 'communityId']);
  assert.equal(isNotificationPreferenceInitializationRace(expected), true);
  assert.equal(isNotificationPreferenceInitializationRace(uniqueError('User', ['userId', 'communityId'])), false);
  assert.equal(isNotificationPreferenceInitializationRace(uniqueError('NotificationPreference', ['id'])), false);
  assert.equal(isNotificationPreferenceInitializationRace(new Error('database unavailable')), false);

  for (const error of [
    uniqueError('User', ['userId', 'communityId']),
    uniqueError('NotificationPreference', ['id']),
    new Error('database unavailable'),
  ]) {
    const service = authService({
      notificationPreference: {
        upsert: async () => { throw error; },
        findUniqueOrThrow: async () => preference,
      },
    });
    await assert.rejects(service.notificationPreferences('user-1', 'community-1'), (caught) => caught === error);
  }
});

function uniqueError(modelName: string, target: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Synthetic unique constraint failure.', {
    code: 'P2002',
    clientVersion: '6.1.0',
    meta: { modelName, target },
  });
}

function authService(prisma: object) {
  return new AuthService(
    prisma as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
}
