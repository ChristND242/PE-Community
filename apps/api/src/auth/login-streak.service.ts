import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const transactionAttempts = 3;

export type LoginStreakBoard = {
  currentStreak: number;
  longestStreak: number;
  activeToday: boolean;
  rank: number | null;
  totalRankedUsers: number;
  leader: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    currentStreak: number;
    longestStreak: number;
  } | null;
};

export type AdminLoginStreakAudit = {
  summary: {
    activeToday: number;
    rankedUsers: number;
    averageCurrentStreak: number;
    longestActiveStreak: number;
    atRiskCount: number;
    resetsRecently: number;
  };
  board: {
    leader: LoginStreakBoard['leader'];
    totalRankedUsers: number;
  };
  leaderboard: Array<{
    rank: number | null;
    userId: string;
    displayName: string;
    role: string;
    avatarUrl: string | null;
    dicebearStyle: string | null;
    dicebearSeed: string | null;
    currentStreak: number;
    longestStreak: number;
    lastActiveDay: string | null;
    status: 'ACTIVE_TODAY' | 'AT_RISK' | 'LOST' | 'NO_STREAK';
  }>;
  atRisk: Array<{
    userId: string;
    displayName: string;
    role: string;
    avatarUrl: string | null;
    dicebearStyle: string | null;
    dicebearSeed: string | null;
    currentStreak: number;
    lastActiveDay: string | null;
  }>;
  events: Array<{
    id: string;
    userId: string;
    displayName: string;
    role: string;
    type: string;
    loginDate: string;
    previousCurrentStreak: number;
    newCurrentStreak: number;
    previousLongestStreak: number;
    newLongestStreak: number;
  }>;
};

