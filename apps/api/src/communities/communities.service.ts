import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AnnouncementAuthorMode, EventTask, EventTaskActivityType, EventTaskStatus, FeedCommentAuthorMode, Prisma, RsvpStatus } from '@prisma/client';
import { EventTaskCollaborationService, UploadedEventTaskAttachmentFile } from '../event-tasks-realtime/event-task-collaboration.service';
import { EventTasksRealtimeGateway } from '../event-tasks-realtime/event-tasks-realtime.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { buildTaskBoardOverview } from '../task-board-overview';
import { ProfileLinksService } from '../profile-links/profile-links.service';

type MemberEventTaskRecord = EventTask & {
  assignee: {
    id: string;
    name: string;
    memberships: {
      profile: { avatarUrl: string | null; dicebearStyle: string | null; dicebearSeed: string | null } | null;
    }[];
  } | null;
  assignees: Array<{ userId: string; user: { id: string; name: string; memberships: { profile: { avatarUrl: string | null; dicebearStyle: string | null; dicebearSeed: string | null } | null }[] } }>;
  checklistItems: { isCompleted: boolean }[];
};

type MemberScheduleSourceFilter = 'events' | 'taskDeadlines';

const MEMBER_SCHEDULE_SOURCES: MemberScheduleSourceFilter[] = ['events', 'taskDeadlines'];

export type FeedPublisherVerification = 'ADMINISTRATOR' | 'OWNER' | 'OFFICIAL_COMMUNITY' | null;

export function feedPublisherVerification(authorMode: AnnouncementAuthorMode | FeedCommentAuthorMode, roleKey?: string | null): FeedPublisherVerification {
  if (authorMode === 'COMMUNITY_TEAM') return 'OFFICIAL_COMMUNITY';
  if (roleKey?.toLowerCase() === 'owner') return 'OWNER';
  return roleKey?.toLowerCase() === 'admin' ? 'ADMINISTRATOR' : null;
}

const feedCommentAuthorSelect = (communityId: string) => Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  memberships: {
    where: { communityId },
    take: 1,
    select: {
      role: { select: { key: true } },
      profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } },
    },
  },
});

@Injectable()
export class CommunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventTasksRealtime: EventTasksRealtimeGateway,
    private readonly eventTaskCollaboration: EventTaskCollaborationService,
    private readonly profileLinks: ProfileLinksService,
  ) {}

  async feed(communityId: string, userId: string) {
    const announcements = await this.prisma.announcement.findMany({
      where: { communityId, status: 'PUBLISHED', publishedAt: { not: null }, deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      include: {
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId }, take: 1, select: { id: true } },
      },
    });
    if (!announcements.length) return { announcements: [], unreadCount: 0, readTrackingAvailable: false };

    const announcementIds = announcements.map((announcement) => announcement.id);
    const [notifications, publishLogs] = await Promise.all([
      this.prisma.notification.findMany({
        where: { communityId, userId, type: 'ANNOUNCEMENT_PUBLISHED' },
        select: { id: true, metadata: true, readAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          communityId,
          action: 'announcement.published',
          targetType: 'Announcement',
          targetId: { in: announcementIds },
          actorUserId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { targetId: true, actorUserId: true },
      }),
    ]);

    const receiptByAnnouncementId = new Map<string, { notificationId: string; readAt: Date | null }>();
    for (const notification of notifications) {
      const announcementId = announcementIdFromNotificationMetadata(notification.metadata);
      if (announcementId && announcementIds.includes(announcementId)) {
        receiptByAnnouncementId.set(announcementId, { notificationId: notification.id, readAt: notification.readAt });
      }
    }

    const publisherIdByAnnouncementId = new Map<string, string>();
    for (const log of publishLogs) {
      if (log.actorUserId && !publisherIdByAnnouncementId.has(log.targetId)) {
        publisherIdByAnnouncementId.set(log.targetId, log.actorUserId);
      }
    }
    const publisherIds = [...new Set(publisherIdByAnnouncementId.values())];
    const publishers = publisherIds.length
      ? await this.prisma.user.findMany({
        where: { id: { in: publisherIds } },
        select: {
          id: true,
          name: true,
          memberships: {
            where: { communityId },
            take: 1,
            select: {
              role: { select: { key: true } },
              profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } },
            },
          },
        },
      })
      : [];
    const publisherById = new Map(publishers.map((publisher) => [publisher.id, publisher]));

    const feedAnnouncements = announcements.map((announcement) => {
      const { _count, likes, ...announcementData } = announcement;
      const publisherId = publisherIdByAnnouncementId.get(announcement.id);
      const publisher = publisherId ? publisherById.get(publisherId) : undefined;
      const profile = publisher?.memberships[0]?.profile;
      const communityTeam = announcement.authorMode === AnnouncementAuthorMode.COMMUNITY_TEAM;
      const verification = feedPublisherVerification(announcement.authorMode, publisher?.memberships[0]?.role.key);
      return {
        ...announcementData,
        likeCount: _count.likes,
        commentCount: _count.comments,
        viewerHasLiked: likes.length > 0,
        publisher: communityTeam ? {
          id: null,
          name: 'Community team',
          avatarUrl: null,
          dicebearStyle: null,
          dicebearSeed: null,
          mode: AnnouncementAuthorMode.COMMUNITY_TEAM,
          verification,
        } : publisher ? {
          id: publisher.id,
          name: publisher.name,
          avatarUrl: profile?.avatarUrl ?? null,
          dicebearStyle: profile?.dicebearStyle ?? null,
          dicebearSeed: profile?.dicebearSeed ?? null,
          mode: AnnouncementAuthorMode.USER,
          verification,
        } : null,
        readReceipt: receiptByAnnouncementId.get(announcement.id) ?? null,
      };
    });
    const receipts = [...receiptByAnnouncementId.values()];
    return {
      announcements: feedAnnouncements,
      unreadCount: receipts.filter((receipt) => !receipt.readAt).length,
      readTrackingAvailable: receipts.length > 0,
    };
  }

  async toggleFeedLike(communityId: string, announcementId: string, userId: string) {
    await this.requireVisibleFeedAnnouncement(communityId, announcementId);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.feedLike.findUnique({
        where: { announcementId_userId: { announcementId, userId } },
        select: { id: true },
      });
      if (existing) {
        await tx.feedLike.delete({ where: { id: existing.id } });
      } else {
        await tx.feedLike.create({ data: { communityId, announcementId, userId } });
      }
      const likeCount = await tx.feedLike.count({ where: { communityId, announcementId } });
      return { announcementId, likeCount, viewerHasLiked: !existing };
    });
  }

  async feedComments(communityId: string, announcementId: string, userId: string) {
    await this.requireVisibleFeedAnnouncement(communityId, announcementId);
    return this.feedCommentThread(communityId, announcementId, userId);
  }

  async adminFeedComments(communityId: string, announcementId: string, userId: string) {
    await this.requireFeedAnnouncement(communityId, announcementId);
    return this.feedCommentThread(communityId, announcementId, userId);
  }

  private async feedCommentThread(communityId: string, announcementId: string, userId: string) {
    const comments = await this.prisma.feedComment.findMany({
      where: { communityId, announcementId, parentId: null },
      include: {
        user: { select: feedCommentAuthorSelect(communityId) },
        likes: { where: { userId }, take: 1, select: { id: true } },
        _count: { select: { likes: true } },
        replies: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            user: { select: feedCommentAuthorSelect(communityId) },
            likes: { where: { userId }, take: 1, select: { id: true } },
            _count: { select: { likes: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { comments: comments.map(feedCommentShape) };
  }

  async addFeedComment(communityId: string, announcementId: string, userId: string, rawBody: unknown, rawParentId?: unknown, rawAuthorMode?: unknown) {
    const body = feedCommentBody(rawBody);
    const parentId = feedCommentParentId(rawParentId);
    const authorMode = feedCommentAuthorMode(rawAuthorMode);
    if (authorMode === FeedCommentAuthorMode.COMMUNITY_TEAM) throw new ForbiddenException('Community team identity requires admin access.');
    await this.requireVisibleFeedAnnouncement(communityId, announcementId);
    return this.createFeedComment(communityId, announcementId, userId, body, parentId, authorMode);
  }

  async addAdminFeedComment(communityId: string, announcementId: string, userId: string, rawBody: unknown, rawParentId?: unknown, rawAuthorMode?: unknown) {
    const body = feedCommentBody(rawBody);
    const parentId = feedCommentParentId(rawParentId);
    const authorMode = feedCommentAuthorMode(rawAuthorMode);
    await this.requireFeedAnnouncement(communityId, announcementId);
    if (authorMode === FeedCommentAuthorMode.COMMUNITY_TEAM) await this.requireCommunityTeamAuthor(communityId, userId);
    return this.createFeedComment(communityId, announcementId, userId, body, parentId, authorMode);
  }

  private async createFeedComment(communityId: string, announcementId: string, userId: string, body: string, parentId: string | null, authorMode: FeedCommentAuthorMode) {
    if (parentId) {
      const parent = await this.prisma.feedComment.findFirst({
        where: { id: parentId, communityId, announcementId, parentId: null },
        select: { id: true },
      });
      if (!parent) throw new BadRequestException('Reply target is invalid.');
    }
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.feedComment.create({
        data: { communityId, announcementId, userId, parentId, body, authorMode },
        include: {
          user: { select: feedCommentAuthorSelect(communityId) },
          likes: { where: { userId }, take: 1, select: { id: true } },
          _count: { select: { likes: true } },
        },
      });
      const commentCount = await tx.feedComment.count({ where: { communityId, announcementId } });
      return { comment: feedCommentShape(comment), commentCount, parentId };
    });
  }

  async toggleFeedCommentLike(communityId: string, announcementId: string, commentId: string, userId: string) {
    await this.requireVisibleFeedAnnouncement(communityId, announcementId);
    return this.toggleFeedCommentLikeForAnnouncement(communityId, announcementId, commentId, userId);
  }

  async toggleAdminFeedCommentLike(communityId: string, announcementId: string, commentId: string, userId: string) {
    await this.requireFeedAnnouncement(communityId, announcementId);
    return this.toggleFeedCommentLikeForAnnouncement(communityId, announcementId, commentId, userId);
  }

  private async toggleFeedCommentLikeForAnnouncement(communityId: string, announcementId: string, commentId: string, userId: string) {
    const comment = await this.prisma.feedComment.findFirst({
      where: { id: commentId, communityId, announcementId },
      select: { id: true },
    });
    if (!comment) throw new NotFoundException('Feed comment not found.');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.feedCommentLike.findUnique({
        where: { commentId_userId: { commentId, userId } },
        select: { id: true },
      });
      if (existing) {
        await tx.feedCommentLike.delete({ where: { id: existing.id } });
      } else {
        await tx.feedCommentLike.create({ data: { communityId, commentId, userId } });
      }
      const likeCount = await tx.feedCommentLike.count({ where: { communityId, commentId } });
      return { commentId, likeCount, viewerHasLiked: !existing };
    });
  }

  private async requireVisibleFeedAnnouncement(communityId: string, announcementId: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id: announcementId, communityId, status: 'PUBLISHED', publishedAt: { not: null }, deletedAt: null },
      select: { id: true },
    });
    if (!announcement) throw new NotFoundException('Feed update not found.');
    return announcement;
  }

  private async requireFeedAnnouncement(communityId: string, announcementId: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id: announcementId, communityId, deletedAt: null },
      select: { id: true },
    });
    if (!announcement) throw new NotFoundException('Announcement not found.');
    return announcement;
  }

  private async requireCommunityTeamAuthor(communityId: string, userId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { communityId, userId, status: 'ACTIVE' },
      select: { role: { select: { key: true } } },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role.key.toLowerCase())) {
      throw new ForbiddenException('Community team identity requires admin access.');
    }
  }

  async events(communityId: string, userId: string) {
    const events = await this.prisma.event.findMany({
      where: { communityId },
      orderBy: { startsAt: 'asc' },
      include: { rsvps: true },
    });
    return {
      events: events.map((event) => ({
        ...event,
        rsvpCounts: rsvpCounts(event.rsvps),
        myRsvp: event.rsvps.find((rsvp) => rsvp.userId === userId)?.status ?? null,
      })),
    };
  }

  async schedule(communityId: string, userId: string, query: Record<string, unknown>) {
    const settings = await this.prisma.communitySettings.findUnique({ where: { communityId }, select: { timezone: true } });
    const timezone = safeMemberScheduleTimezone(settings?.timezone);
    const month = memberScheduleMonth(query.month, timezone);
    const selectedSources = memberScheduleSources(query.sources);
    const [year, monthNumber] = month.split('-').map(Number);
    const rangeStart = new Date(Date.UTC(year, monthNumber - 1, 1) - 2 * 86_400_000);
    const rangeEnd = new Date(Date.UTC(year, monthNumber, 1) + 2 * 86_400_000);

    const [events, tasks] = await Promise.all([
      this.prisma.event.findMany({
        where: { communityId, startsAt: { gte: rangeStart, lt: rangeEnd } },
        select: {
          id: true, title: true, description: true, startsAt: true, location: true, onlineUrl: true, capacity: true,
          rsvps: { where: { userId }, take: 1, select: { status: true } },
        },
      }),
      this.prisma.eventTask.findMany({
        where: {
          communityId,
          archivedAt: null,
          dueDate: { gte: rangeStart, lt: rangeEnd },
          taskBoardId: { not: null },
          taskBoard: { communityId, archivedAt: null },
          assignees: { some: { communityId, userId, archivedAt: null } },
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          dueDate: true,
          taskBoardId: true,
          taskBoard: { select: { id: true, name: true, event: { select: { title: true } } } },
          checklistItems: { where: { archivedAt: null }, select: { isCompleted: true } },
        },
      }),
    ]);

    const entries = [
      ...events
        .filter((event) => memberScheduleDateKey(event.startsAt, timezone).startsWith(month))
        .map((event) => ({
          id: `event:${event.id}`,
          source: 'EVENT' as const,
          title: event.title,
          description: event.description,
          startsAt: event.startsAt.toISOString(),
          endsAt: null,
          allDay: false,
          colorKey: 'emerald' as const,
          eventId: event.id,
          taskBoardId: null,
          taskId: null,
          actionHref: `/dashboard/events/${event.id}`,
          metadata: [{ label: 'LOCATION', value: event.location }],
          event: { location: event.location, onlineUrl: event.onlineUrl, capacity: event.capacity, myRsvp: event.rsvps[0]?.status ?? null },
        })),
      ...tasks
        .filter((task) => task.dueDate && task.taskBoardId && task.taskBoard && memberScheduleDateKey(task.dueDate, timezone).startsWith(month))
        .map((task) => {
          const completed = task.checklistItems.filter((item) => item.isCompleted).length;
          return {
            id: `task:${task.id}`,
            source: 'TASK_DEADLINE' as const,
            title: task.title,
            description: task.description,
            startsAt: task.dueDate!.toISOString(),
            endsAt: null,
            allDay: false,
            colorKey: 'cyan' as const,
            eventId: null,
            taskBoardId: task.taskBoardId,
            taskId: task.id,
            actionHref: `/dashboard/task-boards/${task.taskBoardId}?section=board&taskId=${task.id}`,
            metadata: [
              { label: 'BOARD', value: task.taskBoard!.event?.title ?? task.taskBoard!.name },
              { label: 'STATUS', value: task.status },
              { label: 'DUE_DATE', value: task.dueDate!.toISOString() },
              ...(task.checklistItems.length ? [{ label: 'CHECKLIST_PROGRESS', value: `${completed}/${task.checklistItems.length}` }] : []),
            ],
            event: null,
          };
        }),
    ].sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.title.localeCompare(right.title));

    const sourceSummary = {
      all: entries.length,
      events: entries.filter((entry) => entry.source === 'EVENT').length,
      taskDeadlines: entries.filter((entry) => entry.source === 'TASK_DEADLINE').length,
    };

    return {
      month,
      generatedAt: new Date().toISOString(),
      entries: entries.filter((entry) => selectedSources.has(entry.source === 'EVENT' ? 'events' : 'taskDeadlines')),
      sourceSummary,
    };
  }

  async event(communityId: string, eventId: string, userId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, communityId },
      include: { rsvps: true },
    });
    if (!event) throw new NotFoundException('Event not found.');
    return {
      ...event,
      rsvpCounts: rsvpCounts(event.rsvps),
      myRsvp: event.rsvps.find((rsvp) => rsvp.userId === userId)?.status ?? null,
    };
  }

  async eventTasks(communityId: string, eventId: string, userId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    const tasks = await this.prisma.eventTask.findMany({
      where: { communityId, eventId, archivedAt: null },
      include: memberEventTaskInclude(communityId),
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { tasks: tasks.map((task) => memberEventTaskShape(task, userId)) };
  }

  async assignedEventTasks(communityId: string, userId: string) {
    const tasks = await this.prisma.eventTask.findMany({
      where: { communityId, assignees: { some: { userId, archivedAt: null } }, archivedAt: null, event: { communityId, startsAt: { gte: new Date() } } },
      select: {
        id: true,
        eventId: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        updatedAt: true,
        event: { select: { title: true } },
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { status: 'asc' }, { updatedAt: 'desc' }],
      take: 5,
    });
    return {
      assignedEventTasks: tasks.map((task) => ({
        id: task.id,
        eventId: task.eventId,
        eventTitle: task.event.title,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
      })),
    };
  }

  async taskBoards(communityId: string, userId: string, query: Record<string, unknown>) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 10));
    const q = typeof query.q === 'string' ? query.q.trim().toLocaleLowerCase() : '';
    const scope = ['ASSIGNED_TO_ME', 'PUBLIC', 'EVENT_LINKED', 'STANDALONE'].includes(String(query.scope)) ? String(query.scope) : 'ALL';
    const status = ['TODO', 'IN_PROGRESS', 'DONE', 'AT_RISK'].includes(String(query.status)) ? String(query.status) : 'ALL';
    const sort = ['updatedAt', 'createdAt', 'name', 'progress', 'dueDate'].includes(String(query.sort)) ? String(query.sort) : 'updatedAt';
    const direction = query.direction === 'asc' ? 'asc' : 'desc';
    const boards = await this.prisma.taskBoard.findMany({
      where: {
        communityId,
        archivedAt: null,
        OR: [
          { eventId: { not: null } },
          { visibility: 'PUBLIC' },
          { tasks: { some: { communityId, assignees: { some: { userId, archivedAt: null } }, archivedAt: null } } },
        ],
      },
      include: {
        event: { select: { id: true, title: true, startsAt: true } },
        tasks: { where: { archivedAt: null }, include: memberEventTaskInclude(communityId) },
      },
    });
    const visibleBoards = boards.map((board) => memberTaskBoardShape(board, userId));
    const shaped = visibleBoards.filter((board) => {
      if (q && !`${board.name} ${board.linkedEvent?.title ?? ''}`.toLocaleLowerCase().includes(q)) return false;
      if (scope === 'ASSIGNED_TO_ME' && board.memberRole !== 'ASSIGNED') return false;
      if (scope === 'PUBLIC' && board.visibility !== 'PUBLIC') return false;
      if (scope === 'EVENT_LINKED' && !board.linkedEvent) return false;
      if (scope === 'STANDALONE' && board.linkedEvent) return false;
      if (status === 'AT_RISK' && board.taskCounts.overdue === 0) return false;
      if (status === 'TODO' && board.taskCounts.todo === 0) return false;
      if (status === 'IN_PROGRESS' && board.taskCounts.inProgress === 0) return false;
      if (status === 'DONE' && (board.taskCounts.total === 0 || board.taskCounts.done !== board.taskCounts.total)) return false;
      return true;
    }).sort((left, right) => {
      if (left.memberRole !== right.memberRole) return left.memberRole === 'ASSIGNED' ? -1 : 1;
      if (sort === 'updatedAt' && left.taskCounts.overdue !== right.taskCounts.overdue) return right.taskCounts.overdue - left.taskCounts.overdue;
      if (sort === 'updatedAt' && left.taskCounts.dueSoon !== right.taskCounts.dueSoon) return right.taskCounts.dueSoon - left.taskCounts.dueSoon;
      let comparison = 0;
      if (sort === 'name') comparison = left.name.localeCompare(right.name);
      else if (sort === 'createdAt') comparison = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      else if (sort === 'progress') comparison = memberTaskBoardProgress(left) - memberTaskBoardProgress(right);
      else if (sort === 'dueDate') comparison = nullableTime(left.nextDueDate) - nullableTime(right.nextDueDate);
      else comparison = new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      return direction === 'asc' ? comparison : -comparison;
    });
    const total = shaped.length;
    return {
      items: shaped.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      metrics: {
        assignedBoards: visibleBoards.filter((board) => board.memberRole === 'ASSIGNED').length,
        publicBoards: visibleBoards.filter((board) => board.visibility === 'PUBLIC').length,
        dueSoon: visibleBoards.reduce((sum, board) => sum + board.taskCounts.dueSoon, 0),
        overdue: visibleBoards.reduce((sum, board) => sum + board.taskCounts.overdue, 0),
      },
    };
  }

  async taskBoard(communityId: string, boardId: string, userId: string) {
    const recentActivitySince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const board = await this.prisma.taskBoard.findFirst({
      where: {
        id: boardId,
        communityId,
        archivedAt: null,
        OR: [
          { eventId: { not: null } },
          { visibility: 'PUBLIC' },
          { tasks: { some: { communityId, assignees: { some: { userId, archivedAt: null } }, archivedAt: null } } },
        ],
      },
      include: {
        event: { select: { id: true, title: true, startsAt: true } },
        tasks: {
          where: { archivedAt: null },
          include: {
            ...memberEventTaskInclude(communityId),
            _count: { select: { comments: { where: { archivedAt: null } }, attachments: { where: { archivedAt: null } }, activities: { where: { createdAt: { gte: recentActivitySince } } } } },
          },
          orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!board) throw new NotFoundException('Task board not found.');
    const summary = memberTaskBoardShape(board, userId);
    return { ...summary, tasks: board.tasks.map((task) => memberEventTaskShape(task, userId)), overview: buildTaskBoardOverview(board.tasks, { currentUserId: userId }) };
  }

  async updateEventTaskStatus(communityId: string, eventId: string, taskId: string, userId: string, rawStatus: unknown) {
    await this.requireVisibleEvent(communityId, eventId);
    const status = memberEventTaskStatus(rawStatus);
    const existing = await this.prisma.eventTask.findFirst({
      where: { id: taskId, communityId, eventId, assignees: { some: { userId, archivedAt: null } }, archivedAt: null },
    });
    if (!existing) throw new ForbiddenException('Only the assigned member can update this task.');
    const task = await this.prisma.$transaction(async (tx) => {
      const highestOrder = await tx.eventTask.aggregate({
        where: { communityId, eventId, status, archivedAt: null, id: { not: existing.id } },
        _max: { sortOrder: true },
      });
      const updated = await tx.eventTask.update({
        where: { id: existing.id },
        data: { status, sortOrder: (highestOrder._max.sortOrder ?? -1) + 1 },
        include: memberEventTaskInclude(communityId),
      });
      await tx.auditLog.create({
        data: { communityId, actorUserId: userId, action: 'event.task.member_moved', targetType: 'EventTask', targetId: existing.id, metadata: { eventId, from: existing.status, to: status } },
      });
      if (existing.status !== status) {
        await this.eventTaskCollaboration.recordActivity(tx, communityId, eventId, existing.id, userId, [{ type: EventTaskActivityType.STATUS_CHANGED, metadata: { from: existing.status, to: status } }]);
      }
      return updated;
    });
    this.eventTasksRealtime.emitTaskChanged({
      communityId,
      eventId,
      taskId: task.id,
      reason: 'member-status-updated',
      changedAt: new Date().toISOString(),
    });
    return memberEventTaskShape(task, userId);
  }

  async eventTaskActivity(communityId: string, eventId: string, taskId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    return this.eventTaskCollaboration.activity(communityId, eventId, taskId);
  }

  async eventTaskComments(communityId: string, eventId: string, taskId: string, userId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    return this.eventTaskCollaboration.comments(communityId, eventId, taskId, userId, false);
  }

  async addEventTaskComment(communityId: string, eventId: string, taskId: string, userId: string, body: unknown) {
    await this.requireVisibleEvent(communityId, eventId);
    const task = await this.prisma.eventTask.findFirst({ where: { id: taskId, communityId, eventId, archivedAt: null }, select: { assignees: { where: { userId, archivedAt: null }, select: { id: true } } } });
    if (!task) throw new NotFoundException('Event task not found.');
    if (!task.assignees.length) throw new ForbiddenException('Only an assigned member can comment on this task.');
    return this.eventTaskCollaboration.addComment(communityId, eventId, taskId, userId, body);
  }

  async archiveEventTaskComment(communityId: string, eventId: string, taskId: string, commentId: string, userId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    return this.eventTaskCollaboration.archiveComment(communityId, eventId, taskId, commentId, userId, false);
  }

  async eventTaskAttachments(communityId: string, eventId: string, taskId: string, userId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    return this.eventTaskCollaboration.attachments(communityId, eventId, taskId, userId, false);
  }

  async addEventTaskAttachments(communityId: string, eventId: string, taskId: string, userId: string, files: UploadedEventTaskAttachmentFile[]) {
    await this.requireVisibleEvent(communityId, eventId);
    const task = await this.prisma.eventTask.findFirst({ where: { id: taskId, communityId, eventId, archivedAt: null }, select: { assignees: { where: { userId, archivedAt: null }, select: { id: true } } } });
    if (!task?.assignees.length) throw new ForbiddenException('Only an assigned member can attach files to this task.');
    return this.eventTaskCollaboration.addAttachments(communityId, eventId, taskId, userId, files);
  }

  async eventTaskAttachmentDownload(communityId: string, eventId: string, taskId: string, attachmentId: string, _userId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    return this.eventTaskCollaboration.attachmentDownload(communityId, eventId, taskId, attachmentId);
  }

  async archiveEventTaskAttachment(communityId: string, eventId: string, taskId: string, attachmentId: string, userId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    return this.eventTaskCollaboration.archiveAttachment(communityId, eventId, taskId, attachmentId, userId, false);
  }

  async eventTaskChecklist(communityId: string, eventId: string, taskId: string, userId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    const task = await this.prisma.eventTask.findFirst({ where: { id: taskId, communityId, eventId, archivedAt: null }, select: { assignees: { where: { userId, archivedAt: null }, select: { id: true } } } });
    if (!task) throw new NotFoundException('Event task not found.');
    return this.eventTaskCollaboration.checklist(communityId, eventId, taskId, userId, false, task.assignees.length > 0);
  }

  async addEventTaskChecklistItem(communityId: string, eventId: string, taskId: string, userId: string, title: unknown) {
    await this.requireAssignedTask(communityId, eventId, taskId, userId);
    return this.eventTaskCollaboration.addChecklistItem(communityId, eventId, taskId, userId, title, false);
  }

  async updateEventTaskChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, userId: string, title: unknown) {
    await this.requireAssignedTask(communityId, eventId, taskId, userId);
    return this.eventTaskCollaboration.updateChecklistItem(communityId, eventId, taskId, itemId, userId, title, false);
  }

  async toggleEventTaskChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, userId: string) {
    await this.requireAssignedTask(communityId, eventId, taskId, userId);
    return this.eventTaskCollaboration.toggleChecklistItem(communityId, eventId, taskId, itemId, userId, false);
  }

  async archiveEventTaskChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, userId: string) {
    await this.requireAssignedTask(communityId, eventId, taskId, userId);
    return this.eventTaskCollaboration.archiveChecklistItem(communityId, eventId, taskId, itemId, userId, false);
  }

  private async requireAssignedTask(communityId: string, eventId: string, taskId: string, userId: string) {
    await this.requireVisibleEvent(communityId, eventId);
    const task = await this.prisma.eventTask.findFirst({ where: { id: taskId, communityId, eventId, assignees: { some: { userId, archivedAt: null } }, archivedAt: null }, select: { id: true } });
    if (!task) throw new ForbiddenException('Only the assigned member can update this checklist.');
    return task;
  }

  async settings(communityId: string) {
    const settings = await this.prisma.communitySettings.findUnique({ where: { communityId } });
    return {
      memberDirectoryVisibility: settings?.memberDirectoryVisibility ?? 'members_only',
      defaultLanguage: settings?.defaultLanguage ?? 'en',
      timezone: settings?.timezone ?? 'UTC',
    };
  }

  async members(communityId: string, viewerUserId: string) {
    await this.assertDirectoryVisible(communityId);
    const memberships = await this.prisma.membership.findMany({
      where: { communityId, status: 'ACTIVE' },
      orderBy: { joinedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
        role: { select: { name: true, key: true } },
        profile: { select: publicProfileSelect },
      },
    });
    return Promise.all(memberships.map(async (membership) => ({ ...membership, profileLinks: await this.profileLinks.listForDirectory(viewerUserId, communityId, membership.id) })));
  }

  async member(communityId: string, memberId: string, viewerUserId: string) {
    await this.assertDirectoryVisible(communityId);
    const membership = await this.prisma.membership.findFirst({
      where: { id: memberId, communityId, status: 'ACTIVE' },
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
        role: { select: { name: true, key: true } },
        profile: { select: publicProfileSelect },
      },
    });
    if (!membership) throw new NotFoundException('Member not found.');
    return { ...membership, profileLinks: await this.profileLinks.listForDirectory(viewerUserId, communityId, membership.id) };
  }

  private async assertDirectoryVisible(communityId: string) {
    const settings = await this.prisma.communitySettings.findUnique({ where: { communityId }, select: { memberDirectoryVisibility: true } });
    if (settings?.memberDirectoryVisibility === 'hidden') throw new ForbiddenException('Member directory is hidden.');
  }

  async rsvp(communityId: string, eventId: string, userId: string, status: RsvpStatus) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, communityId } });
    if (!event) throw new NotFoundException('Event not found.');
    return this.prisma.eventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      update: { status },
      create: { eventId, userId, status },
    });
  }

  private async requireVisibleEvent(communityId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, communityId }, select: { id: true } });
    if (!event) throw new NotFoundException('Event not found.');
    return event;
  }
}