@Injectable()
export class LoginStreakService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAuthenticatedSessionStreak(userId: string, communityId: string, timezone: string) {
    const existing = await this.prisma.userLoginStreak.findUnique({
      where: { communityId_userId: { communityId, userId } },
      select: { id: true },
    });
    if (existing) return;
    await this.recordSuccessfulLogin(userId, communityId, timezone);
  }

  async recordSuccessfulLogin(userId: string, communityId: string, timezone: string, now = new Date()) {
    const today = communityDateValue(now, timezone);
    const yesterday = previousDateValue(today);

    for (let attempt = 0; attempt < transactionAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const existing = await tx.userLoginStreak.findUnique({
            where: { communityId_userId: { communityId, userId } },
          });

          if (!existing) {
            const created = await tx.userLoginStreak.create({
              data: {
                communityId,
                userId,
                currentStreak: 1,
                longestStreak: 1,
                lastLoginDate: today,
                lastLoginAt: now,
              },
            });
            await tx.userLoginStreakEvent.create({
              data: {
                communityId,
                userId,
                type: 'CREATED',
                loginDate: today,
                previousCurrentStreak: 0,
                newCurrentStreak: 1,
                previousLongestStreak: 0,
                newLongestStreak: 1,
                timezone,
              },
            });
            return created;
          }

          if (sameDateValue(existing.lastLoginDate, today)) {
            return tx.userLoginStreak.update({
              where: { id: existing.id },
              data: { lastLoginAt: now },
            });
          }

          const currentStreak = sameDateValue(existing.lastLoginDate, yesterday)
            ? existing.currentStreak + 1
            : 1;
          const longestStreak = Math.max(existing.longestStreak, currentStreak);
          const eventType = sameDateValue(existing.lastLoginDate, yesterday) ? 'INCREMENTED' : 'RESET';

          const updated = await tx.userLoginStreak.update({
            where: { id: existing.id },
            data: {
              currentStreak,
              longestStreak,
              lastLoginDate: today,
              lastLoginAt: now,
            },
          });
          await tx.userLoginStreakEvent.create({
            data: {
              communityId,
              userId,
              type: eventType,
              loginDate: today,
              previousCurrentStreak: existing.currentStreak,
              newCurrentStreak: currentStreak,
              previousLongestStreak: existing.longestStreak,
              newLongestStreak: longestStreak,
              timezone,
            },
          });
          return updated;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt < transactionAttempts - 1 && isRetryableTransactionError(error)) continue;
        throw error;
      }
    }
  }

  async board(userId: string, communityId: string, timezone: string, now = new Date()): Promise<LoginStreakBoard> {
    const today = communityDateValue(now, timezone);
    const yesterday = previousDateValue(today);
    const rows = await this.prisma.userLoginStreak.findMany({
      where: {
        communityId,
        user: {
          memberships: {
            some: { communityId, status: MembershipStatus.ACTIVE },
          },
        },
      },
      select: {
        userId: true,
        currentStreak: true,
        longestStreak: true,
        lastLoginDate: true,
        lastLoginAt: true,
        user: {
          select: {
            name: true,
            memberships: {
              where: { communityId, status: MembershipStatus.ACTIVE },
              select: { profile: { select: { avatarUrl: true } } },
              take: 1,
            },
          },
        },
      },
    });

    const ranked = rows
      .map((row) => ({
        ...row,
        currentStreak: isActiveStreakDate(row.lastLoginDate, today, yesterday) ? row.currentStreak : 0,
      }))
      .sort((left, right) =>
        right.currentStreak - left.currentStreak
        || right.longestStreak - left.longestStreak
        || dateTime(right.lastLoginAt) - dateTime(left.lastLoginAt),
      );
    const currentIndex = ranked.findIndex((row) => row.userId === userId);
    const current = currentIndex >= 0 ? ranked[currentIndex] : null;
    const leader = ranked[0] ?? null;

    return {
      currentStreak: current?.currentStreak ?? 0,
      longestStreak: current?.longestStreak ?? 0,
      activeToday: current ? sameDateValue(current.lastLoginDate, today) : false,
      rank: currentIndex >= 0 ? currentIndex + 1 : null,
      totalRankedUsers: ranked.length,
      leader: leader ? {
        userId: leader.userId,
        displayName: leader.user.name,
        avatarUrl: leader.user.memberships[0]?.profile?.avatarUrl ?? null,
        currentStreak: leader.currentStreak,
        longestStreak: leader.longestStreak,
      } : null,
    };
  }

  async adminAudit(communityId: string, timezone: string, now = new Date()): Promise<AdminLoginStreakAudit> {
    const today = communityDateValue(now, timezone);
    const yesterday = previousDateValue(today);
    const recentResetStart = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
    const activeMembershipWhere = { communityId, status: MembershipStatus.ACTIVE } as const;
    const [memberships, events, resetsRecently] = await Promise.all([
      this.prisma.membership.findMany({
        where: activeMembershipWhere,
        select: {
          userId: true,
          role: { select: { key: true } },
          profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } },
          user: {
            select: {
              name: true,
              loginStreaks: {
                where: { communityId },
                select: {
                  currentStreak: true,
                  longestStreak: true,
                  lastLoginDate: true,
                  lastLoginAt: true,
                },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.userLoginStreakEvent.findMany({
        where: {
          communityId,
          user: { memberships: { some: activeMembershipWhere } },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          userId: true,
          type: true,
          loginDate: true,
          previousCurrentStreak: true,
          newCurrentStreak: true,
          previousLongestStreak: true,
          newLongestStreak: true,
          user: {
            select: {
              name: true,
              memberships: {
                where: activeMembershipWhere,
                select: { role: { select: { key: true } } },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.userLoginStreakEvent.count({
        where: {
          communityId,
          type: 'RESET',
          loginDate: { gte: recentResetStart },
          user: { memberships: { some: activeMembershipWhere } },
        },
      }),
    ]);

    const rows = memberships.map((membership) => {
      const streak = membership.user.loginStreaks[0] ?? null;
      const lastLoginDate = streak?.lastLoginDate ?? null;
      const activeToday = sameDateValue(lastLoginDate, today);
      const atRisk = sameDateValue(lastLoginDate, yesterday);
      const status = !streak || !lastLoginDate
        ? 'NO_STREAK' as const
        : activeToday
          ? 'ACTIVE_TODAY' as const
          : atRisk
            ? 'AT_RISK' as const
            : 'LOST' as const;
      return {
        userId: membership.userId,
        displayName: membership.user.name,
        role: membership.role.key,
        avatarUrl: membership.profile?.avatarUrl ?? null,
        dicebearStyle: membership.profile?.dicebearStyle ?? null,
        dicebearSeed: membership.profile?.dicebearSeed ?? null,
        currentStreak: activeToday || atRisk ? streak?.currentStreak ?? 0 : 0,
        longestStreak: streak?.longestStreak ?? 0,
        lastActiveDay: storageDateKey(lastLoginDate),
        lastLoginAt: streak?.lastLoginAt ?? null,
        status,
        ranked: Boolean(streak && lastLoginDate),
      };
    });
    const ranked = rows
      .filter((row) => row.ranked)
      .sort((left, right) =>
        right.currentStreak - left.currentStreak
        || right.longestStreak - left.longestStreak
        || dateTime(right.lastLoginAt) - dateTime(left.lastLoginAt),
      );
    const rankByUserId = new Map(ranked.map((row, index) => [row.userId, index + 1]));
    const unranked = rows.filter((row) => !row.ranked).sort((left, right) => left.displayName.localeCompare(right.displayName));
    const leaderboardRows = [...ranked, ...unranked];
    const leader = ranked[0] ?? null;
    const currentTotal = ranked.reduce((total, row) => total + row.currentStreak, 0);

    return {
      summary: {
        activeToday: rows.filter((row) => row.status === 'ACTIVE_TODAY').length,
        rankedUsers: ranked.length,
        averageCurrentStreak: ranked.length ? Math.round((currentTotal / ranked.length) * 10) / 10 : 0,
        longestActiveStreak: ranked.reduce((longest, row) => Math.max(longest, row.currentStreak), 0),
        atRiskCount: rows.filter((row) => row.status === 'AT_RISK').length,
        resetsRecently,
      },
      board: {
        leader: leader ? {
          userId: leader.userId,
          displayName: leader.displayName,
          avatarUrl: leader.avatarUrl,
          currentStreak: leader.currentStreak,
          longestStreak: leader.longestStreak,
        } : null,
        totalRankedUsers: ranked.length,
      },
      leaderboard: leaderboardRows.map((row) => ({
        rank: rankByUserId.get(row.userId) ?? null,
        userId: row.userId,
        displayName: row.displayName,
        role: row.role,
        avatarUrl: row.avatarUrl,
        dicebearStyle: row.dicebearStyle,
        dicebearSeed: row.dicebearSeed,
        currentStreak: row.currentStreak,
        longestStreak: row.longestStreak,
        lastActiveDay: row.lastActiveDay,
        status: row.status,
      })),
      atRisk: ranked
        .filter((row) => row.status === 'AT_RISK')
        .map((row) => ({
          userId: row.userId,
          displayName: row.displayName,
          role: row.role,
          avatarUrl: row.avatarUrl,
          dicebearStyle: row.dicebearStyle,
          dicebearSeed: row.dicebearSeed,
          currentStreak: row.currentStreak,
          lastActiveDay: row.lastActiveDay,
        })),
      events: events.map((event) => ({
        id: event.id,
        userId: event.userId,
        displayName: event.user.name,
        role: event.user.memberships[0]?.role.key ?? 'member',
        type: event.type,
        loginDate: storageDateKey(event.loginDate)!,
        previousCurrentStreak: event.previousCurrentStreak,
        newCurrentStreak: event.newCurrentStreak,
        previousLongestStreak: event.previousLongestStreak,
        newLongestStreak: event.newLongestStreak,
      })),
    };
  }
}

function communityDateValue(value: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
}

function previousDateValue(value: Date) {
  return new Date(value.getTime() - 24 * 60 * 60 * 1000);
}

function sameDateValue(left: Date | null, right: Date) {
  return left?.getTime() === right.getTime();
}

function isActiveStreakDate(value: Date | null, today: Date, yesterday: Date) {
  return sameDateValue(value, today) || sameDateValue(value, yesterday);
}

function dateTime(value: Date | null) {
  return value?.getTime() ?? 0;
}

function storageDateKey(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function isRetryableTransactionError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002');
}