const publicProfileSelect = {
  title: true,
  avatarUrl: true,
  dicebearStyle: true,
  dicebearSeed: true,
  bio: true,
  location: true,
  interests: true,
  skills: true,
};

function rsvpCounts(rsvps: { status: RsvpStatus }[]) {
  return {
    going: rsvps.filter((rsvp) => rsvp.status === 'GOING').length,
    maybe: rsvps.filter((rsvp) => rsvp.status === 'MAYBE').length,
    declined: rsvps.filter((rsvp) => rsvp.status === 'DECLINED').length,
  };
}

function memberEventTaskInclude(communityId: string) {
  return Prisma.validator<Prisma.EventTaskInclude>()({
    assignee: {
      select: {
        id: true,
        name: true,
        memberships: {
          where: { communityId },
          take: 1,
          select: { profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } } },
        },
      },
    },
    assignees: {
      where: { archivedAt: null },
      orderBy: { assignedAt: 'asc' },
      include: { user: { select: { id: true, name: true, memberships: { where: { communityId }, take: 1, select: { profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } } } } } } },
    },
    checklistItems: { where: { archivedAt: null }, select: { isCompleted: true } },
  });
}

function memberEventTaskShape(task: MemberEventTaskRecord, userId: string) {
  const assignees = task.assignees.map(({ user }) => ({ id: user.id, name: user.name, ...(user.memberships[0]?.profile ?? {}) }));
  return {
    id: task.id,
    eventId: task.eventId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    label: task.label,
    dueDate: task.dueDate,
    sortOrder: task.sortOrder,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    assignee: assignees[0] ?? null,
    assignees,
    canUpdateStatus: task.assignees.some((assignment) => assignment.userId === userId),
    checklistProgress: {
      completed: task.checklistItems.filter((item) => item.isCompleted).length,
      total: task.checklistItems.length,
    },
  };
}

function memberTaskBoardShape(board: any, userId: string) {
  const now = new Date();
  const dueSoonAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tasks: any[] = Array.isArray(board.tasks) ? board.tasks : [];
  const assignedToMe = tasks.filter((task) => task.assignees?.some((assignment: any) => assignment.userId === userId)).length;
  const todo = tasks.filter((task) => task.status === EventTaskStatus.TODO).length;
  const inProgress = tasks.filter((task) => task.status === EventTaskStatus.IN_PROGRESS).length;
  const done = tasks.filter((task) => task.status === EventTaskStatus.DONE).length;
  const overdue = tasks.filter((task) => task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate < now).length;
  const dueSoon = tasks.filter((task) => task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate >= now && task.dueDate <= dueSoonAt).length;
  const checklistTotal = tasks.reduce((sum, task) => sum + (task.checklistItems?.length ?? 0), 0);
  const checklistCompleted = tasks.reduce((sum, task) => sum + (task.checklistItems?.filter((item: any) => item.isCompleted).length ?? 0), 0);
  const assignees = new Map<string, any>();
  tasks.forEach((task) => {
    (task.assignees ?? []).forEach((assignment: any) => {
      const user = assignment.user;
      const profile = user.memberships?.[0]?.profile;
      assignees.set(user.id, { id: user.id, name: user.name, avatarUrl: profile?.avatarUrl ?? null, dicebearStyle: profile?.dicebearStyle ?? null, dicebearSeed: profile?.dicebearSeed ?? null });
    });
  });
  const dueDates = tasks.filter((task) => task.status !== EventTaskStatus.DONE && task.dueDate).map((task) => task.dueDate as Date).sort((left, right) => left.getTime() - right.getTime());
  const latestTaskUpdate = tasks.reduce((latest, task) => Math.max(latest, new Date(task.updatedAt).getTime()), 0);
  return {
    id: board.id,
    name: board.event?.title ?? board.name,
    description: board.description ?? null,
    visibility: board.visibility,
    linkedEvent: board.event ? { id: board.event.id, title: board.event.title, startsAt: board.event.startsAt } : null,
    createdAt: board.createdAt,
    updatedAt: new Date(Math.max(new Date(board.updatedAt).getTime(), latestTaskUpdate)),
    memberRole: assignedToMe > 0 ? 'ASSIGNED' as const : 'VIEWER' as const,
    taskCounts: { total: tasks.length, assignedToMe, todo, inProgress, done, overdue, dueSoon },
    checklistProgress: { completed: checklistCompleted, total: checklistTotal },
    assignees: Array.from(assignees.values()),
    nextDueDate: dueDates[0] ?? null,
  };
}

function memberTaskBoardProgress(board: { taskCounts: { total: number; done: number } }) {
  return board.taskCounts.total ? board.taskCounts.done / board.taskCounts.total : 0;
}

function nullableTime(value: Date | string | null) {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeMemberScheduleTimezone(value: string | null | undefined) {
  const timezone = value?.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'UTC';
  }
}

function memberScheduleDateKey(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function memberScheduleMonth(value: unknown, timezone: string) {
  if (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return memberScheduleDateKey(new Date(), timezone).slice(0, 7);
}

function memberScheduleSources(value: unknown) {
  const requested = typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter((item): item is MemberScheduleSourceFilter => MEMBER_SCHEDULE_SOURCES.includes(item as MemberScheduleSourceFilter))
    : [];
  return new Set<MemberScheduleSourceFilter>(requested.length ? requested : MEMBER_SCHEDULE_SOURCES);
}

function announcementIdFromNotificationMetadata(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return typeof metadata.announcementId === 'string' ? metadata.announcementId : null;
}

function feedCommentBody(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestException('Comment is required.');
  const body = value.trim();
  if (!body) throw new BadRequestException('Comment is required.');
  if (body.length > 1000) throw new BadRequestException('Comment must be 1,000 characters or fewer.');
  return body;
}

function feedCommentParentId(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('Reply target is invalid.');
  return value.trim();
}

function feedCommentAuthorMode(value: unknown): FeedCommentAuthorMode {
  if (value === undefined || value === null) return FeedCommentAuthorMode.USER;
  if (value === FeedCommentAuthorMode.USER || value === FeedCommentAuthorMode.COMMUNITY_TEAM) return value;
  throw new BadRequestException('Comment author mode is invalid.');
}

type FeedCommentAuthorProfile = {
  avatarUrl: string | null;
  dicebearStyle: string | null;
  dicebearSeed: string | null;
};

type FeedCommentShapeInput = {
  id: string;
  body: string;
  createdAt: Date;
  authorMode: FeedCommentAuthorMode;
  user: { id: string; name: string; memberships: Array<{ role: { key: string }; profile: FeedCommentAuthorProfile | null }> };
  likes?: Array<{ id: string }>;
  _count?: { likes: number };
  replies?: FeedCommentShapeInput[];
};

type FeedCommentResponseDto = {
  id: string;
  body: string;
  createdAt: Date;
  likeCount: number;
  viewerHasLiked: boolean;
  author: { id: string | null; name: string; mode: FeedCommentAuthorMode; verification: FeedPublisherVerification } & FeedCommentAuthorProfile;
  replies: FeedCommentResponseDto[];
};

function feedCommentShape(comment: FeedCommentShapeInput): FeedCommentResponseDto {
  const profile = comment.user.memberships[0]?.profile;
  const communityTeam = comment.authorMode === FeedCommentAuthorMode.COMMUNITY_TEAM;
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    likeCount: comment._count?.likes ?? 0,
    viewerHasLiked: Boolean(comment.likes?.length),
    author: {
      id: communityTeam ? null : comment.user.id,
      name: communityTeam ? 'Community team' : comment.user.name,
      avatarUrl: communityTeam ? null : profile?.avatarUrl ?? null,
      dicebearStyle: communityTeam ? null : profile?.dicebearStyle ?? null,
      dicebearSeed: communityTeam ? null : profile?.dicebearSeed ?? null,
      mode: comment.authorMode,
      verification: feedPublisherVerification(comment.authorMode, comment.user.memberships[0]?.role.key),
    },
    replies: (comment.replies ?? []).map(feedCommentShape),
  };
}

function memberEventTaskStatus(raw: unknown): EventTaskStatus {
  if (typeof raw !== 'string' || !Object.values(EventTaskStatus).includes(raw as EventTaskStatus)) throw new BadRequestException('Task status is invalid.');
  return raw as EventTaskStatus;
}
