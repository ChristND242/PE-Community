import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EmailLocale, EMAIL_LOCALES, LocalizedEmailTemplate, evaluateAutomationExecution, normalizeEmailLocale, renderTemplateEmail, type AutomationSkipReason } from '@pe/shared';
import { AnnouncementAuthorMode, AnnouncementStatus, EventTaskActivityType, EventTaskPriority, EventTaskStatus, NotificationTemplateKey, Prisma, TaskBoardAutomationRuleChangeType, TaskBoardAutomationRuleType, TaskBoardStatus } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { defaultDicebearProfile, profileData, stringValue } from '../auth/auth.service';
import { EmailChangeService } from '../auth/email-change.service';
import { profileLinkDtoSelect, safeProfileLinkResponses } from '../profile-links/profile-links.service';
import { LoginStreakService } from '../auth/login-streak.service';
import { EmailService } from '../email/email.service';
import { EventTasksRealtimeGateway } from '../event-tasks-realtime/event-tasks-realtime.gateway';
import { EventTaskCollaborationService, UploadedEventTaskAttachmentFile } from '../event-tasks-realtime/event-task-collaboration.service';
import { editableTemplateRequiredVariables, emailTemplatePreviewContext, emailTemplateUsesLayoutAction, ensureCommunityMessageTemplates, isEditableEmailTemplateKey, messageTemplateDefinition, missingRequiredVariables, templateDefaultContent, templateVariablesJson } from '../message-templates';
import { allowedNotificationTemplatePlaceholders, automationNotificationTemplateDefinitions, brandedAutomationEmail, ensureAutomationNotificationTemplates, notificationTemplateDefinition, renderNotificationTemplate, sampleTemplateVariables, templateChannelScope, templateContentChanged, validateNotificationTemplatePlaceholders } from '../notification-templates';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../security/password.service';
import { realtimeSessionRegistry } from '../auth/realtime-session-registry';
import { RegistrationSettingsService } from '../registration/registration-settings.service';
import { buildTaskBoardOverview } from '../task-board-overview';
import { dateInPeriod } from '../period-analytics';
import { parseTaskBoardAutomationRange, taskBoardAutomationComparison, taskBoardAutomationPeriod, taskBoardAutomationSparkline, type TaskBoardAutomationPeriod } from '../task-board-automation-analytics';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, ROLE_HIERARCHY, SystemRole, normalizeSystemRole } from '../rbac/permissions';
import { publicationCoverMutation, type PublicationCoverMutation } from '../publication-covers';
import { publicationCoverPublicUrl, publicationCoverUploadDir, type PublicationCoverUploadFile } from '../uploads';

const eventTaskInclude = Prisma.validator<Prisma.EventTaskInclude>()({
  assignee: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  assignees: {
    where: { archivedAt: null },
    orderBy: { assignedAt: 'asc' },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  },
  checklistItems: { where: { archivedAt: null }, select: { isCompleted: true } },
});

type EventTaskWithAssignee = Prisma.EventTaskGetPayload<{ include: typeof eventTaskInclude }>;
type EventTaskUpdateData = {
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: Date | null;
  priority?: EventTaskPriority;
  label?: string | null;
};
const EVENT_TASK_STATUSES = [EventTaskStatus.TODO, EventTaskStatus.IN_PROGRESS, EventTaskStatus.DONE] as const;
const AUTOMATION_FAILURE_REASONS = {
  CONFIGURATION_ERROR: 'Automation configuration is incomplete or no longer valid.',
  SMTP_UNAVAILABLE: 'Email delivery is enabled but SMTP is not available.',
  TEMPLATE_ERROR: 'The notification template could not be rendered safely.',
  RECIPIENT_ERROR: 'No eligible recipients are available for the current task state.',
  EXECUTION_ERROR: 'The automation could not be completed safely.',
} as const;
type AutomationFailureCategory = keyof typeof AUTOMATION_FAILURE_REASONS;
const automationRetryRunInclude = Prisma.validator<Prisma.TaskBoardAutomationRunInclude>()({
  rule: true,
  board: { select: { id: true, name: true, status: true, archivedAt: true, event: { select: { id: true, title: true, startsAt: true } } } },
  task: {
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      priority: true,
      archivedAt: true,
      eventId: true,
      taskBoardId: true,
      assignees: { where: { archivedAt: null }, select: { userId: true, user: { select: { id: true, name: true, email: true } } } },
      checklistItems: { where: { archivedAt: null }, select: { isCompleted: true, updatedAt: true } },
      createdAt: true,
      updatedAt: true,
      activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      comments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
      attachments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
    },
  },
});
type AutomationRetryRun = Prisma.TaskBoardAutomationRunGetPayload<{ include: typeof automationRetryRunInclude }>;

const OPERATIONS_CALENDAR_SOURCES = ['events', 'birthdays', 'anniversaries', 'expirations', 'taskDeadlines', 'automation'] as const;
type OperationsCalendarSourceFilter = (typeof OPERATIONS_CALENDAR_SOURCES)[number];
type OperationsCalendarEntrySource = 'EVENT' | 'BIRTHDAY' | 'MEMBERSHIP_ANNIVERSARY' | 'DOCUMENT_EXPIRATION' | 'TASK_DEADLINE' | 'AUTOMATION_REMINDER';
type OperationsCalendarEntry = {
  id: string;
  source: OperationsCalendarEntrySource;
  title: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  colorKey: 'emerald' | 'amber' | 'violet' | 'red' | 'cyan' | 'blue';
  description: string | null;
  memberId: string | null;
  eventId: string | null;
  taskBoardId: string | null;
  taskId: string | null;
  automationRuleId: string | null;
  actionHref: string | null;
  metadata: Array<{ label: string; value: string }>;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly loginStreaks: LoginStreakService,
    private readonly eventTasksRealtime: EventTasksRealtimeGateway,
    private readonly eventTaskCollaboration: EventTaskCollaborationService,
    private readonly passwords: PasswordService,
    private readonly registrationSettings: RegistrationSettingsService,
    private readonly emailChanges: EmailChangeService,
  ) {}

  async overview(communityId: string, actorUserId: string) {
    const [totalMembers, activeMembers, suspendedMembers, pendingRegistrations, recentRsvps, events, announcements, recentActivity] = await Promise.all([
      this.prisma.membership.count({ where: { communityId } }),
      this.prisma.membership.count({ where: { communityId, status: 'ACTIVE' } }),
      this.prisma.membership.count({ where: { communityId, status: 'SUSPENDED' } }),
      this.prisma.registrationApplication.count({ where: { communityId, status: 'PENDING' } }),
      this.prisma.eventRsvp.count({ where: { event: { communityId } } }),
      this.prisma.event.findMany({
        where: { communityId },
        orderBy: { startsAt: 'asc' },
        include: { rsvps: true },
        take: 5,
      }),
      this.prisma.announcement.findMany({ where: { communityId, status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 3 }),
      this.prisma.auditLog.findMany({ where: { communityId }, orderBy: { createdAt: 'desc' }, take: 6 }),
    ]);
    const statusGroups = await this.prisma.membership.groupBy({ by: ['status'], where: { communityId }, _count: true });
    const applicationGroups = await this.prisma.registrationApplication.groupBy({ by: ['status'], where: { communityId }, _count: true });
    return {
      metrics: {
        totalMembers,
        activeMembers,
        suspendedMembers,
        pendingRegistrations,
        recentRsvps,
        announcements: announcements.length,
        upcomingEvents: events.length,
        recentAdminActions: recentActivity.length,
      },
      charts: {
        membersByStatus: statusGroups.map((item) => ({ label: item.status, value: item._count })),
        registrationPipeline: applicationGroups.map((item) => ({ label: item.status, value: item._count })),
        eventRsvps: events.map((event) => ({ label: event.title, value: event.rsvps.filter((rsvp) => rsvp.status === 'GOING').length })),
        recentAdminActivity: recentActivity.reduce<{ label: string; value: number }[]>((acc, item) => {
          const existing = acc.find((entry) => entry.label === item.action);
          if (existing) existing.value += 1;
          else acc.push({ label: item.action, value: 1 });
          return acc;
        }, []),
      },
      events,
      announcements,
      recentActivity,
      actorUserId,
    };
  }

  async streakAudit(communityId: string) {
    const settings = await this.prisma.communitySettings.findUnique({
      where: { communityId },
      select: { timezone: true },
    });
    return this.loginStreaks.adminAudit(communityId, settings?.timezone ?? 'UTC');
  }

  adminUnreadNotificationCount(communityId: string, userId: string) {
    return this.prisma.notification.count({
      where: {
        ...adminNotificationWhere(communityId, userId),
        readAt: null,
      },
    });
  }

  async adminNotifications(communityId: string, userId: string) {
    return {
      notifications: await this.prisma.notification.findMany({
        where: adminNotificationWhere(communityId, userId),
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
    };
  }

  async markAdminNotificationRead(communityId: string, userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, ...adminNotificationWhere(communityId, userId) },
    });
    if (!notification) throw new NotFoundException('Notification not found.');
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }

  async members(communityId: string) {
    const members = await this.prisma.membership.findMany({
      where: { communityId },
      orderBy: { joinedAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true, updatedAt: true, twoFactorEnabled: true } }, role: true, profile: true, profileLinks: { select: profileLinkDtoSelect, orderBy: { position: 'asc' } } },
    });
    return members.map((member) => ({ ...member, profileLinks: safeProfileLinkResponses(member.profileLinks) }));
  }

  async exportUsersAudit(communityId: string, actorUserId: string) {
    const fields = ['membershipId', 'userId', 'displayName', 'email', 'role', 'status', 'joinedAt', 'userCreatedAt', 'userUpdatedAt'];
    const members = await this.prisma.membership.findMany({
      where: { communityId },
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true, updatedAt: true } }, role: true },
    });
    const rows = [
      fields,
      ...members.map((member) => [
        member.id,
        member.user.id,
        member.user.name,
        member.user.email,
        member.role.key,
        member.status,
        member.joinedAt.toISOString(),
        member.user.createdAt.toISOString(),
        member.user.updatedAt.toISOString(),
      ]),
    ];
    await this.prisma.auditLog.create({
      data: {
        communityId,
        actorUserId,
        action: 'USER_AUDIT_EXPORT',
        targetType: 'Community',
        targetId: communityId,
        metadata: { fields, rowCount: members.length },
      },
    });
    return {
      filename: `pe-community-users-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: rows.map((row) => row.map(csvCell).join(',')).join('\n'),
    };
  }

  async roles(communityId: string) {
    const roles = await this.prisma.role.findMany({
      where: { communityId, key: { in: ['owner', 'admin', 'member'] } },
      include: { _count: { select: { memberships: true } }, permissions: { include: { permission: true } } },
      orderBy: { key: 'asc' },
    });
    const counts = new Map(roles.map((role) => [role.key, role._count.memberships]));
    const permissionsByRole = new Map(roles.map((role) => [role.key, role.permissions.map((entry) => entry.permission.key)]));
    return {
      roles: (['owner', 'admin', 'member'] as const).map((role) => ({
        key: role,
        permissions: role === 'owner' ? ALL_PERMISSIONS : permissionsByRole.get(role) ?? [],
        userCount: counts.get(role) ?? 0,
        system: true,
        protected: role === 'owner',
      })),
      permissionGroups: PERMISSION_GROUPS,
      permissions: ALL_PERMISSIONS,
      hierarchy: ROLE_HIERARCHY,
    };
  }

  async updateRolePermissions(communityId: string, actorUserId: string, actorRoleKey: string, input: Record<string, unknown>) {
    if (normalizeSystemRole(actorRoleKey) !== 'owner') {
      throw new ForbiddenException('Only owners can edit permissions.');
    }
    const roleInputs = Array.isArray(input.roles) ? input.roles : null;
    if (!roleInputs) throw new BadRequestException('Invalid role permission payload.');

    const requestedRoles = roleInputs.map((entry) => {
      if (!entry || typeof entry !== 'object') throw new BadRequestException('Invalid role permission payload.');
      const roleKeyValue = (entry as { roleKey?: unknown }).roleKey;
      const permissionKeysValue = (entry as { permissionKeys?: unknown }).permissionKeys;
      if (typeof roleKeyValue !== 'string' || !Array.isArray(permissionKeysValue)) {
        throw new BadRequestException('Invalid role permission payload.');
      }
      const roleKey = roleKeyValue.toLowerCase();
      if (roleKey === 'owner') throw new BadRequestException('Owner permissions are protected.');
      if (roleKey !== 'admin' && roleKey !== 'member') throw new BadRequestException('Unknown role.');
      const permissionKeys = Array.from(new Set(permissionKeysValue));
      if (permissionKeys.some((permission) => typeof permission !== 'string' || !ALL_PERMISSIONS.includes(permission as (typeof ALL_PERMISSIONS)[number]))) {
        throw new BadRequestException('Unknown permission.');
      }
      return { roleKey: roleKey as Exclude<SystemRole, 'owner'>, permissionKeys: permissionKeys as string[] };
    });

    const duplicateRole = requestedRoles.find((role, index) => requestedRoles.findIndex((entry) => entry.roleKey === role.roleKey) !== index);
    if (duplicateRole) throw new BadRequestException('Duplicate role update.');

    await this.prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({
        where: { communityId, key: { in: requestedRoles.map((role) => role.roleKey) } },
        include: { permissions: { include: { permission: true } } },
      });
      const roleByKey = new Map(roles.map((role) => [role.key, role]));
      const permissions = await tx.permission.findMany({ where: { key: { in: ALL_PERMISSIONS } } });
      const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission]));

      for (const requestedRole of requestedRoles) {
        const role = roleByKey.get(requestedRole.roleKey);
        if (!role) throw new BadRequestException('Unknown role.');
        const previousKeys = role.permissions.map((entry) => entry.permission.key).sort();
        const nextKeys = [...requestedRole.permissionKeys].sort();
        const added = nextKeys.filter((permission) => !previousKeys.includes(permission));
        const removed = previousKeys.filter((permission) => !nextKeys.includes(permission));
        if (!added.length && !removed.length) continue;

        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (nextKeys.length) {
          await tx.rolePermission.createMany({
            data: nextKeys.map((permissionKey) => ({
              roleId: role.id,
              permissionId: permissionByKey.get(permissionKey)!.id,
            })),
            skipDuplicates: true,
          });
        }
        await tx.auditLog.create({
          data: {
            communityId,
            actorUserId,
            action: 'roles.permissions.updated',
            targetType: 'Role',
            targetId: role.id,
            metadata: { roleKey: requestedRole.roleKey, added, removed },
          },
        });
      }
    });

    return this.roles(communityId);
  }

  async events(communityId: string) {
    const events = await this.prisma.event.findMany({
      where: { communityId },
      orderBy: { startsAt: 'asc' },
      include: { rsvps: true },
    });
    return { events: events.map(adminEventShape) };
  }

  async operationsCalendar(
    communityId: string,
    query: Record<string, unknown>,
    access: { includeBirthdays: boolean; includeMembershipAnniversaries: boolean; includeDocumentExpirations: boolean },
  ) {
    const [settings, reminderSettings] = await Promise.all([
      this.prisma.communitySettings.findUnique({ where: { communityId }, select: { timezone: true } }),
      this.prisma.communityReminderSettings.findUnique({ where: { communityId } }),
    ]);
    const timezone = safeCalendarTimezone(settings?.timezone);
    const month = operationsCalendarMonth(query.month, timezone);
    const selectedSources = operationsCalendarSources(query.sources);
    const [year, monthNumber] = month.split('-').map(Number);
    const rangeStart = new Date(Date.UTC(year, monthNumber - 1, 1) - 2 * 86_400_000);
    const rangeEnd = new Date(Date.UTC(year, monthNumber, 1) + 2 * 86_400_000);
    const now = new Date();

    const [events, memberships, tasks, automationRules] = await Promise.all([
      this.prisma.event.findMany({
        where: { communityId, startsAt: { gte: rangeStart, lt: rangeEnd } },
        select: { id: true, title: true, description: true, startsAt: true, location: true },
      }),
      this.prisma.membership.findMany({
        where: { communityId, status: 'ACTIVE' },
        select: { id: true, joinedAt: true, user: { select: { name: true } }, profile: { select: { birthdate: true, passportExpiresAt: true } } },
      }),
      this.prisma.eventTask.findMany({
        where: { communityId, archivedAt: null, taskBoardId: { not: null }, taskBoard: { archivedAt: null }, dueDate: { gte: rangeStart, lt: rangeEnd } },
        select: {
          id: true, title: true, description: true, status: true, priority: true, dueDate: true, taskBoardId: true, eventId: true,
          taskBoard: { select: { name: true } },
          assignees: { where: { archivedAt: null }, select: { id: true } },
        },
      }),
      this.prisma.taskBoardAutomationRule.findMany({
        where: {
          communityId,
          enabled: true,
          archivedAt: null,
          type: { in: [TaskBoardAutomationRuleType.DUE_BEFORE, TaskBoardAutomationRuleType.OVERDUE, TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP, TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE, TaskBoardAutomationRuleType.OVERDUE_ESCALATION] },
          board: {
            archivedAt: null,
            status: TaskBoardStatus.ACTIVE,
            OR: [{ eventId: null }, { event: { startsAt: { gt: now } } }],
          },
        },
        select: {
          id: true, type: true, name: true, config: true,
          board: {
            select: {
              id: true, name: true,
              tasks: {
                where: { archivedAt: null, status: { not: EventTaskStatus.DONE } },
                select: {
                  id: true, title: true, description: true, status: true, dueDate: true, createdAt: true, updatedAt: true,
                  assignees: { where: { archivedAt: null }, select: { id: true } },
                  checklistItems: { where: { archivedAt: null }, select: { isCompleted: true, updatedAt: true } },
                  activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
                  comments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
                  attachments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    const entries: OperationsCalendarEntry[] = [];
    for (const event of events) {
      if (!calendarDateKeyInTimezone(event.startsAt, timezone).startsWith(month)) continue;
      entries.push(operationsCalendarEntry({ id: `event:${event.id}`, source: 'EVENT', title: event.title, description: event.description, startsAt: event.startsAt.toISOString(), endsAt: null, allDay: false, severity: 'INFO', eventId: event.id, actionHref: `/admin/events/${event.id}`, metadata: [{ label: 'LOCATION', value: event.location }] }));
    }

    for (const membership of memberships) {
      const memberName = membership.user.name;
      if (access.includeBirthdays && reminderSettings?.birthdayReminderEnabled !== false && membership.profile?.birthdate) {
        const occurrence = calendarAnnualOccurrence(membership.profile.birthdate, year);
        if (calendarDateKeyInTimezone(occurrence, 'UTC').startsWith(month)) entries.push(operationsCalendarEntry({ id: `birthday:${membership.id}:${year}`, source: 'BIRTHDAY', title: memberName, startsAt: occurrence.toISOString(), endsAt: null, allDay: true, severity: 'INFO', memberId: membership.id, actionHref: `/admin/members/${membership.id}`, metadata: [{ label: 'MEMBER', value: memberName }] }));
      }
      if (access.includeMembershipAnniversaries && reminderSettings?.anniversaryReminderEnabled !== false && membership.joinedAt.getUTCFullYear() <= year) {
        const occurrence = calendarAnnualOccurrence(membership.joinedAt, year);
        const years = year - membership.joinedAt.getUTCFullYear();
        if (years > 0 && calendarDateKeyInTimezone(occurrence, 'UTC').startsWith(month)) entries.push(operationsCalendarEntry({ id: `anniversary:${membership.id}:${year}`, source: 'MEMBERSHIP_ANNIVERSARY', title: memberName, startsAt: occurrence.toISOString(), endsAt: null, allDay: true, severity: 'INFO', memberId: membership.id, actionHref: `/admin/members/${membership.id}`, metadata: [{ label: 'MEMBER', value: memberName }, { label: 'YEARS', value: String(years) }] }));
      }
      if (access.includeDocumentExpirations && reminderSettings?.passportRemindersEnabled === true && membership.profile?.passportExpiresAt && calendarDateKeyInTimezone(membership.profile.passportExpiresAt, 'UTC').startsWith(month)) {
        const expiresAt = membership.profile.passportExpiresAt;
        entries.push(operationsCalendarEntry({ id: `passport:${membership.id}:${expiresAt.toISOString()}`, source: 'DOCUMENT_EXPIRATION', title: memberName, startsAt: expiresAt.toISOString(), endsAt: null, allDay: true, severity: operationsCalendarSeverity(expiresAt, now), memberId: membership.id, actionHref: `/admin/members/${membership.id}`, metadata: [{ label: 'MEMBER', value: memberName }, { label: 'DOCUMENT', value: 'PASSPORT' }] }));
      }
    }

    for (const task of tasks) {
      if (!task.dueDate || !task.taskBoardId || !task.taskBoard || !calendarDateKeyInTimezone(task.dueDate, timezone).startsWith(month)) continue;
      const assigneeValue = task.assignees.length === 0 ? 'UNASSIGNED' : String(task.assignees.length);
      entries.push(operationsCalendarEntry({
        id: `task:${task.id}`,
        source: 'TASK_DEADLINE',
        title: task.title,
        description: task.description,
        startsAt: task.dueDate.toISOString(),
        endsAt: null,
        allDay: false,
        severity: operationsCalendarTaskSeverity(task.dueDate, task.status, now),
        taskBoardId: task.taskBoardId,
        taskId: task.id,
        eventId: task.eventId,
        actionHref: `/admin/task-boards/${task.taskBoardId}?section=board&taskId=${task.id}`,
        metadata: [{ label: 'BOARD', value: task.taskBoard.name }, { label: 'STATUS', value: task.status }, { label: 'ASSIGNEES', value: assigneeValue }],
      }));
    }

    for (const rule of automationRules) {
      const config = rule.config as Record<string, unknown>;
      const delivery = operationsCalendarAutomationDelivery(config);
      if (!delivery) continue;
      const comparableTasks: AutomationValidationContext['tasks'] = rule.board.tasks.map((task) => ({ ...task, lastActivityAt: automationTaskLastActivityAt(task) }));
      for (const task of comparableTasks) {
        const eligibleAt = automationRuleEligibleAt(rule.type, config, task);
        if (!eligibleAt || !calendarDateKeyInTimezone(eligibleAt, timezone).startsWith(month)) continue;
        entries.push(operationsCalendarEntry({
          id: `automation:${rule.id}:${task.id}:${eligibleAt.toISOString()}`,
          source: 'AUTOMATION_REMINDER',
          title: rule.name?.trim() || rule.type,
          startsAt: eligibleAt.toISOString(),
          endsAt: null,
          allDay: false,
          severity: operationsCalendarAutomationSeverity(rule.type, task, eligibleAt, now),
          taskBoardId: rule.board.id,
          taskId: task.id,
          automationRuleId: rule.id,
          actionHref: `/admin/task-boards/${rule.board.id}?section=automation`,
          metadata: [{ label: 'BOARD', value: rule.board.name }, { label: 'RULE', value: rule.type }, { label: 'TASK', value: task.title }, { label: 'REMINDER_WINDOW', value: operationsCalendarAutomationWindow(rule.type, config) }, { label: 'DELIVERY', value: delivery }],
        }));
      }
    }

    const count = (source: OperationsCalendarSourceFilter) => entries.filter((entry) => operationsCalendarEntryFilter(entry.source) === source).length;
    const sourceSummary = { all: entries.length, events: count('events'), birthdays: count('birthdays'), membershipAnniversaries: count('anniversaries'), documentExpirations: count('expirations'), taskDeadlines: count('taskDeadlines'), automationReminders: count('automation') };
    return {
      month,
      timezone,
      generatedAt: new Date().toISOString(),
      entries: entries.filter((entry) => selectedSources.has(operationsCalendarEntryFilter(entry.source))).sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.title.localeCompare(right.title)),
      sourceSummary,
    };
  }

  async taskBoards(communityId: string, query: Record<string, unknown>) {
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 10));
    const q = typeof query.q === 'string' ? query.q.trim().toLocaleLowerCase() : '';
    const visibility = query.visibility === 'PRIVATE' || query.visibility === 'PUBLIC' ? query.visibility : 'ALL';
    const linked = query.linked === 'EVENT' || query.linked === 'STANDALONE' ? query.linked : 'ALL';
    const status = ['TODO', 'IN_PROGRESS', 'DONE', 'AT_RISK'].includes(String(query.status)) ? String(query.status) : 'ALL';
    const sort = ['createdAt', 'updatedAt', 'name', 'dueDate', 'progress'].includes(String(query.sort)) ? String(query.sort) : 'updatedAt';
    const direction = query.direction === 'asc' ? 'asc' : 'desc';
    const boards = await this.prisma.taskBoard.findMany({
      where: { communityId, archivedAt: null },
      include: {
        event: { select: { id: true, title: true, startsAt: true } },
        tasks: {
          where: { archivedAt: null },
          select: {
            status: true, dueDate: true,
            assignees: { where: { archivedAt: null }, include: { user: { select: { id: true, name: true, memberships: { where: { communityId }, take: 1, select: { profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } } } } } } } },
            checklistItems: { where: { archivedAt: null }, select: { isCompleted: true } },
          },
        },
      },
    });
    const shaped = boards.map(taskBoardShape).filter((board) => {
      if (q && !`${board.name} ${board.linkedEvent?.title ?? ''}`.toLocaleLowerCase().includes(q)) return false;
      if (visibility !== 'ALL' && board.visibility !== visibility) return false;
      if (linked === 'EVENT' && !board.linkedEvent) return false;
      if (linked === 'STANDALONE' && board.linkedEvent) return false;
      if (status === 'AT_RISK' && board.taskCounts.overdue === 0) return false;
      if (status === 'TODO' && board.taskCounts.todo === 0) return false;
      if (status === 'IN_PROGRESS' && board.taskCounts.inProgress === 0) return false;
      if (status === 'DONE' && (board.taskCounts.total === 0 || board.taskCounts.done !== board.taskCounts.total)) return false;
      return true;
    }).sort((left, right) => {
      let comparison = 0;
      if (sort === 'name') comparison = left.name.localeCompare(right.name);
      else if (sort === 'createdAt') comparison = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      else if (sort === 'dueDate') comparison = nullableTime(left.nextDueDate) - nullableTime(right.nextDueDate);
      else if (sort === 'progress') comparison = taskBoardProgress(left) - taskBoardProgress(right);
      else comparison = new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      return direction === 'asc' ? comparison : -comparison;
    });
    const total = shaped.length;
    const items = shaped.slice((page - 1) * pageSize, page * pageSize);
    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      metrics: {
        totalBoards: boards.length,
        activeBoards: boards.filter((board) => board.status === TaskBoardStatus.ACTIVE).length,
        atRiskBoards: boards.filter((board) => board.tasks.some((task) => task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate < new Date())).length,
        standaloneBoards: boards.filter((board) => !board.eventId).length,
        eventLinkedBoards: boards.filter((board) => Boolean(board.eventId)).length,
      },
    };
  }

  async taskBoard(communityId: string, boardId: string) {
    const recentActivitySince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const board = await this.prisma.taskBoard.findFirst({
      where: { id: boardId, communityId, archivedAt: null },
      include: {
        event: { select: { id: true, title: true, startsAt: true } },
        automationRules: { where: { type: 'FLAG_UNASSIGNED', enabled: true, archivedAt: null }, select: { config: true }, take: 1 },
        tasks: {
          where: { archivedAt: null },
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            assignees: { where: { archivedAt: null }, include: { user: { select: { id: true, name: true, email: true, memberships: { where: { communityId }, take: 1, select: { role: { select: { key: true } }, profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } } } } } } } },
            checklistItems: { where: { archivedAt: null }, select: { isCompleted: true } },
            _count: { select: { comments: { where: { archivedAt: null } }, attachments: { where: { archivedAt: null } }, activities: { where: { createdAt: { gte: recentActivitySince } } } } },
          },
          orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!board) throw new NotFoundException('Task board not found.');
    const summary = taskBoardShape(board);
    const flagLifecycle = evaluateAutomationExecution({ boardStatus: board.status, boardArchivedAt: board.archivedAt, eventStartsAt: board.event?.startsAt, ruleEnabled: true });
    const flagRule = flagLifecycle.eligible ? board.automationRules[0]?.config as Record<string, unknown> | undefined : undefined;
    return { ...summary, description: board.description, tasks: board.tasks.map(eventTaskShape), overview: buildTaskBoardOverview(board.tasks, { includeUnassignedBlockers: flagRule ? flagRule.includeInOverview !== false : true }), canManageTasks: Boolean(board.eventId) };
  }

  async createTaskBoard(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const eventId = nullableEventTaskString(input.eventId, 'Linked event', 200);
    const visibility = taskBoardVisibility(input.visibility);
    let name = taskBoardName(input.name);
    if (eventId) {
      const event = await this.requireCommunityEvent(communityId, eventId);
      const existing = await this.prisma.taskBoard.findFirst({ where: { communityId, eventId, archivedAt: null }, select: { id: true } });
      if (existing) throw new BadRequestException('This event already has an active task board.');
      name = event.title;
    }
    if (!name) throw new BadRequestException('Task board name is required.');
    const board = await this.prisma.taskBoard.create({ data: { communityId, eventId: eventId || null, name, description: nullableEventTaskString(input.description, 'Board description', 1000), visibility, createdById: actorUserId } });
    return this.taskBoard(communityId, board.id);
  }

  async updateTaskBoard(communityId: string, boardId: string, actorUserId: string, input: Record<string, unknown>) {
    const existing = await this.prisma.taskBoard.findFirst({ where: { id: boardId, communityId, archivedAt: null }, include: { event: { select: { title: true } } } });
    if (!existing) throw new NotFoundException('Task board not found.');
    const name = existing.event ? existing.event.title : taskBoardName(input.name);
    if (!name) throw new BadRequestException('Task board name is required.');
    await this.prisma.$transaction([
      this.prisma.taskBoard.update({ where: { id: existing.id }, data: { name, description: input.description === undefined ? existing.description : nullableEventTaskString(input.description, 'Board description', 1000), visibility: input.visibility === undefined ? existing.visibility : taskBoardVisibility(input.visibility) } }),
      this.prisma.auditLog.create({ data: { communityId, actorUserId, action: 'task.board.updated', targetType: 'TaskBoard', targetId: existing.id } }),
    ]);
    return this.taskBoard(communityId, existing.id);
  }

  async updateTaskBoardStatus(communityId: string, boardId: string, actorUserId: string, input: Record<string, unknown>) {
    const nextStatus = Object.values(TaskBoardStatus).includes(input.status as TaskBoardStatus)
      ? input.status as TaskBoardStatus
      : null;
    if (!nextStatus) throw new BadRequestException('Task board status is invalid.');
    const existing = await this.prisma.taskBoard.findFirst({ where: { id: boardId, communityId, archivedAt: null } });
    if (!existing) throw new NotFoundException('Task board not found.');
    if (existing.status === nextStatus) return this.taskBoard(communityId, existing.id);
    const transitions: Record<TaskBoardStatus, TaskBoardStatus[]> = {
      ACTIVE: [TaskBoardStatus.PAUSED, TaskBoardStatus.COMPLETED],
      PAUSED: [TaskBoardStatus.ACTIVE, TaskBoardStatus.COMPLETED],
      COMPLETED: [TaskBoardStatus.ACTIVE],
    };
    if (!transitions[existing.status].includes(nextStatus)) throw new BadRequestException('Task board status transition is not allowed.');
    const action = nextStatus === TaskBoardStatus.PAUSED
      ? 'task.board.paused'
      : nextStatus === TaskBoardStatus.COMPLETED
        ? 'task.board.completed'
        : existing.status === TaskBoardStatus.PAUSED
          ? 'task.board.resumed'
          : 'task.board.reopened';
    await this.prisma.$transaction(async (tx) => {
      await tx.taskBoard.update({ where: { id: existing.id }, data: { status: nextStatus } });
      await tx.auditLog.create({ data: { communityId, actorUserId, action, targetType: 'TaskBoard', targetId: existing.id, metadata: { boardId: existing.id, eventId: existing.eventId, previousStatus: existing.status, newStatus: nextStatus, reason: 'MANUAL' } } });
    });
    return this.taskBoard(communityId, existing.id);
  }

  async archiveTaskBoard(communityId: string, boardId: string, actorUserId: string) {
    const existing = await this.prisma.taskBoard.findFirst({ where: { id: boardId, communityId, archivedAt: null } });
    if (!existing) throw new NotFoundException('Task board not found.');
    if (existing.eventId) throw new BadRequestException('Event-linked task boards cannot be archived independently.');
    const archivedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.taskBoard.update({ where: { id: existing.id }, data: { archivedAt } }),
      this.prisma.eventTask.updateMany({ where: { communityId, taskBoardId: existing.id, archivedAt: null }, data: { archivedAt } }),
      this.prisma.auditLog.create({ data: { communityId, actorUserId, action: 'task.board.archived', targetType: 'TaskBoard', targetId: existing.id } }),
    ]);
    return { id: existing.id, archivedAt };
  }

  async taskBoardAutomationPresets(communityId: string) {
    const items = await this.prisma.taskBoardAutomationPreset.findMany({
      where: { communityId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { rules: true } },
      },
    });
    return {
      items: items.map((preset) => ({
        id: preset.id,
        name: preset.name,
        description: preset.description,
        ruleCount: preset._count.rules,
        updatedAt: preset.updatedAt,
        createdBy: preset.createdBy,
      })),
    };
  }

  async taskBoardAutomationPreset(communityId: string, presetId: string) {
    return this.requireTaskBoardAutomationPreset(communityId, presetId);
  }

  async createTaskBoardAutomationPreset(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const metadata = automationPresetMetadata(input, true);
    const rules = Array.isArray(input.rules) ? input.rules.map((rule, position) => automationPresetRuleData(rule, position)) : [];
    if (!rules.length) throw new BadRequestException('At least one automation preset rule is required.');
    const preset = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskBoardAutomationPreset.create({
        data: {
          communityId,
          createdById: actorUserId,
          name: metadata.name!,
          description: metadata.description,
          rules: { create: rules },
        },
        include: { rules: { orderBy: { position: 'asc' } } },
      });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'automation.preset.created', targetType: 'TaskBoardAutomationPreset', targetId: created.id, metadata: { presetId: created.id, ruleCount: created.rules.length } } });
      return created;
    });
    return { preset: { id: preset.id, name: preset.name, ruleCount: preset.rules.length } };
  }

  async saveTaskBoardAutomationPreset(communityId: string, boardId: string, actorUserId: string, input: Record<string, unknown>) {
    await this.requireTaskBoard(communityId, boardId);
    const metadata = automationPresetMetadata(input, true);
    const includeDisabledRules = input.includeDisabledRules === true;
    const sourceRules = await this.prisma.taskBoardAutomationRule.findMany({
      where: { communityId, boardId, archivedAt: null, ...(!includeDisabledRules ? { enabled: true } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (!sourceRules.length) throw new BadRequestException({ message: 'No automation rules to save.', code: 'NO_AUTOMATION_RULES' });
    return this.createTaskBoardAutomationPreset(communityId, actorUserId, {
      name: metadata.name,
      description: metadata.description,
      rules: sourceRules.map((rule) => ({ type: rule.type, name: rule.name, enabled: rule.enabled, config: rule.config })),
    });
  }

  async updateTaskBoardAutomationPreset(communityId: string, presetId: string, actorUserId: string, input: Record<string, unknown>) {
    await this.requireTaskBoardAutomationPreset(communityId, presetId);
    const metadata = automationPresetMetadata(input, false);
    const preset = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskBoardAutomationPreset.update({
        where: { id: presetId },
        data: { name: metadata.name, description: metadata.description, updatedById: actorUserId },
        include: { rules: { orderBy: { position: 'asc' } } },
      });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'automation.preset.updated', targetType: 'TaskBoardAutomationPreset', targetId: presetId, metadata: { presetId } } });
      return updated;
    });
    return preset;
  }

  async archiveTaskBoardAutomationPreset(communityId: string, presetId: string, actorUserId: string) {
    await this.requireTaskBoardAutomationPreset(communityId, presetId);
    const archivedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.taskBoardAutomationPreset.update({ where: { id: presetId }, data: { archivedAt, updatedById: actorUserId } }),
      this.prisma.auditLog.create({ data: { communityId, actorUserId, action: 'automation.preset.archived', targetType: 'TaskBoardAutomationPreset', targetId: presetId, metadata: { presetId } } }),
    ]);
    return { id: presetId, archivedAt };
  }

  async previewTaskBoardAutomationPreset(communityId: string, boardId: string, presetId: string) {
    const [preset, context] = await Promise.all([
      this.requireTaskBoardAutomationPreset(communityId, presetId),
      this.taskBoardAutomationValidationContext(communityId, boardId),
    ]);
    return automationPresetPreview(preset, context);
  }

  async applyTaskBoardAutomationPreset(communityId: string, boardId: string, presetId: string, actorUserId: string, input: Record<string, unknown>) {
    if (input.duplicateStrategy !== undefined && input.duplicateStrategy !== 'SKIP_DUPLICATES') {
      throw new BadRequestException('Only duplicate skipping is supported.');
    }
    const applyMode = input.applyMode === undefined || input.applyMode === 'DRAFT' ? 'DRAFT' : input.applyMode === 'LIVE' ? 'LIVE' : null;
    if (!applyMode) throw new BadRequestException('Automation preset apply mode is invalid.');
    const [preset, baseContext] = await Promise.all([
      this.requireTaskBoardAutomationPreset(communityId, presetId),
      this.taskBoardAutomationValidationContext(communityId, boardId),
    ]);
    return this.prisma.$transaction(async (tx) => {
      const context: AutomationValidationContext = {
        ...baseContext,
        rules: await tx.taskBoardAutomationRule.findMany({ where: { communityId, boardId, archivedAt: null }, orderBy: { createdAt: 'asc' } }),
      };
      const created: Array<{ id: string; type: TaskBoardAutomationRuleType; createdFromPresetRuleId: string }> = [];
      let skippedDuplicates = 0;
      let errors = 0;

      for (const presetRule of preset.rules) {
        const config = automationRuleConfigWithDefaults(presetRule.type, presetRule.config);
        if (findExactAutomationRule(context.rules, presetRule.type, config)) {
          skippedDuplicates += 1;
          continue;
        }
        const validation = validateAutomationRule(presetRule.type, config, undefined, context);
        if (!validation.valid) {
          errors += 1;
          continue;
        }
        const normalized = taskBoardAutomationRuleData({ type: presetRule.type, name: presetRule.name, enabled: presetRule.enabled, config }, true, context.emailAvailable);
        const draftMode = applyMode === 'DRAFT';
        const rule = await tx.taskBoardAutomationRule.create({ data: {
          communityId,
          boardId,
          createdById: actorUserId,
          type: normalized.type!,
          name: normalized.name,
          enabled: draftMode ? false : normalized.enabled ?? true,
          config: normalized.config!,
          createdFromPresetId: preset.id,
          createdFromPresetRuleId: presetRule.id,
          ...(draftMode ? { draftName: normalized.name ?? null, draftEnabled: normalized.enabled ?? true, draftConfig: automationRuleBehaviorConfig(normalized.config) as Prisma.InputJsonObject, draftUpdatedAt: new Date(), draftUpdatedById: actorUserId } : {}),
        } });
        await tx.taskBoardAutomationRuleVersion.create({ data: automationRuleVersionData(rule, actorUserId, TaskBoardAutomationRuleChangeType.CREATED, 'CREATED_FROM_PRESET') });
        await tx.auditLog.create({ data: { communityId, actorUserId, action: 'task.board.automation.created', targetType: 'TaskBoardAutomationRule', targetId: rule.id, metadata: { boardId, type: rule.type, version: rule.currentVersion, changeType: TaskBoardAutomationRuleChangeType.CREATED, changedById: actorUserId, presetId, presetRuleId: presetRule.id, applyMode } } });
        if (draftMode) await tx.auditLog.create({ data: { communityId, actorUserId, action: 'automation.rule.draft_saved', targetType: 'TaskBoardAutomationRule', targetId: rule.id, metadata: { boardId, ruleId: rule.id, presetId, presetRuleId: presetRule.id } } });
        context.rules.push({ id: rule.id, type: rule.type, config: rule.config });
        created.push({ id: rule.id, type: rule.type, createdFromPresetRuleId: presetRule.id });
      }
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'automation.preset.applied', targetType: 'TaskBoardAutomationPreset', targetId: presetId, metadata: { presetId, boardId, createdRules: created.length, skippedDuplicates, applyMode } } });
      return { createdRules: created.length, skippedDuplicates, errors, applyMode, rules: created };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async taskBoardAutomationRules(communityId: string, boardId: string) {
    const context = await this.taskBoardAutomationValidationContext(communityId, boardId);
    return context.rules.map((rule) => {
      const { draftName: _draftName, draftEnabled: _draftEnabled, draftConfig: _draftConfig, draftUpdatedAt: _draftUpdatedAt, draftUpdatedById: _draftUpdatedById, archivedById: _archivedById, archiveReason: _archiveReason, ...liveRule } = rule;
      return {
        ...liveRule,
        hasDraft: Boolean(rule.draftUpdatedAt),
        staleDraft: isStaleAutomationDraft(rule.draftUpdatedAt),
        createdFromPreset: rule.createdFromPreset ?? null,
        config: automationRuleConfigWithDefaults(rule.type, rule.config),
        validation: validateAutomationRule(rule.type, rule.config, rule.id, context),
      };
    });
  }

  async archivedTaskBoardAutomationRules(communityId: string, boardId: string) {
    await this.requireTaskBoard(communityId, boardId);
    const rules = await this.prisma.taskBoardAutomationRule.findMany({
      where: { communityId, boardId, archivedAt: { not: null } },
      orderBy: { archivedAt: 'desc' },
      include: {
        archivedBy: { select: { id: true, name: true } },
        createdFromPreset: { select: { id: true, name: true } },
        runs: { where: { mode: 'LIVE' }, orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true, finishedAt: true } },
      },
    });
    return {
      items: rules.map((rule) => ({
        id: rule.id,
        type: rule.type,
        name: rule.name,
        enabled: rule.enabled,
        config: automationRuleConfigWithDefaults(rule.type, rule.config),
        currentVersion: rule.currentVersion,
        archivedAt: rule.archivedAt,
        archivedBy: rule.archivedBy,
        archiveReason: rule.archiveReason,
        createdFromPreset: rule.createdFromPreset,
        hasDraft: Boolean(rule.draftUpdatedAt),
        staleDraft: isStaleAutomationDraft(rule.draftUpdatedAt),
        lastLiveRunAt: rule.runs[0] ? rule.runs[0].finishedAt ?? rule.runs[0].startedAt : null,
      })),
    };
  }

  async taskBoardAutomationDelivery(communityId: string, boardId: string) {
    await this.requireTaskBoard(communityId, boardId);
    const [email, administrators] = await Promise.all([
      this.email.automationAvailability(communityId),
      this.prisma.membership.findMany({
        where: {
          communityId,
          status: 'ACTIVE',
          role: { key: { in: ['owner', 'admin'] }, permissions: { some: { permission: { key: 'events.read' } } } },
        },
        select: {
          userId: true,
          user: { select: { name: true } },
          role: { select: { key: true } },
          profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } },
        },
        orderBy: { joinedAt: 'asc' },
      }),
    ]);
    return {
      channels: { inApp: { available: true }, email },
      recipients: {
        administrators: administrators.map((membership) => ({
          id: membership.userId,
          name: membership.user.name,
          avatarUrl: membership.profile?.avatarUrl ?? null,
          dicebearStyle: membership.profile?.dicebearStyle ?? null,
          dicebearSeed: membership.profile?.dicebearSeed ?? null,
          role: membership.role.key,
          source: membership.role.key === 'owner' ? 'OWNER' as const : 'ADMIN' as const,
        })),
      },
    };
  }

  async validateTaskBoardAutomationRule(communityId: string, boardId: string, input: Record<string, unknown>) {
    const context = await this.taskBoardAutomationValidationContext(communityId, boardId);
    const type = Object.values(TaskBoardAutomationRuleType).includes(input.type as TaskBoardAutomationRuleType)
      ? input.type as TaskBoardAutomationRuleType
      : null;
    if (!type) return automationValidationResult([{ code: 'INVALID_RULE_TYPE', severity: 'ERROR', field: 'type' }]);
    const config = input.config && typeof input.config === 'object' && !Array.isArray(input.config)
      ? input.config as Record<string, unknown>
      : {};
    const requestedRuleId = typeof input.ruleId === 'string' ? input.ruleId : undefined;
    const ruleId = requestedRuleId && context.rules.some((rule) => rule.id === requestedRuleId) ? requestedRuleId : undefined;
    return validateAutomationRule(type, config, ruleId, context);
  }

  async createTaskBoardAutomationRule(communityId: string, boardId: string, actorUserId: string, input: Record<string, unknown>) {
    const validation = await this.validateTaskBoardAutomationRule(communityId, boardId, input);
    assertAutomationValidation(validation);
    const emailAvailability = await this.email.automationAvailability(communityId);
    const data = taskBoardAutomationRuleData(input, true, emailAvailability.available);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.taskBoardAutomationRule.create({ data: { communityId, boardId, createdById: actorUserId, type: data.type!, name: data.name, enabled: data.enabled ?? true, config: data.config! } });
      await tx.taskBoardAutomationRuleVersion.create({ data: automationRuleVersionData(rule, actorUserId, TaskBoardAutomationRuleChangeType.CREATED, 'RULE_CREATED') });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'task.board.automation.created', targetType: 'TaskBoardAutomationRule', targetId: rule.id, metadata: { boardId, type: rule.type, version: rule.currentVersion, changeType: TaskBoardAutomationRuleChangeType.CREATED, changedById: actorUserId } } });
      return rule;
    });
  }

  async updateTaskBoardAutomationRule(communityId: string, boardId: string, ruleId: string, actorUserId: string, input: Record<string, unknown>) {
    const existing = await this.prisma.taskBoardAutomationRule.findFirst({ where: { id: ruleId, communityId, boardId, archivedAt: null } });
    if (!existing) throw new NotFoundException('Automation rule not found.');
    const validation = await this.validateTaskBoardAutomationRule(communityId, boardId, { ...input, ruleId, type: input.type ?? existing.type, config: input.config ?? existing.config });
    assertAutomationValidation(validation);
    const emailAvailability = await this.email.automationAvailability(communityId);
    const merged = taskBoardAutomationRuleData({ ...input, type: input.type ?? existing.type, config: input.config ?? existing.config }, false, emailAvailability.available);
    const nextState = { type: merged.type ?? existing.type, name: merged.name === undefined ? existing.name : merged.name, enabled: merged.enabled ?? existing.enabled, config: merged.config ?? existing.config };
    const behaviorChanged = automationRuleBehaviorChanged(existing, nextState);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.taskBoardAutomationRule.update({ where: { id: existing.id }, data: { type: merged.type, name: merged.name, enabled: merged.enabled, config: merged.config, ...(behaviorChanged ? { currentVersion: { increment: 1 } } : {}) } });
      if (!behaviorChanged) return rule;
      const changeSummary = automationRuleChangeSummary(existing, rule);
      await tx.taskBoardAutomationRuleVersion.create({ data: automationRuleVersionData(rule, actorUserId, TaskBoardAutomationRuleChangeType.UPDATED, changeSummary) });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'task.board.automation.updated', targetType: 'TaskBoardAutomationRule', targetId: rule.id, metadata: { boardId, type: rule.type, version: rule.currentVersion, previousVersion: existing.currentVersion, changeType: TaskBoardAutomationRuleChangeType.UPDATED, changedById: actorUserId } } });
      return rule;
    });
  }

  async taskBoardAutomationRuleDraft(communityId: string, boardId: string, ruleId: string) {
    const [rule, context] = await Promise.all([
      this.requireTaskBoardAutomationRule(communityId, boardId, ruleId, true),
      this.taskBoardAutomationValidationContext(communityId, boardId),
    ]);
    let updatedBy: { id: string; name: string; avatarUrl: string | null } | null = null;
    if (rule.draftUpdatedById) {
      const user = await this.prisma.user.findUnique({
        where: { id: rule.draftUpdatedById },
        select: { id: true, name: true, memberships: { where: { communityId }, take: 1, select: { profile: { select: { avatarUrl: true } } } } },
      });
      if (user) updatedBy = { id: user.id, name: user.name, avatarUrl: user.memberships[0]?.profile?.avatarUrl ?? null };
    }
    return automationRuleDraftResponse(rule, context, updatedBy);
  }

  async saveTaskBoardAutomationRuleDraft(communityId: string, boardId: string, ruleId: string, actorUserId: string, input: Record<string, unknown>) {
    const rule = await this.requireTaskBoardAutomationRule(communityId, boardId, ruleId);
    const normalized = taskBoardAutomationDraftData(rule.type, rule.name, input);
    await this.prisma.$transaction([
      this.prisma.taskBoardAutomationRule.update({
        where: { id: rule.id },
        data: { draftName: normalized.name, draftEnabled: normalized.enabled, draftConfig: normalized.config, draftUpdatedAt: new Date(), draftUpdatedById: actorUserId },
      }),
      this.prisma.auditLog.create({ data: { communityId, actorUserId, action: 'automation.rule.draft_saved', targetType: 'TaskBoardAutomationRule', targetId: rule.id, metadata: { boardId, ruleId: rule.id } } }),
    ]);
    return this.taskBoardAutomationRuleDraft(communityId, boardId, ruleId);
  }

  async discardTaskBoardAutomationRuleDraft(communityId: string, boardId: string, ruleId: string, actorUserId: string) {
    const rule = await this.requireTaskBoardAutomationRule(communityId, boardId, ruleId, true);
    if (!rule.draftUpdatedAt) return { id: rule.id, discarded: false };
    await this.prisma.$transaction([
      this.prisma.taskBoardAutomationRule.update({ where: { id: rule.id }, data: { draftName: null, draftEnabled: null, draftConfig: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null } }),
      this.prisma.auditLog.create({ data: { communityId, actorUserId, action: 'automation.rule.draft_discarded', targetType: 'TaskBoardAutomationRule', targetId: rule.id, metadata: { boardId, ruleId: rule.id } } }),
    ]);
    return { id: rule.id, discarded: true };
  }

  async publishTaskBoardAutomationRuleDraft(communityId: string, boardId: string, ruleId: string, actorUserId: string) {
    const [existing, context] = await Promise.all([
      this.requireTaskBoardAutomationRule(communityId, boardId, ruleId),
      this.taskBoardAutomationValidationContext(communityId, boardId),
    ]);
    if (!existing.draftUpdatedAt || !existing.draftConfig || existing.draftEnabled === null) throw new BadRequestException({ message: 'Automation rule draft not found.', code: 'AUTOMATION_DRAFT_NOT_FOUND' });
    const draftConfig = automationRuleConfigWithDefaults(existing.type, existing.draftConfig);
    const validation = validateAutomationRule(existing.type, draftConfig, existing.id, context);
    if (!validation.valid) throw new BadRequestException({ message: 'Automation draft validation failed.', code: 'AUTOMATION_DRAFT_VALIDATION_FAILED', items: validation.items });
    const normalized = taskBoardAutomationRuleData({ type: existing.type, name: existing.draftName, enabled: existing.draftEnabled, config: draftConfig }, true, context.emailAvailable);
    const nextState = { type: existing.type, name: normalized.name ?? null, enabled: normalized.enabled ?? existing.enabled, config: { ...automationRuleBehaviorConfig(normalized.config), ...automationRuleLayoutConfig(existing.config) } as Prisma.InputJsonObject };
    const behaviorChanged = automationRuleBehaviorChanged(existing, nextState);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.taskBoardAutomationRule.update({
        where: { id: existing.id },
        data: { name: nextState.name, enabled: nextState.enabled, config: nextState.config, draftName: null, draftEnabled: null, draftConfig: Prisma.DbNull, draftUpdatedAt: null, draftUpdatedById: null, ...(behaviorChanged ? { currentVersion: { increment: 1 } } : {}) },
      });
      let version = null;
      if (behaviorChanged) {
        const changeSummary = automationRuleChangeSummary(existing, rule);
        version = await tx.taskBoardAutomationRuleVersion.create({ data: automationRuleVersionData(rule, actorUserId, TaskBoardAutomationRuleChangeType.UPDATED, changeSummary) });
        await tx.auditLog.create({ data: { communityId, actorUserId, action: 'task.board.automation.updated', targetType: 'TaskBoardAutomationRule', targetId: rule.id, metadata: { boardId, type: rule.type, version: rule.currentVersion, previousVersion: existing.currentVersion, changeType: TaskBoardAutomationRuleChangeType.UPDATED, changedById: actorUserId } } });
      }
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'automation.rule.draft_published', targetType: 'TaskBoardAutomationRule', targetId: rule.id, metadata: { boardId, ruleId: rule.id, version: rule.currentVersion, changed: behaviorChanged } } });
      return { rule: { ...rule, hasDraft: false }, version, validation };
    });
  }

  async taskBoardAutomationRuleVersions(communityId: string, boardId: string, ruleId: string) {
    const rule = await this.requireTaskBoardAutomationRule(communityId, boardId, ruleId, true);
    const versions = await this.prisma.taskBoardAutomationRuleVersion.findMany({
      where: { communityId, boardId, ruleId },
      orderBy: { version: 'desc' },
      include: {
        changedBy: {
          select: {
            id: true,
            name: true,
            memberships: { where: { communityId }, take: 1, select: { profile: { select: { avatarUrl: true } } } },
          },
        },
      },
    });
    return {
      items: versions.map((version) => ({
        id: version.id,
        version: version.version,
        changeType: version.changeType,
        changeSummary: version.changeSummary,
        type: version.type,
        enabled: version.enabled,
        name: version.name,
        config: version.config,
        createdAt: version.createdAt,
        changedBy: version.changedBy ? { id: version.changedBy.id, name: version.changedBy.name, avatarUrl: version.changedBy.memberships[0]?.profile?.avatarUrl ?? null } : null,
        isCurrent: version.version === rule.currentVersion,
      })),
    };
  }

  async taskBoardAutomationRuleSchedule(communityId: string, boardId: string, ruleId: string) {
    const [rule, context, lastLiveRun] = await Promise.all([
      this.requireTaskBoardAutomationRule(communityId, boardId, ruleId, true),
      this.taskBoardAutomationValidationContext(communityId, boardId),
      this.prisma.taskBoardAutomationRun.findFirst({
        where: { communityId, boardId, ruleId, mode: 'LIVE' },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true, finishedAt: true },
      }),
    ]);
    const config = rule.config as Record<string, unknown>;
    const lifecycle = await this.automationExecutionDecision(communityId, boardId, ruleId, null, rule);
    const validation = validateAutomationRule(rule.type, config, rule.id, context);
    const schedule = automationRuleSchedule(rule.type, config, context.tasks, context.now);
    const notificationRule = isNotificationAutomationRule(rule.type);
    const hasEligibleRecipients = !notificationRule || schedule.matches.length === 0
      || (config.notifyAssignees === true && schedule.matches.some((task) => task.assignees.length > 0))
      || (config.notifyAdmins === true && context.eligibleAdminCount > 0);
    const scheduleState = !lifecycle.eligible || rule.archivedAt || !rule.enabled
      ? 'DISABLED'
      : validation.items.some((item) => item.severity === 'ERROR') || !hasEligibleRecipients
        ? 'BLOCKED'
        : schedule.matches.length > 0
          ? 'READY'
          : 'WAITING';
    const lastLiveRunAt = lastLiveRun ? lastLiveRun.finishedAt ?? lastLiveRun.startedAt : null;
    return {
      ruleId: rule.id,
      ruleType: rule.type,
      enabled: rule.enabled,
      scheduleState,
      lastEvaluatedAt: lastLiveRunAt,
      lastLiveRunAt,
      nextCheckCode: !lifecycle.eligible || rule.archivedAt || !rule.enabled ? 'DISABLED' : schedule.nextCheckCode,
      nextEligibleAt: lifecycle.eligible ? schedule.nextEligibleAt : null,
      matching: {
        currentMatches: schedule.matches.length,
        upcomingMatches: schedule.upcomingMatches,
        affectedTasks: schedule.matches.slice(0, 10).map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, status: task.status, reasonCode: schedule.taskReasonCode })),
      },
      reasons: [
        ...(!lifecycle.eligible ? [{ code: lifecycle.reason, severity: 'INFO' as const }] : []),
        ...(rule.archivedAt ? [{ code: 'RULE_ARCHIVED', severity: 'INFO' as const }] : !rule.enabled ? [{ code: 'RULE_DISABLED', severity: 'INFO' as const }] : []),
        ...validation.items.filter((item) => item.code !== 'NO_CURRENT_MATCHES').map((item) => ({ code: item.code, severity: item.severity })),
        ...(!hasEligibleRecipients ? [{ code: 'NO_ELIGIBLE_RECIPIENTS', severity: 'ERROR' as const }] : []),
        ...schedule.reasons,
      ],
      worker: { available: false, status: 'UNKNOWN', lastHeartbeatAt: null, label: null },
    };
  }

  async rollbackTaskBoardAutomationRuleVersion(communityId: string, boardId: string, ruleId: string, versionId: string, actorUserId: string) {
    const [rule, target] = await Promise.all([
      this.requireTaskBoardAutomationRule(communityId, boardId, ruleId),
      this.prisma.taskBoardAutomationRuleVersion.findFirst({ where: { id: versionId, communityId, boardId, ruleId } }),
    ]);
    if (!target) throw new NotFoundException('Automation rule version not found.');
    if (target.version === rule.currentVersion) throw new BadRequestException({ code: 'AUTOMATION_VERSION_CURRENT', message: 'This automation rule version is already current.' });

    const config = { ...automationRuleBehaviorConfig(target.config), ...automationRuleLayoutConfig(rule.config) };
    const validation = await this.validateTaskBoardAutomationRule(communityId, boardId, { ruleId, type: target.type, enabled: target.enabled, config });
    if (!validation.valid) throw new BadRequestException({ code: 'AUTOMATION_ROLLBACK_VALIDATION_FAILED', message: 'Automation rollback validation failed.', items: validation.items });
    const emailAvailability = await this.email.automationAvailability(communityId);
    const restored = taskBoardAutomationRuleData({ type: target.type, name: target.name, enabled: target.enabled, config }, true, emailAvailability.available);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskBoardAutomationRule.update({
        where: { id: rule.id },
        data: { type: restored.type!, name: restored.name, enabled: restored.enabled ?? target.enabled, config: restored.config!, currentVersion: { increment: 1 } },
      });
      const version = await tx.taskBoardAutomationRuleVersion.create({
        data: automationRuleVersionData(updated, actorUserId, TaskBoardAutomationRuleChangeType.ROLLED_BACK, `ROLLED_BACK:${target.version}`),
      });
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'task.board.automation.rolled_back',
          targetType: 'TaskBoardAutomationRule',
          targetId: rule.id,
          metadata: { boardId, ruleId, version: updated.currentVersion, previousVersion: rule.currentVersion, restoredVersion: target.version, changeType: TaskBoardAutomationRuleChangeType.ROLLED_BACK, changedById: actorUserId },
        },
      });
      return { rule: updated, version, validation };
    });
  }

  async archiveTaskBoardAutomationRule(communityId: string, boardId: string, ruleId: string, actorUserId: string, input: Record<string, unknown>) {
    const existing = await this.prisma.taskBoardAutomationRule.findFirst({ where: { id: ruleId, communityId, boardId, archivedAt: null } });
    if (!existing) throw new NotFoundException('Automation rule not found.');
    const archivedAt = new Date();
    const archiveReason = input.reason === undefined ? null : nullableEventTaskString(input.reason, 'Archive reason', 300);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.taskBoardAutomationRule.update({ where: { id: existing.id }, data: { archivedAt, archivedById: actorUserId, archiveReason, currentVersion: { increment: 1 } } });
      await tx.taskBoardAutomationRuleVersion.create({ data: automationRuleVersionData(rule, actorUserId, TaskBoardAutomationRuleChangeType.UPDATED, 'RULE_ARCHIVED') });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'automation.rule.archived', targetType: 'TaskBoardAutomationRule', targetId: existing.id, metadata: { boardId, ruleId: existing.id, type: existing.type, archivedAt, archivedById: actorUserId, version: rule.currentVersion, presetId: existing.createdFromPresetId } } });
      const archivedBy = await tx.user.findUnique({ where: { id: actorUserId }, select: { id: true, name: true } });
      return { rule: { id: rule.id, archivedAt: rule.archivedAt, archivedBy } };
    });
  }

  async restoreTaskBoardAutomationRule(communityId: string, boardId: string, ruleId: string, actorUserId: string) {
    const existing = await this.prisma.taskBoardAutomationRule.findFirst({ where: { id: ruleId, communityId, boardId, archivedAt: { not: null } } });
    if (!existing) throw new NotFoundException('Archived automation rule not found.');
    const context = await this.taskBoardAutomationValidationContext(communityId, boardId);
    const validation = validateAutomationRule(existing.type, existing.config as Record<string, unknown>, existing.id, context);
    const enabled = validation.valid ? existing.enabled : false;
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.taskBoardAutomationRule.update({ where: { id: existing.id }, data: { archivedAt: null, archivedById: null, archiveReason: null, enabled, currentVersion: { increment: 1 } } });
      const version = await tx.taskBoardAutomationRuleVersion.create({ data: automationRuleVersionData(rule, actorUserId, TaskBoardAutomationRuleChangeType.UPDATED, 'RULE_RESTORED') });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'automation.rule.restored', targetType: 'TaskBoardAutomationRule', targetId: existing.id, metadata: { boardId, ruleId: existing.id, restoredById: actorUserId, version: rule.currentVersion, validationValid: validation.valid, presetId: existing.createdFromPresetId } } });
      return { rule: { id: rule.id, archivedAt: null, enabled: rule.enabled, hasDraft: Boolean(rule.draftUpdatedAt), staleDraft: isStaleAutomationDraft(rule.draftUpdatedAt), createdFromPreset: rule.createdFromPresetId ? { id: rule.createdFromPresetId } : null }, version, validation: { ...validation, items: validation.items.map((item) => ({ ...item, message: item.code })) } };
    });
  }

  private async taskBoardAutomationValidationContext(communityId: string, boardId: string): Promise<AutomationValidationContext> {
    await this.requireTaskBoard(communityId, boardId);
    const [rules, emailAvailability, templates, tasks, eligibleAdminCount] = await Promise.all([
      this.prisma.taskBoardAutomationRule.findMany({ where: { communityId, boardId, archivedAt: null }, orderBy: [{ createdAt: 'asc' }], include: { createdFromPreset: { select: { id: true, name: true } } } }),
      this.email.automationAvailability(communityId),
      this.prisma.notificationTemplate.findMany({
        where: { communityId, key: { in: [...notificationAutomationTemplateKeys] } },
        select: { key: true, enabled: true },
      }),
      this.prisma.eventTask.findMany({
        where: { communityId, taskBoardId: boardId, archivedAt: null, status: { not: EventTaskStatus.DONE } },
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          assignees: { where: { archivedAt: null }, select: { id: true } },
          checklistItems: { where: { archivedAt: null }, select: { isCompleted: true, updatedAt: true } },
          activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
          comments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
          attachments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
        },
      }),
      this.prisma.membership.count({
        where: {
          communityId,
          status: 'ACTIVE',
          role: { key: { in: ['owner', 'admin'] }, permissions: { some: { permission: { key: 'events.read' } } } },
        },
      }),
    ]);
    return {
      rules,
      emailAvailable: emailAvailability.available,
      templates: new Map(templates.map((template) => [template.key, template.enabled])),
      tasks: tasks.map((task) => ({ ...task, lastActivityAt: automationTaskLastActivityAt(task) })),
      eligibleAdminCount,
      now: new Date(),
    };
  }

  async taskBoardAutomationRuns(communityId: string, boardId: string, query: Record<string, unknown>, ruleId?: string) {
    await this.requireTaskBoard(communityId, boardId);
    if (ruleId) await this.requireTaskBoardAutomationRule(communityId, boardId, ruleId, true);
    const page = positiveInteger(query.page, 1);
    const pageSize = Math.min(50, positiveInteger(query.pageSize, 20));
    const status = ['SUCCESS', 'SKIPPED', 'FAILED'].includes(String(query.status)) ? String(query.status) as 'SUCCESS' | 'SKIPPED' | 'FAILED' : undefined;
    const mode = ['LIVE', 'DRY_RUN', 'TEST_NOTIFICATION'].includes(String(query.mode)) ? String(query.mode) as 'LIVE' | 'DRY_RUN' | 'TEST_NOTIFICATION' : undefined;
    const where = { communityId, boardId, ...(ruleId ? { ruleId } : {}), ...(status ? { status } : {}), ...(mode ? { mode } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.taskBoardAutomationRun.findMany({ where, include: { task: { select: { id: true, title: true } } }, orderBy: { startedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.taskBoardAutomationRun.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async retryTaskBoardAutomationRun(communityId: string, boardId: string, runId: string, actorUserId: string) {
    const original = await this.prisma.taskBoardAutomationRun.findFirst({
      where: { id: runId, communityId, boardId },
      include: automationRetryRunInclude,
    });
    if (!original) throw new NotFoundException('Automation run not found.');
    if (original.status !== 'FAILED' || original.mode !== 'LIVE') throw new BadRequestException('Only failed live automation runs can be retried.');
    const lifecycle = await this.automationExecutionDecision(communityId, boardId, original.ruleId, original.taskId, original.rule);
    if (!lifecycle.eligible) return { run: await this.createSkippedAutomationRetry(original, 'lifecycle_suppressed', original.taskId, lifecycle.reason) };

    if (isNotificationAutomationRule(original.rule.type)) return this.retryNotificationAutomationRun(original, actorUserId);
    if (original.rule.type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) return this.retryChecklistAutomationRun(original, actorUserId);
    return this.retryFlagUnassignedAutomationRun(original);
  }

  private async retryNotificationAutomationRun(original: AutomationRetryRun, actorUserId: string) {
    const task = original.task;
    const now = new Date();
    const config = original.rule.config as Record<string, unknown>;
    const delivery = normalizeAutomationDeliveryConfig(config.delivery);
    if (!task || task.archivedAt || task.taskBoardId !== original.boardId || task.status === EventTaskStatus.DONE) return { run: await this.createSkippedAutomationRetry(original, 'retry_state_no_longer_matches') };
    const comparableTask = { ...task, assignees: task.assignees.map((assignment) => ({ id: assignment.userId })), lastActivityAt: automationTaskLastActivityAt(task) };
    const matches = automationTaskMatchesRule(original.rule.type, config, comparableTask, now);
    if (!matches) return { run: await this.createSkippedAutomationRetry(original, 'retry_state_no_longer_matches', task.id) };
    if (!delivery.channels.inApp && !delivery.channels.email) return { run: await this.createFailedAutomationRetry(original, 'CONFIGURATION_ERROR', task.id) };

    await ensureAutomationNotificationTemplates(this.prisma, original.communityId);
    const [settings, community, emailAvailability, template] = await Promise.all([
      this.prisma.communitySettings.findUnique({ where: { communityId: original.communityId }, select: { defaultLanguage: true, timezone: true } }),
      this.prisma.community.findUnique({ where: { id: original.communityId }, select: { name: true } }),
      this.email.automationAvailability(original.communityId),
      this.prisma.notificationTemplate.findUnique({ where: { communityId_key: { communityId: original.communityId, key: notificationTemplateKeyForRule(original.rule.type) } } }),
    ]);
    if (!community || !template) return { run: await this.createFailedAutomationRetry(original, 'TEMPLATE_ERROR', task.id) };

    const recipientUsers = new Map<string, { id: string; name: string; email: string }>();
    if (config.notifyAssignees === true) task.assignees.forEach((assignment) => recipientUsers.set(assignment.userId, assignment.user));
    if (config.notifyAdmins === true) {
      const admins = await this.prisma.membership.findMany({
        where: { communityId: original.communityId, status: 'ACTIVE', role: { key: { in: ['owner', 'admin'] }, permissions: { some: { permission: { key: 'events.read' } } } } },
        select: { userId: true, user: { select: { id: true, name: true, email: true } } },
      });
      admins.forEach((membership) => recipientUsers.set(membership.userId, membership.user));
    }
    const recipients = Array.from(recipientUsers.values());
    if (!recipients.length) return { run: await this.createFailedAutomationRetry(original, 'RECIPIENT_ERROR', task.id) };
    if (delivery.channels.email && !delivery.channels.inApp && !emailAvailability.available) return { run: await this.createFailedAutomationRetry(original, 'SMTP_UNAVAILABLE', task.id) };

    const kind = automationNotificationKind(original.rule.type);
    const templateKey = notificationTemplateKeyForRule(original.rule.type);
    const repeatKey = automationNotificationDedupeWindow(original.rule.type, config, comparableTask, now);
    const boardName = original.board.event?.title ?? original.board.name;
    const actionUrl = delivery.includeDeepLink ? automationTaskUrl(original.boardId, task.id) : '';
    const baseTemplate = {
      communityName: community.name,
      boardName,
      eventName: original.board.event?.title ?? '',
      taskTitle: task.title,
      taskDueDate: task.dueDate?.toISOString() ?? '',
      ruleName: taskBoardAutomationRuleName(original.rule.type, settings?.defaultLanguage),
      recipientName: '',
      actionUrl,
      taskStatus: task.status,
      taskPriority: task.priority,
      ...automationNotificationVariables(original.rule.type, config, comparableTask, now),
    };
    const notificationData = delivery.channels.inApp ? recipients.map((recipient) => {
      const rendered = renderNotificationTemplate(template, settings?.defaultLanguage, { ...baseTemplate, recipientName: recipient.name });
      return {
        communityId: original.communityId,
        userId: recipient.id,
        type: kind,
        title: rendered.inAppTitle,
        body: rendered.inAppBody,
        metadata: { kind, eventId: task.eventId, boardId: original.boardId, eventTitle: original.board.event?.title ?? null, boardName, taskTitle: task.title, retryOfRunId: original.id, automationRuleId: original.ruleId, templateKey, templateVersion: template.version, templateFallbackUsed: false, ...(delivery.includeDeepLink ? { taskId: task.id, tab: 'activity' } : {}) },
        dedupeKey: `${kind}:${original.ruleId}:${task.id}:${recipient.id}:${repeatKey}`,
      };
    }) : [];
    const deliveryLifecycle = await this.automationExecutionDecision(original.communityId, original.boardId, original.ruleId, task.id, original.rule);
    if (!deliveryLifecycle.eligible) return { run: await this.createSkippedAutomationRetry(original, 'lifecycle_suppressed', task.id, deliveryLifecycle.reason) };
    const notificationResult = notificationData.length ? await this.prisma.notification.createMany({ data: notificationData, skipDuplicates: true }) : { count: 0 };
    let emailCampaignId: string | null = null;
    let emailQueued = 0;
    let emailSkipped = delivery.channels.email ? Math.max(0, recipients.length - recipients.filter((recipient) => recipient.email).length) : 0;
    let emailFailed = 0;
    let lifecycleSkipReason: AutomationSkipReason | null = null;
    if (delivery.channels.email && emailAvailability.available) {
      const emailRecipients = recipients.filter((recipient) => recipient.email);
      const emailLifecycle = await this.automationExecutionDecision(original.communityId, original.boardId, original.ruleId, task.id, original.rule);
      if (!emailLifecycle.eligible) {
        lifecycleSkipReason = emailLifecycle.reason;
        emailSkipped += emailRecipients.length;
      } else {
        const emailDedupeKey = `${original.ruleId}:${task.id}:${repeatKey}`;
        const existingEmail = await this.prisma.emailCampaign.findFirst({ where: { communityId: original.communityId, type: templateKey, metadata: { path: ['dedupeKey'], equals: emailDedupeKey } }, select: { id: true } });
        if (existingEmail) emailSkipped += emailRecipients.length;
        else if (emailRecipients.length) {
        try {
          const rendered = renderNotificationTemplate(template, settings?.defaultLanguage, baseTemplate);
          const emailTitle = rendered.emailTitle || rendered.inAppTitle;
          const emailBody = rendered.emailBody || rendered.inAppBody;
          const branded = brandedAutomationEmail({ communityName: community.name, title: emailTitle, body: emailBody, actionUrl, buttonLabel: rendered.buttonLabel, locale: rendered.locale });
          const campaign = await this.email.queueAutomationEmail({ communityId: original.communityId, createdById: actorUserId, type: templateKey, subject: rendered.subject || emailTitle, textBody: branded.text, htmlBody: branded.html, recipients: emailRecipients.map((recipient) => ({ userId: recipient.id, email: recipient.email, name: recipient.name })), metadata: { boardId: original.boardId, ruleId: original.ruleId, taskId: task.id, mode: 'LIVE', retryOfRunId: original.id, dedupeKey: emailDedupeKey, templateKey, templateVersion: template.version, templateFallbackUsed: false, locale: settings?.defaultLanguage === 'fr' ? 'fr' : 'en', source: 'AUTOMATION' } });
          emailCampaignId = campaign.id;
          emailQueued = campaign.recipientCount;
        } catch { emailFailed = emailRecipients.length; }
        }
      }
    } else if (delivery.channels.email) emailSkipped += recipients.filter((recipient) => recipient.email).length;

    const succeeded = notificationResult.count > 0 || emailQueued > 0;
    const failedAll = !succeeded && emailFailed > 0;
    const status = succeeded ? 'SUCCESS' : failedAll ? 'FAILED' : 'SKIPPED';
    const summary = succeeded ? 'notifications_created' : failedAll ? 'email_queue_failed' : lifecycleSkipReason ? 'lifecycle_suppressed' : 'already_notified';
    const failureCategory = failedAll ? 'SMTP_UNAVAILABLE' as const : null;
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskBoardAutomationRun.create({ data: { communityId: original.communityId, boardId: original.boardId, ruleId: original.ruleId, taskId: task.id, status, mode: 'LIVE', finishedAt: now, summary, errorCode: failureCategory, errorMessage: failureCategory ? AUTOMATION_FAILURE_REASONS[failureCategory] : null, details: { ruleType: original.rule.type, retryOfRunId: original.id, taskTitle: task.title, dueDate: task.dueDate?.toISOString() ?? null, recipientCount: recipients.length, createdNotificationCount: notificationResult.count, dedupeWindow: repeatKey, delivery, deliveryChannels: [delivery.channels.inApp ? 'IN_APP' : '', delivery.channels.email ? 'EMAIL' : ''].filter(Boolean), emailAvailable: emailAvailability.available, emailCampaignIds: emailCampaignId ? [emailCampaignId] : [], ...(lifecycleSkipReason ? { skipReason: lifecycleSkipReason } : {}), ...(failureCategory ? { failureCategory, safeReason: AUTOMATION_FAILURE_REASONS[failureCategory] } : {}), template: { key: templateKey, version: template.version, fallbackUsed: false }, results: { inApp: { attempted: delivery.channels.inApp ? recipients.length : 0, created: notificationResult.count, skipped: delivery.channels.inApp ? recipients.length - notificationResult.count : 0, failed: 0 }, email: { attempted: delivery.channels.email ? recipients.length : 0, queued: emailQueued, skipped: emailSkipped, failed: emailFailed } } } } });
      await tx.taskBoardAutomationRule.update({ where: { id: original.ruleId }, data: { lastRunAt: now, lastRunStatus: status, lastRunMode: 'LIVE', lastRunSummary: summary } });
      return created;
    });
    return { run };
  }

  private async retryChecklistAutomationRun(original: AutomationRetryRun, actorUserId: string) {
    const task = original.task;
    if (!task || task.archivedAt || task.taskBoardId !== original.boardId || task.status === EventTaskStatus.DONE || !task.checklistItems.length || !task.checklistItems.every((item) => item.isCompleted)) return { run: await this.createSkippedAutomationRetry(original, 'retry_state_no_longer_matches', task?.id) };
    const lifecycle = await this.automationExecutionDecision(original.communityId, original.boardId, original.ruleId, task.id, original.rule);
    if (!lifecycle.eligible) return { run: await this.createSkippedAutomationRetry(original, 'lifecycle_suppressed', task.id, lifecycle.reason) };
    const finishedAt = new Date();
    const run = await this.prisma.$transaction(async (tx) => {
      await tx.eventTask.update({ where: { id: task.id }, data: { status: EventTaskStatus.DONE } });
      await this.eventTaskCollaboration.recordActivity(tx, original.communityId, task.eventId, task.id, actorUserId, [{ type: EventTaskActivityType.STATUS_CHANGED, metadata: { ruleId: original.ruleId, ruleType: 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', from: task.status, to: EventTaskStatus.DONE, automation: true, retryOfRunId: original.id } }]);
      const created = await tx.taskBoardAutomationRun.create({ data: { communityId: original.communityId, boardId: original.boardId, ruleId: original.ruleId, taskId: task.id, status: 'SUCCESS', mode: 'LIVE', finishedAt, summary: 'task_auto_completed', details: { ruleType: original.rule.type, retryOfRunId: original.id, taskTitle: task.title, fromStatus: task.status, toStatus: EventTaskStatus.DONE, checklistCompleted: task.checklistItems.length, checklistTotal: task.checklistItems.length } } });
      await tx.taskBoardAutomationRule.update({ where: { id: original.ruleId }, data: { lastRunAt: finishedAt, lastRunStatus: 'SUCCESS', lastRunMode: 'LIVE', lastRunSummary: 'task_auto_completed' } });
      return created;
    });
    this.emitEventTaskChanged(original.communityId, task.eventId, 'updated', task.id);
    return { run };
  }

  private async retryFlagUnassignedAutomationRun(original: AutomationRetryRun) {
    const count = await this.prisma.eventTask.count({ where: { communityId: original.communityId, taskBoardId: original.boardId, archivedAt: null, assignees: { none: { archivedAt: null } } } });
    if (!count) return { run: await this.createSkippedAutomationRetry(original, 'retry_state_no_longer_matches') };
    const finishedAt = new Date();
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskBoardAutomationRun.create({ data: { communityId: original.communityId, boardId: original.boardId, ruleId: original.ruleId, status: 'SUCCESS', mode: 'LIVE', finishedAt, summary: 'unassigned_tasks_found', details: { ruleType: original.rule.type, retryOfRunId: original.id, unassignedTaskCount: count } } });
      await tx.taskBoardAutomationRule.update({ where: { id: original.ruleId }, data: { lastRunAt: finishedAt, lastRunStatus: 'SUCCESS', lastRunMode: 'LIVE', lastRunSummary: 'unassigned_tasks_found' } });
      return created;
    });
    return { run };
  }

  private async createSkippedAutomationRetry(original: Pick<AutomationRetryRun, 'id' | 'communityId' | 'boardId' | 'ruleId' | 'taskId' | 'rule'>, summary: string, taskId = original.taskId, skipReason?: AutomationSkipReason) {
    const finishedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.taskBoardAutomationRun.create({ data: { communityId: original.communityId, boardId: original.boardId, ruleId: original.ruleId, taskId, status: 'SKIPPED', mode: 'LIVE', finishedAt, summary, details: { ruleType: original.rule.type, retryOfRunId: original.id, ...(skipReason ? { skipReason } : {}), safeReason: 'The current rule or task state no longer matches this automation.' } } });
      await tx.taskBoardAutomationRule.update({ where: { id: original.ruleId }, data: { lastRunAt: finishedAt, lastRunStatus: 'SKIPPED', lastRunMode: 'LIVE', lastRunSummary: summary } });
      return run;
    });
  }

  private async createFailedAutomationRetry(original: Pick<AutomationRetryRun, 'id' | 'communityId' | 'boardId' | 'ruleId' | 'taskId' | 'rule'>, failureCategory: AutomationFailureCategory, taskId = original.taskId) {
    const finishedAt = new Date();
    const safeReason = AUTOMATION_FAILURE_REASONS[failureCategory];
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.taskBoardAutomationRun.create({ data: { communityId: original.communityId, boardId: original.boardId, ruleId: original.ruleId, taskId, status: 'FAILED', mode: 'LIVE', finishedAt, summary: 'retry_failed', errorCode: failureCategory, errorMessage: safeReason, details: { ruleType: original.rule.type, retryOfRunId: original.id, failureCategory, safeReason } } });
      await tx.taskBoardAutomationRule.update({ where: { id: original.ruleId }, data: { lastRunAt: finishedAt, lastRunStatus: 'FAILED', lastRunMode: 'LIVE', lastRunSummary: 'retry_failed' } });
      return run;
    });
  }

  async taskBoardAutomationSummary(communityId: string, rangeInput?: unknown) {
    const range = parseTaskBoardAutomationRange(rangeInput);
    if (!range) throw new BadRequestException('Invalid automation overview range.');
    const automationEmailTypes = [
      String(NotificationTemplateKey.TASK_BOARD_AUTOMATION_DUE_BEFORE),
      String(NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE),
      String(NotificationTemplateKey.TASK_BOARD_AUTOMATION_TEST),
      String(NotificationTemplateKey.TASK_BOARD_AUTOMATION_AUTO_COMPLETE),
      String(NotificationTemplateKey.TASK_BOARD_AUTOMATION_FLAG_UNASSIGNED),
      String(NotificationTemplateKey.TASK_BOARD_AUTOMATION_STALE_TASK_FOLLOW_UP),
      String(NotificationTemplateKey.TASK_BOARD_AUTOMATION_CHECKLIST_INCOMPLETE_BEFORE_DUE),
      String(NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE_ESCALATION),
    ];
    const settings = await this.prisma.communitySettings.findUnique({ where: { communityId }, select: { timezone: true } });
    const period = taskBoardAutomationPeriod(range, settings?.timezone ?? 'UTC');
    const queryFrom = period.previous?.from ?? period.current.from;
    const [activeRules, runs, emailRecipients, recentIssues] = await Promise.all([
      this.prisma.taskBoardAutomationRule.count({ where: { communityId, enabled: true, archivedAt: null } }),
      this.prisma.taskBoardAutomationRun.findMany({
        where: { communityId, createdAt: { ...(queryFrom ? { gte: queryFrom } : {}), lt: period.current.to } },
        select: { status: true, createdAt: true },
      }),
      this.prisma.emailRecipient.findMany({
        where: {
          status: 'SENT',
          sentAt: { ...(queryFrom ? { gte: queryFrom } : {}), lt: period.current.to },
          campaign: { communityId, type: { in: automationEmailTypes } },
        },
        select: { sentAt: true },
      }),
      this.taskBoardAutomationIssueRows(communityId, period),
    ]);
    const currentRuns = runs.filter((run) => dateInPeriod(run.createdAt, period.current));
    const previousRuns = period.previous ? runs.filter((run) => dateInPeriod(run.createdAt, period.previous!)) : null;
    const currentFailedRuns = currentRuns.filter((run) => run.status === 'FAILED');
    const previousFailedRuns = previousRuns?.filter((run) => run.status === 'FAILED') ?? null;
    const sentDates = emailRecipients.flatMap((recipient) => recipient.sentAt ? [recipient.sentAt] : []);
    const currentSentDates = sentDates.filter((sentAt) => dateInPeriod(sentAt, period.current));
    const previousSentDates = period.previous ? sentDates.filter((sentAt) => dateInPeriod(sentAt, period.previous!)) : null;
    const runComparison = taskBoardAutomationComparison(currentRuns.length, previousRuns?.length ?? null, taskBoardAutomationSparkline(currentRuns.map((run) => run.createdAt), period), 'runs');
    const failedComparison = taskBoardAutomationComparison(currentFailedRuns.length, previousFailedRuns?.length ?? null, taskBoardAutomationSparkline(currentFailedRuns.map((run) => run.createdAt), period), 'failedRuns');
    const emailComparison = taskBoardAutomationComparison(currentSentDates.length, previousSentDates?.length ?? null, taskBoardAutomationSparkline(currentSentDates, period), 'emailNotificationsSent');
    return {
      activeRules,
      runsLast30Days: runComparison.value,
      failedRunsLast30Days: failedComparison.value,
      emailNotificationsSent: emailComparison.value,
      range: {
        preset: period.range,
        timezone: period.timezone,
        from: period.current.from?.toISOString() ?? null,
        to: period.current.to.toISOString(),
        previousFrom: period.previous?.from.toISOString() ?? null,
        previousTo: period.previous?.to.toISOString() ?? null,
      },
      metrics: {
        activeRules: { value: activeRules },
        runs: runComparison,
        failedRuns: failedComparison,
        emailNotificationsSent: emailComparison,
      },
      recentIssues,
    };
  }

  async taskBoardAutomationIssues(communityId: string) {
    return this.taskBoardAutomationIssueRows(communityId);
  }

  private async taskBoardAutomationIssueRows(communityId: string, period?: TaskBoardAutomationPeriod) {
    const rows = await this.prisma.taskBoardAutomationRun.findMany({
      where: {
        communityId,
        ...(period ? { startedAt: { ...(period.current.from ? { gte: period.current.from } : {}), lt: period.current.to } } : {}),
        OR: [
          { status: 'FAILED' },
          { status: 'SKIPPED', summary: { in: ['no_supported_delivery_channel', 'email_queue_failed', 'execution_failed'] } },
        ],
      },
      include: {
        board: { select: { id: true, name: true, event: { select: { title: true } } } },
        rule: { select: { id: true, type: true, name: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
    return rows.map((row) => ({
      id: row.id,
      boardId: row.boardId,
      boardName: row.board.event?.title ?? row.board.name,
      ruleId: row.ruleId,
      ruleType: row.rule.type,
      ruleName: row.rule.name ?? taskBoardAutomationRuleName(row.rule.type),
      taskId: row.taskId,
      taskTitle: row.task?.title ?? null,
      status: row.status,
      mode: row.mode,
      summary: row.summary,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage ? row.errorMessage.slice(0, 180) : null,
      lastRunAt: (row.finishedAt ?? row.startedAt).toISOString(),
    }));
  }

  async testTaskBoardAutomationRule(communityId: string, boardId: string, ruleId: string) {
    const rule = await this.requireTaskBoardAutomationRule(communityId, boardId, ruleId);
    const lifecycle = await this.automationExecutionDecision(communityId, boardId, ruleId, null, rule);
    if (!lifecycle.eligible) {
      const run = await this.prisma.taskBoardAutomationRun.create({ data: { communityId, boardId, ruleId, status: 'SKIPPED', mode: 'DRY_RUN', finishedAt: new Date(), summary: 'lifecycle_suppressed', details: { ruleType: rule.type, skipReason: lifecycle.reason } } });
      return { run };
    }
    const tasks = await this.prisma.eventTask.findMany({
      where: { communityId, taskBoardId: boardId, archivedAt: null },
      select: { id: true, title: true, status: true, dueDate: true, createdAt: true, updatedAt: true, assignees: { where: { archivedAt: null }, select: { userId: true } }, checklistItems: { where: { archivedAt: null }, select: { isCompleted: true, updatedAt: true } }, activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } }, comments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } }, attachments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } } },
    });
    const config = rule.config as Record<string, unknown>;
    const notificationRule = isNotificationAutomationRule(rule.type);
    const delivery = notificationRule ? normalizeAutomationDeliveryConfig(config.delivery) : null;
    const emailAvailability = notificationRule ? await this.email.automationAvailability(communityId) : { available: false as const };
    const now = Date.now();
    const comparableTasks = tasks.map((task) => ({ ...task, assignees: task.assignees.map((assignment) => ({ id: assignment.userId })), lastActivityAt: automationTaskLastActivityAt(task) }));
    let matching = tasks;
    if (!rule.enabled) matching = [];
    else if (isNotificationAutomationRule(rule.type)) { const matchingIds = new Set(comparableTasks.filter((task) => automationTaskMatchesRule(rule.type, config, task, new Date(now))).map((task) => task.id)); matching = tasks.filter((task) => matchingIds.has(task.id)); }
    else if (rule.type === 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE') matching = tasks.filter((task) => task.status !== 'DONE' && task.checklistItems.length > 0 && task.checklistItems.every((item) => item.isCompleted));
    else matching = tasks.filter((task) => task.assignees.length === 0);
    const recipientIds = new Set<string>();
    if (config.notifyAssignees === true) matching.forEach((task) => task.assignees.forEach((assignment) => recipientIds.add(assignment.userId)));
    if (config.notifyAdmins === true) {
      const admins = await this.prisma.membership.findMany({ where: { communityId, status: 'ACTIVE', role: { key: { in: ['owner', 'admin'] }, permissions: { some: { permission: { key: 'events.read' } } } } }, select: { userId: true } });
      admins.forEach((membership) => recipientIds.add(membership.userId));
    }
    const supportedDelivery = !notificationRule || delivery?.channels.inApp === true || (delivery?.channels.email === true && emailAvailability.available);
    const emailRecipients = delivery?.channels.email && recipientIds.size ? await this.prisma.user.count({ where: { id: { in: Array.from(recipientIds) }, email: { not: '' }, memberships: { some: { communityId, status: 'ACTIVE' } } } }) : 0;
    const status = matching.length && supportedDelivery ? 'SUCCESS' : 'SKIPPED';
    const summary = !supportedDelivery ? 'no_supported_delivery_channel' : matching.length ? 'dry_run_matches' : 'dry_run_no_matches';
    const deliveryChannels = delivery ? [delivery.channels.inApp ? 'IN_APP' : '', delivery.channels.email ? 'EMAIL' : ''].filter(Boolean) : [];
    const run = await this.prisma.taskBoardAutomationRun.create({ data: { communityId, boardId, ruleId, status, mode: 'DRY_RUN', finishedAt: new Date(), summary, details: { ruleType: rule.type, matchingTaskCount: matching.length, eligibleRecipientCount: recipientIds.size, taskIds: matching.slice(0, 50).map((task) => task.id), ...(delivery ? { deliveryChannels, emailAvailable: emailAvailability.available, wouldInAppCount: delivery.channels.inApp ? recipientIds.size : 0, wouldEmailCount: delivery.channels.email && emailAvailability.available ? emailRecipients : 0, recipientsWithoutEmail: delivery.channels.email ? Math.max(0, recipientIds.size - emailRecipients) : 0, delivery } : {}) } } });
    return { run };
  }

  async testTaskBoardAutomationNotification(communityId: string, boardId: string, ruleId: string, actorUserId: string) {
    const rule = await this.requireTaskBoardAutomationRule(communityId, boardId, ruleId);
    const lifecycle = await this.automationExecutionDecision(communityId, boardId, ruleId, null, rule);
    if (!lifecycle.eligible) {
      const run = await this.prisma.taskBoardAutomationRun.create({ data: { communityId, boardId, ruleId, status: 'SKIPPED', mode: 'TEST_NOTIFICATION', finishedAt: new Date(), summary: 'lifecycle_suppressed', details: { ruleType: rule.type, skipReason: lifecycle.reason, testRecipientId: actorUserId } } });
      return { run, notificationId: null, emailCampaignId: null };
    }
    const delivery = isNotificationAutomationRule(rule.type) ? normalizeAutomationDeliveryConfig((rule.config as Record<string, unknown>).delivery) : null;
    await ensureAutomationNotificationTemplates(this.prisma, communityId);
    const templateKey = NotificationTemplateKey.TASK_BOARD_AUTOMATION_TEST;
    const [board, settings, community, actor, emailAvailability, template] = await Promise.all([
      this.prisma.taskBoard.findFirst({ where: { id: boardId, communityId, archivedAt: null }, select: { name: true, event: { select: { title: true } } } }),
      this.prisma.communitySettings.findUnique({ where: { communityId }, select: { defaultLanguage: true, timezone: true } }),
      this.prisma.community.findUnique({ where: { id: communityId }, select: { name: true } }),
      this.prisma.user.findFirst({ where: { id: actorUserId, memberships: { some: { communityId, status: 'ACTIVE' } } }, select: { id: true, email: true, name: true } }),
      this.email.automationAvailability(communityId),
      this.prisma.notificationTemplate.findUnique({ where: { communityId_key: { communityId, key: templateKey } } }),
    ]);
    if (!board || !community || !actor || !template) throw new NotFoundException('Task board, template, or test recipient not found.');
    const boardName = board.event?.title ?? board.name;
    const ruleName = taskBoardAutomationRuleName(rule.type, settings?.defaultLanguage);
    const actionUrl = delivery?.includeDeepLink ? automationBoardUrl(boardId) : '';
    const rendered = renderNotificationTemplate(template, settings?.defaultLanguage, {
      communityName: community.name,
      boardName,
      eventName: board.event?.title ?? '',
      taskTitle: 'Test task',
      taskDueDate: '',
      ruleName,
      recipientName: actor.name,
      actionUrl,
    });
    const finishedAt = new Date();
    const run = await this.prisma.taskBoardAutomationRun.create({ data: { communityId, boardId, ruleId, status: 'SKIPPED', mode: 'TEST_NOTIFICATION', summary: 'test_notification_pending', details: { ruleType: rule.type, testRecipientId: actorUserId, template: { key: template.key, version: template.version, fallbackUsed: false } } } });
    const deliveryLifecycle = await this.automationExecutionDecision(communityId, boardId, ruleId, null, rule);
    if (!deliveryLifecycle.eligible) {
      const skipped = await this.prisma.taskBoardAutomationRun.update({ where: { id: run.id }, data: { finishedAt, summary: 'lifecycle_suppressed', details: { ruleType: rule.type, testRecipientId: actorUserId, skipReason: deliveryLifecycle.reason, template: { key: template.key, version: template.version, fallbackUsed: false } } } });
      return { run: skipped, notificationId: null, emailCampaignId: null };
    }
    let notificationId: string | null = null;
    let emailCampaignId: string | null = null;
    let emailFailed = false;
    let lifecycleSkipReason: AutomationSkipReason | null = null;
    if (delivery?.channels.inApp) {
      const notification = await this.prisma.notification.create({ data: { communityId, userId: actorUserId, type: 'TASK_BOARD_AUTOMATION_TEST', title: rendered.inAppTitle, body: rendered.inAppBody, metadata: { kind: 'TASK_BOARD_AUTOMATION_TEST', ruleId, boardId, ruleType: rule.type, isTest: true, templateKey: template.key, templateVersion: template.version, locale: rendered.locale, ...(actionUrl ? { actionUrl } : {}) }, dedupeKey: `TASK_BOARD_AUTOMATION_TEST:${ruleId}:${actorUserId}:${finishedAt.getTime()}` } });
      notificationId = notification.id;
    }
    if (delivery?.channels.email && emailAvailability.available && actor.email) {
      const emailLifecycle = await this.automationExecutionDecision(communityId, boardId, ruleId, null, rule);
      if (!emailLifecycle.eligible) lifecycleSkipReason = emailLifecycle.reason;
      else try {
        const emailBody = rendered.emailBody || rendered.inAppBody;
        const emailTitle = rendered.emailTitle || rendered.inAppTitle;
        const branded = brandedAutomationEmail({ communityName: community.name, title: emailTitle, body: emailBody, actionUrl, buttonLabel: rendered.buttonLabel, locale: rendered.locale });
        const campaign = await this.email.queueAutomationEmail({ communityId, createdById: actorUserId, type: 'TASK_BOARD_AUTOMATION_TEST', subject: rendered.subject || emailTitle, textBody: branded.text, htmlBody: branded.html, recipients: [{ userId: actor.id, email: actor.email, name: actor.name }], metadata: { boardId, ruleId, automationRunId: run.id, mode: 'TEST_NOTIFICATION', templateKey: template.key, templateVersion: template.version, locale: rendered.locale, source: 'AUTOMATION' } });
        emailCampaignId = campaign.id;
      } catch { emailFailed = true; }
    }
    const successfulChannels = [notificationId ? 'IN_APP' : '', emailCampaignId ? 'EMAIL' : ''].filter(Boolean);
    const status = successfulChannels.length ? 'SUCCESS' : emailFailed ? 'FAILED' : 'SKIPPED';
    const summary = successfulChannels.length ? 'test_notification_sent' : emailFailed ? 'email_queue_failed' : lifecycleSkipReason ? 'lifecycle_suppressed' : 'no_supported_delivery_channel';
    const updated = await this.prisma.taskBoardAutomationRun.update({ where: { id: run.id }, data: { status, finishedAt, summary, details: { ruleType: rule.type, testRecipientId: actorUserId, deliveryChannels: successfulChannels, emailAvailable: emailAvailability.available, notificationId, emailCampaignId, ...(lifecycleSkipReason ? { skipReason: lifecycleSkipReason } : {}), template: { key: template.key, version: template.version, fallbackUsed: false }, results: { inApp: { attempted: delivery?.channels.inApp ? 1 : 0, created: notificationId ? 1 : 0 }, email: { attempted: delivery?.channels.email ? 1 : 0, queued: emailCampaignId ? 1 : 0, skipped: delivery?.channels.email && !emailCampaignId && !emailFailed ? 1 : 0, failed: emailFailed ? 1 : 0 } } } } });
    return { run: updated, notificationId, emailCampaignId };
  }

  private async requireTaskBoardAutomationRule(communityId: string, boardId: string, ruleId: string, includeArchived = false) {
    const rule = await this.prisma.taskBoardAutomationRule.findFirst({
      where: { id: ruleId, communityId, boardId, ...(!includeArchived ? { archivedAt: null } : {}) },
      include: {
        archivedBy: { select: { id: true, name: true } },
        createdFromPreset: { select: { id: true, name: true } },
      },
    });
    if (!rule) throw new NotFoundException('Automation rule not found.');
    return rule;
  }

  private async automationExecutionDecision(communityId: string, boardId: string, ruleId: string, taskId?: string | null, expectedRule?: { type: TaskBoardAutomationRuleType; config: Prisma.JsonValue }) {
    const board = await this.prisma.taskBoard.findFirst({
      where: { id: boardId, communityId },
      select: {
        status: true,
        archivedAt: true,
        event: { select: { startsAt: true } },
        automationRules: { where: { id: ruleId }, select: { enabled: true, archivedAt: true, type: true, config: true }, take: 1 },
        tasks: { where: { id: taskId ?? '__none__', communityId }, select: { id: true, title: true, status: true, archivedAt: true, dueDate: true, createdAt: true, updatedAt: true, assignees: { where: { archivedAt: null }, select: { id: true } }, checklistItems: { where: { archivedAt: null }, select: { isCompleted: true, updatedAt: true } }, activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } }, comments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } }, attachments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } } }, take: 1 },
      },
    });
    const rule = board?.automationRules[0];
    if (!board || !rule) return { eligible: false as const, reason: 'RULE_NO_LONGER_APPLICABLE' as const };
    if (expectedRule && (expectedRule.type !== rule.type || JSON.stringify(expectedRule.config) !== JSON.stringify(rule.config))) return { eligible: false as const, reason: 'RULE_NO_LONGER_APPLICABLE' as const };
    const task = taskId ? board.tasks[0] : undefined;
    if (taskId && !task) return { eligible: false as const, reason: 'RULE_NO_LONGER_APPLICABLE' as const };
    const comparableTask = task ? { ...task, lastActivityAt: automationTaskLastActivityAt(task) } : null;
    const config = rule.config as Record<string, unknown>;
    const ruleApplicable = !comparableTask
      ? true
      : isNotificationAutomationRule(rule.type)
        ? automationTaskMatchesRule(rule.type, config, comparableTask, new Date())
        : rule.type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE
          ? comparableTask.checklistItems.length > 0 && comparableTask.checklistItems.every((item) => item.isCompleted)
          : comparableTask.assignees.length === 0;
    return evaluateAutomationExecution({
      boardStatus: board.status,
      boardArchivedAt: board.archivedAt,
      eventStartsAt: board.event?.startsAt,
      ruleEnabled: rule.enabled,
      ruleArchivedAt: rule.archivedAt,
      taskStatus: task?.status,
      taskArchivedAt: task?.archivedAt,
      ruleApplicable,
    });
  }

  private async requireTaskBoardAutomationPreset(communityId: string, presetId: string) {
    const preset = await this.prisma.taskBoardAutomationPreset.findFirst({
      where: { id: presetId, communityId, archivedAt: null },
      include: {
        createdBy: { select: { id: true, name: true } },
        rules: { orderBy: { position: 'asc' } },
      },
    });
    if (!preset) throw new NotFoundException('Automation preset not found.');
    return preset;
  }

  private async requireTaskBoard(communityId: string, boardId: string) {
    const board = await this.prisma.taskBoard.findFirst({ where: { id: boardId, communityId, archivedAt: null }, select: { id: true } });
    if (!board) throw new NotFoundException('Task board not found.');
    return board;
  }

  async announcements(communityId: string) {
    const [announcements, notifications] = await Promise.all([
      this.prisma.announcement.findMany({
        where: { communityId, deletedAt: null },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        include: { _count: { select: { likes: true, comments: true } } },
      }),
      this.prisma.notification.findMany({
        where: { communityId, type: 'ANNOUNCEMENT_PUBLISHED', readAt: { not: null } },
        select: { metadata: true },
      }),
    ]);
    const readCounts = new Map<string, number>();
    for (const notification of notifications) {
      const announcementId = announcementIdFromMetadata(notification.metadata);
      if (announcementId) readCounts.set(announcementId, (readCounts.get(announcementId) ?? 0) + 1);
    }
    return announcements.map(({ _count, ...announcement }) => ({
      ...announcement,
      likeCount: _count.likes,
      commentCount: _count.comments,
      readCount: readCounts.get(announcement.id) ?? 0,
    }));
  }

  async announcement(communityId: string, announcementId: string) {
    const announcement = await this.prisma.announcement.findFirst({ where: { id: announcementId, communityId, deletedAt: null } });
    if (!announcement) throw new NotFoundException('Announcement not found.');
    return announcement;
  }

  async createAnnouncement(communityId: string, actorUserId: string, input: Record<string, unknown>, coverImage?: PublicationCoverUploadFile) {
    const data = announcementData(input);
    const authorMode = announcementAuthorMode(input.authorMode);
    if (authorMode === AnnouncementAuthorMode.COMMUNITY_TEAM) await this.requireAnnouncementCommunityTeamAuthor(communityId, actorUserId);
    const publishNow = Boolean(input.publish);
    const cover = await preparePublicationCover(publicationCoverMutation(input, coverImage));
    try {
      const announcement = await this.prisma.$transaction(async (tx) => {
        const created = await tx.announcement.create({
          data: {
            communityId,
            ...data,
            ...cover.data,
            authorMode,
            status: publishNow ? 'PUBLISHED' : 'DRAFT',
            publishedAt: publishNow ? new Date() : null,
          },
        });
        await tx.auditLog.create({
          data: { communityId, actorUserId, action: publishNow ? 'announcement.published' : 'announcement.created', targetType: 'Announcement', targetId: created.id, metadata: { title: created.title } },
        });
        return created;
      });
      if (publishNow) {
        await this.notifyAnnouncementPublished(communityId, announcement.id, announcement.title, announcement.body);
        if (booleanValue(input.emailActiveMembers)) await this.email.queueAnnouncementBroadcast(communityId, actorUserId, announcement);
      }
      return announcement;
    } catch (error) {
      if (cover.uploadedPath) await unlink(cover.uploadedPath).catch(() => undefined);
      throw error;
    }
  }

  async updateAnnouncement(communityId: string, announcementId: string, actorUserId: string, input: Record<string, unknown>, coverImage?: PublicationCoverUploadFile) {
    const existing = await this.prisma.announcement.findFirst({ where: { id: announcementId, communityId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Announcement not found.');
    const data = announcementData(input);
    const authorMode = input.authorMode === undefined ? existing.authorMode : announcementAuthorMode(input.authorMode);
    if (authorMode === AnnouncementAuthorMode.COMMUNITY_TEAM) await this.requireAnnouncementCommunityTeamAuthor(communityId, actorUserId);
    const cover = await preparePublicationCover(publicationCoverMutation(input, coverImage, true));
    try {
      const announcement = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.announcement.update({ where: { id: existing.id }, data: { ...data, ...cover.data, authorMode } });
        await tx.auditLog.create({
          data: { communityId, actorUserId, action: 'announcement.updated', targetType: 'Announcement', targetId: updated.id, metadata: { title: updated.title } },
        });
        return updated;
      });
      if (cover.replacesExisting) await removeUploadedPublicationCover(existing.coverUrl, existing.coverSource);
      return announcement;
    } catch (error) {
      if (cover.uploadedPath) await unlink(cover.uploadedPath).catch(() => undefined);
      throw error;
    }
  }

  private async requireAnnouncementCommunityTeamAuthor(communityId: string, actorUserId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { communityId, userId: actorUserId, status: 'ACTIVE' },
      select: { role: { select: { key: true } } },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role.key.toLowerCase())) {
      throw new ForbiddenException('Community team identity requires admin access.');
    }
  }

  async publishAnnouncement(communityId: string, announcementId: string, actorUserId: string, input: Record<string, unknown> = {}) {
    const existing = await this.prisma.announcement.findFirst({ where: { id: announcementId, communityId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Announcement not found.');
    if (existing.authorMode === AnnouncementAuthorMode.COMMUNITY_TEAM) await this.requireAnnouncementCommunityTeamAuthor(communityId, actorUserId);
    if (existing.status === 'PUBLISHED' && existing.publishedAt) return existing;
    const announcement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.announcement.update({
        where: { id: existing.id },
        data: { status: AnnouncementStatus.PUBLISHED, publishedAt: new Date() },
      });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'announcement.published', targetType: 'Announcement', targetId: updated.id, metadata: { title: updated.title } },
      });
      return updated;
    });
    await this.notifyAnnouncementPublished(communityId, announcement.id, announcement.title, announcement.body);
    if (booleanValue(input.emailActiveMembers)) await this.email.queueAnnouncementBroadcast(communityId, actorUserId, announcement);
    return announcement;
  }

  emailSettings(communityId: string) {
    return this.email.publicSettings(communityId);
  }

  updateEmailSettings(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    return this.email.updateSettings(communityId, actorUserId, input);
  }

  testEmailSettings(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    return this.email.sendTestEmail(communityId, actorUserId, String(input.recipientEmail ?? ''));
  }

  registrationProtectionSettings(communityId: string) {
    return this.registrationSettings.adminConfig(communityId);
  }

  updateRegistrationProtectionSettings(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    return this.registrationSettings.update(communityId, actorUserId, input);
  }

  testRegistrationProtectionSettings(communityId: string) {
    return this.registrationSettings.testConfiguration(communityId);
  }

  recentEmailActivity(communityId: string) {
    return this.email.recentCampaigns(communityId);
  }

  emailOverview(communityId: string, query: Record<string, unknown>) {
    return this.email.overview(communityId, query);
  }

  emailCampaigns(communityId: string, query: Record<string, unknown>) {
    return this.email.campaigns(communityId, query);
  }

  emailCampaign(communityId: string, campaignId: string) {
    return this.email.campaignDetail(communityId, campaignId);
  }

  retryFailedEmailRecipients(communityId: string, campaignId: string, actorUserId: string) {
    return this.email.retryFailedRecipients(communityId, campaignId, actorUserId);
  }

  cancelEmailCampaign(communityId: string, campaignId: string, actorUserId: string) {
    return this.email.cancelCampaign(communityId, campaignId, actorUserId);
  }

  async resendTestEmailCampaign(communityId: string, campaignId: string, actorUserId: string, input: Record<string, unknown>) {
    const campaign = await this.email.campaignDetail(communityId, campaignId);
    if (campaign.type !== 'TEST') throw new BadRequestException('Only test email campaigns can be resent.');
    return this.email.sendTestEmail(communityId, actorUserId, String(input.recipientEmail ?? ''));
  }

  exportEmailCampaignRecipients(communityId: string, campaignId: string) {
    return this.email.exportCampaignRecipients(communityId, campaignId);
  }

  async unpublishAnnouncement(communityId: string, announcementId: string, actorUserId: string) {
    const existing = await this.prisma.announcement.findFirst({ where: { id: announcementId, communityId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Announcement not found.');
    const announcement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.announcement.update({ where: { id: existing.id }, data: { status: 'DRAFT', publishedAt: null } });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'announcement.unpublished', targetType: 'Announcement', targetId: updated.id, metadata: { title: updated.title } },
      });
      return updated;
    });
    return announcement;
  }

  async archiveAnnouncement(communityId: string, announcementId: string, actorUserId: string) {
    const existing = await this.prisma.announcement.findFirst({ where: { id: announcementId, communityId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Announcement not found.');
    const announcement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.announcement.update({ where: { id: existing.id }, data: { status: 'ARCHIVED', publishedAt: null } });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'announcement.archived', targetType: 'Announcement', targetId: updated.id, metadata: { title: updated.title } },
      });
      return updated;
    });
    return announcement;
  }

  async deleteAnnouncement(communityId: string, announcementId: string, actorUserId: string) {
    const existing = await this.prisma.announcement.findFirst({ where: { id: announcementId, communityId, deletedAt: null } });
    if (!existing) throw new NotFoundException('Announcement not found.');
    const announcement = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.announcement.update({ where: { id: existing.id }, data: { status: 'ARCHIVED', publishedAt: null, deletedAt: new Date() } });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'announcement.deleted', targetType: 'Announcement', targetId: updated.id, metadata: { title: updated.title } },
      });
      return updated;
    });
    await removeUploadedPublicationCover(existing.coverUrl, existing.coverSource);
    return { deleted: true, id: announcement.id };
  }

  async announcementNotificationReport(communityId: string, announcementId: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id: announcementId, communityId, deletedAt: null },
      include: { _count: { select: { likes: true, comments: true } } },
    });
    if (!announcement) throw new NotFoundException('Announcement not found.');
    const [memberships, notifications] = await Promise.all([
      this.prisma.membership.findMany({
        where: { communityId, status: 'ACTIVE' },
        include: { user: { select: { id: true, name: true, email: true } }, role: true },
        orderBy: { joinedAt: 'desc' },
      }),
      this.prisma.notification.findMany({
        where: { communityId, type: 'ANNOUNCEMENT_PUBLISHED', metadata: { path: ['announcementId'], equals: announcementId } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const notificationsByUser = new Map(notifications.map((notification) => [notification.userId, notification]));
    const recipients = memberships.map((membership) => {
      const notification = notificationsByUser.get(membership.userId);
      return {
        membershipId: membership.id,
        userId: membership.userId,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role.key,
        notificationId: notification?.id ?? null,
        readAt: notification?.readAt ?? null,
        createdAt: notification?.createdAt ?? null,
        status: notification?.readAt ? 'read' : 'unread',
      };
    });
    const readCount = recipients.filter((recipient) => recipient.readAt).length;
    const createdCount = notifications.length;
    return {
      announcement,
      metrics: {
        totalActiveMembers: memberships.length,
        notificationsCreated: createdCount,
        engagement: { likeCount: announcement._count.likes, commentCount: announcement._count.comments },
        readCount,
        unreadCount: Math.max(0, createdCount - readCount),
        readRate: createdCount ? Math.round((readCount / createdCount) * 100) : 0,
      },
      recipients,
    };
  }

  async reminderSettings(communityId: string) {
    const existing = await this.prisma.communityReminderSettings.findUnique({ where: { communityId } });
    if (existing) return existing;

    try {
      return await this.prisma.communityReminderSettings.create({
        data: { communityId, ...defaultReminderSettings() },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const raced = await this.prisma.communityReminderSettings.findUnique({ where: { communityId } });
        if (raced) return raced;
      }
      throw error;
    }
  }

  async updateReminderSettings(communityId: string, input: Record<string, unknown>) {
    const data = reminderSettingsData(input);
    validatePassportReminderStages(data);
    await this.reminderSettings(communityId);
    return this.prisma.communityReminderSettings.update({
      where: { communityId },
      data,
    });
  }

  async communitySettings(communityId: string) {
    const existing = await this.prisma.communitySettings.findUnique({ where: { communityId } });
    if (existing) return existing;
    try {
      return await this.prisma.communitySettings.create({ data: { communityId } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const raced = await this.prisma.communitySettings.findUnique({ where: { communityId } });
        if (raced) return raced;
      }
      throw error;
    }
  }

  async generalSettings(communityId: string) {
    const [community, settings] = await Promise.all([
      this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, select: { id: true, name: true, slug: true } }),
      this.communitySettings(communityId),
    ]);
    return generalSettingsShape(community, settings);
  }

  async updateCommunitySettings(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const data = communitySettingsData(input);
    const previous = await this.communitySettings(communityId);
    const updated = await this.prisma.communitySettings.update({
      where: { communityId },
      data,
    });
    if (previous.twoFactorEnabled !== updated.twoFactorEnabled) {
      await this.prisma.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'settings.security.updated',
          targetType: 'CommunitySettings',
          targetId: updated.id,
          metadata: { twoFactorEnabled: updated.twoFactorEnabled },
        },
      });
    }
    return { twoFactorEnabled: updated.twoFactorEnabled };
  }

  async updateGeneralSettings(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const data = generalSettingsData(input);
    const [community, previous] = await Promise.all([
      this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, select: { id: true, name: true, slug: true } }),
      this.communitySettings(communityId),
    ]);
    const updated = await this.prisma.communitySettings.update({
      where: { communityId },
      data,
    });
    const changes = changedSettings(previous, updated, ['defaultLanguage', 'timezone', 'registrationApprovalMode', 'memberDirectoryVisibility', 'supportContactEmail']);
    if (Object.keys(changes).length > 0) {
      await this.prisma.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'settings.general.updated',
          targetType: 'CommunitySettings',
          targetId: updated.id,
          metadata: changes as Prisma.InputJsonObject,
        },
      });
    }
    return generalSettingsShape(community, updated);
  }

  async notificationSettings(communityId: string) {
    return notificationSettingsShape(await this.communitySettings(communityId));
  }

  async updateNotificationSettings(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const data = notificationSettingsData(input);
    const previous = await this.communitySettings(communityId);
    const updated = await this.prisma.communitySettings.update({
      where: { communityId },
      data,
    });
    const changes = changedSettings(previous, updated, notificationSettingKeys);
    if (Object.keys(changes).length > 0) {
      await this.prisma.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'settings.notifications.updated',
          targetType: 'CommunitySettings',
          targetId: updated.id,
          metadata: changes as Prisma.InputJsonObject,
        },
      });
    }
    return notificationSettingsShape(updated);
  }

  async messageTemplates(communityId: string) {
    const community = await this.prisma.community.findUniqueOrThrow({
      where: { id: communityId },
      select: { id: true, name: true },
    });
    await ensureCommunityMessageTemplates(this.prisma, community.id, community.name);
    const [templates, reminders] = await Promise.all([
      this.prisma.communityMessageTemplate.findMany({ where: { communityId }, orderBy: [{ channel: 'asc' }, { key: 'asc' }] }),
      this.reminderSettings(communityId),
    ]);
    return groupedMessageTemplates([
      ...reminderMessageTemplates(reminders).map((template) => messageTemplateShape(template)),
      ...localizedMessageTemplateShapes(templates),
    ]);
  }

  async updateMessageTemplate(communityId: string, key: string, actorUserId: string, input: Record<string, unknown>) {
    const reminderTemplate = reminderTemplateDefinitions.find((definition) => definition.key === key);
    if (reminderTemplate) {
      const body = templateBodyValue(input.body);
      validateTemplateBody(body, reminderTemplate.requiredVariables);
      const previous = await this.reminderSettings(communityId);
      const updated = await this.prisma.communityReminderSettings.update({
        where: { communityId },
        data: { [reminderTemplate.field]: body },
      });
      await this.auditTemplateUpdate(communityId, actorUserId, key, reminderTemplate.channel, previous[reminderTemplate.field], body, updated.id);
      return messageTemplateShape(reminderTemplateFromSettings(updated, reminderTemplate));
    }

    const community = await this.prisma.community.findUniqueOrThrow({
      where: { id: communityId },
      select: { id: true, name: true },
    });
    await ensureCommunityMessageTemplates(this.prisma, community.id, community.name);
    if (!isEditableEmailTemplateKey(key)) throw new NotFoundException('Template not found.');
    const locale = strictEmailLocale(input.locale);
    const existing = await this.prisma.communityMessageTemplate.findUnique({
      where: { communityId_key_locale: { communityId, key, locale } },
    });
    if (!existing) throw new NotFoundException('Template not found.');
    if (!existing.isEditable) throw new BadRequestException('Template is system managed.');
    const definition = messageTemplateDefinition(key, locale);
    const content = localizedTemplateInput(input, definition);
    validateLocalizedTemplate(content, editableTemplateRequiredVariables(content));
    const updated = await this.prisma.communityMessageTemplate.update({
      where: { id: existing.id },
      data: {
        subject: content.subject,
        previewText: content.previewText,
        heading: content.heading,
        greeting: content.greeting,
        body: content.body,
        buttonLabel: content.buttonLabel,
        fallbackLinkInstructions: content.fallbackLinkInstructions,
        expirationNotice: content.expirationNotice,
        securityNotice: content.securityNotice,
        footerExplanation: content.footerExplanation,
        needsReview: false,
        updatedByUserId: actorUserId,
        channel: definition.channel,
        title: definition.title,
        defaultBody: definition.body,
        defaultContent: templateDefaultContent(definition),
        variablesJson: templateVariablesJson([...definition.variables]),
        isEditable: definition.isEditable,
        isSystem: definition.isSystem,
      },
    });
    await this.auditTemplateUpdate(communityId, actorUserId, `${key}:${locale}`, updated.channel, existing.body, content.body, updated.id);
    return localizedMessageTemplateShape(updated);
  }

  async previewMessageTemplate(communityId: string, key: string, input: Record<string, unknown>) {
    if (!isEditableEmailTemplateKey(key)) throw new NotFoundException('Template not found.');
    const locale = strictEmailLocale(input.locale);
    const definition = messageTemplateDefinition(key, locale);
    const template = localizedTemplateInput(input, definition);
    validateLocalizedTemplate(template, editableTemplateRequiredVariables(template));
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, select: { name: true } });
    const preview = emailTemplatePreviewContext(key);
    return renderTemplateEmail(template, preview.variables, {
      communityName: community.name,
      actionUrl: preview.actionUrl,
    });
  }

  async testMessageTemplate(communityId: string, key: string, actorUserId: string, input: Record<string, unknown>) {
    const rendered = await this.previewMessageTemplate(communityId, key, input);
    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId }, select: { id: true, name: true, email: true } });
    const locale = strictEmailLocale(input.locale);
    await this.email.queueCampaign({
      communityId,
      createdById: actorUserId,
      type: 'TEMPLATE_TEST',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale,
      metadata: { templateKey: key, locale, source: 'ADMIN_TEMPLATE_TEST' },
      recipients: [{ userId: actor.id, email: actor.email, name: actor.name }],
    });
    return { queued: true, locale };
  }

  async notificationTemplates(communityId: string) {
    await ensureAutomationNotificationTemplates(this.prisma, communityId);
    const templates = await this.prisma.notificationTemplate.findMany({ where: { communityId }, orderBy: [{ key: 'asc' }] });
    return templates.map((template) => notificationTemplateShape(template));
  }

  async notificationTemplate(communityId: string, templateId: string) {
    await ensureAutomationNotificationTemplates(this.prisma, communityId);
    const template = await this.prisma.notificationTemplate.findFirst({ where: { id: templateId, communityId } });
    if (!template) throw new NotFoundException('Notification template not found.');
    return notificationTemplateShape(template);
  }

  async updateNotificationTemplate(communityId: string, templateId: string, actorUserId: string, input: Record<string, unknown>) {
    const existing = await this.prisma.notificationTemplate.findFirst({ where: { id: templateId, communityId } });
    if (!existing) throw new NotFoundException('Notification template not found.');
    validateNotificationTemplatePlaceholders(input);
    const data = notificationTemplateUpdateData(input);
    const changed = templateContentChanged(existing, input);
    const updated = await this.prisma.notificationTemplate.update({
      where: { id: existing.id },
      data: {
        ...data,
        updatedById: actorUserId,
        ...(changed ? { version: { increment: 1 } } : {}),
      },
    });
    if (changed) {
      await this.prisma.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'settings.notification_template.updated',
          targetType: 'NotificationTemplate',
          targetId: updated.id,
          metadata: { key: updated.key, version: updated.version, source: 'AUTOMATION' },
        },
      });
    }
    return notificationTemplateShape(updated);
  }

  async previewNotificationTemplate(communityId: string, templateId: string, input: Record<string, unknown>) {
    const template = await this.prisma.notificationTemplate.findFirst({ where: { id: templateId, communityId } });
    if (!template) throw new NotFoundException('Notification template not found.');
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, select: { name: true } });
    const locale = String(input.locale) === 'fr' ? 'fr' : 'en';
    const variables = { ...sampleTemplateVariables(locale), communityName: community.name };
    const rendered = renderNotificationTemplate(template, locale, variables);
    return {
      template: { key: template.key, version: template.version },
      locale: rendered.locale,
      inApp: { title: rendered.inAppTitle, body: rendered.inAppBody, actionUrl: variables.actionUrl },
      email: {
        subject: rendered.subject,
        title: rendered.emailTitle || rendered.inAppTitle,
        body: rendered.emailBody || rendered.inAppBody,
        html: brandedAutomationEmail({ communityName: community.name, title: rendered.emailTitle || rendered.inAppTitle, body: rendered.emailBody || rendered.inAppBody, actionUrl: variables.actionUrl, buttonLabel: rendered.buttonLabel, locale: rendered.locale }).html,
      },
    };
  }

  async testNotificationTemplate(communityId: string, templateId: string, actorUserId: string, input: Record<string, unknown>) {
    const [template, community, actor, emailAvailability] = await Promise.all([
      this.prisma.notificationTemplate.findFirst({ where: { id: templateId, communityId, enabled: true } }),
      this.prisma.community.findUnique({ where: { id: communityId }, select: { name: true, settings: { select: { defaultLanguage: true } } } }),
      this.prisma.user.findFirst({ where: { id: actorUserId, memberships: { some: { communityId, status: 'ACTIVE', role: { key: { in: ['owner', 'admin'] } } } } }, select: { id: true, email: true, name: true } }),
      this.email.automationAvailability(communityId),
    ]);
    if (!template || !community || !actor) throw new NotFoundException('Notification template or test recipient not found.');
    const locale = String(input.locale) === 'fr' ? 'fr' : community.settings?.defaultLanguage ?? 'en';
    const variables = { ...sampleTemplateVariables(locale), communityName: community.name, recipientName: actor.name };
    const rendered = renderNotificationTemplate(template, locale, variables);
    const actionUrl = String(variables.actionUrl || '');
    const notification = await this.prisma.notification.create({
      data: {
        communityId,
        userId: actor.id,
        type: 'TASK_BOARD_AUTOMATION_TEST',
        title: rendered.inAppTitle,
        body: rendered.inAppBody,
        metadata: { kind: 'TASK_BOARD_AUTOMATION_TEMPLATE_TEST', templateKey: template.key, templateVersion: template.version, locale: rendered.locale, source: 'AUTOMATION', actionUrl },
        dedupeKey: `TASK_BOARD_AUTOMATION_TEMPLATE_TEST:${template.id}:${actor.id}:${Date.now()}`,
      },
    });
    let emailCampaignId: string | null = null;
    if (emailAvailability.available && actor.email) {
      const emailBody = rendered.emailBody || rendered.inAppBody;
      const emailTitle = rendered.emailTitle || rendered.inAppTitle;
      const branded = brandedAutomationEmail({ communityName: community.name, title: emailTitle, body: emailBody, actionUrl, buttonLabel: rendered.buttonLabel, locale: rendered.locale });
      const campaign = await this.email.queueAutomationEmail({
        communityId,
        createdById: actor.id,
        type: 'TASK_BOARD_AUTOMATION_TEST',
        subject: rendered.subject || emailTitle,
        textBody: branded.text,
        htmlBody: branded.html,
        recipients: [{ userId: actor.id, email: actor.email, name: actor.name }],
        metadata: { source: 'AUTOMATION', mode: 'TEMPLATE_TEST', templateKey: template.key, templateVersion: template.version, locale: rendered.locale },
      });
      emailCampaignId = campaign.id;
    }
    await this.prisma.auditLog.create({
      data: {
        communityId,
        actorUserId,
        action: 'settings.notification_template.test_sent',
        targetType: 'NotificationTemplate',
        targetId: template.id,
        metadata: { key: template.key, version: template.version, locale: rendered.locale, notificationId: notification.id, emailCampaignId },
      },
    });
    return { notificationId: notification.id, emailCampaignId, emailAvailable: emailAvailability.available };
  }

  private async auditTemplateUpdate(communityId: string, actorUserId: string, key: string, channel: string, previousBody: string, nextBody: string, targetId: string) {
    if (previousBody === nextBody) return;
    await this.prisma.auditLog.create({
      data: {
        communityId,
        actorUserId,
        action: 'settings.templates.updated',
        targetType: 'CommunityMessageTemplate',
        targetId,
        metadata: {
          key,
          channel,
          changedFields: ['body'],
          bodyChanged: true,
          previousLength: previousBody.length,
          nextLength: nextBody.length,
        },
      },
    });
  }

  async inviteLink(communityId: string) {
    return this.inviteLinkShape(await this.activeInviteLink(communityId));
  }

  async generateInviteLink(communityId: string, actorUserId: string) {
    await this.prisma.community.findUniqueOrThrow({ where: { id: communityId } });
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashInviteToken(token);
    await this.prisma.communityInviteLink.updateMany({
      where: { communityId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const invite = await this.prisma.communityInviteLink.create({
      data: {
        communityId,
        createdByUserId: actorUserId,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      include: { createdBy: { select: { name: true, email: true } } },
    });
    await this.prisma.auditLog.create({
      data: { communityId, actorUserId, action: 'registration.invite.generated', targetType: 'CommunityInviteLink', targetId: invite.id, metadata: { expiresAt: invite.expiresAt?.toISOString() ?? null } },
    });
    return { ...this.inviteLinkShape(invite), inviteUrl: inviteUrl(token) };
  }

  async revokeInviteLink(communityId: string, actorUserId: string) {
    const invite = await this.activeInviteLink(communityId);
    if (!invite) return this.inviteLinkShape(null);
    const revoked = await this.prisma.communityInviteLink.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
      include: { createdBy: { select: { name: true, email: true } } },
    });
    await this.prisma.auditLog.create({
      data: { communityId, actorUserId, action: 'registration.invite.revoked', targetType: 'CommunityInviteLink', targetId: revoked.id, metadata: {} },
    });
    return this.inviteLinkShape(revoked);
  }

  async sendInviteLink(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const recipientEmail = optionalEmail(input.recipientEmail);
    if (!recipientEmail) throw new BadRequestException('A valid recipient email is required.');
    const generated = await this.generateInviteLink(communityId, actorUserId);
    try {
      const campaign = await this.email.queueInviteEmail(communityId, actorUserId, recipientEmail, generated.inviteUrl);
      await this.prisma.auditLog.create({
        data: { communityId, actorUserId, action: 'registration.invite.email_sent', targetType: 'EmailCampaign', targetId: campaign.id, metadata: { recipientEmail } },
      });
      return { ...generated, emailQueued: true };
    } catch (error) {
      await this.prisma.auditLog.create({
        data: { communityId, actorUserId, action: 'registration.invite.email_failed', targetType: 'CommunityInviteLink', targetId: generated.id ?? communityId, metadata: { recipientEmail } },
      });
      throw error;
    }
  }

  private activeInviteLink(communityId: string) {
    const now = new Date();
    return this.prisma.communityInviteLink.findFirst({
      where: {
        communityId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { name: true, email: true } } },
    });
  }

  private inviteLinkShape(invite: Awaited<ReturnType<AdminService['activeInviteLink']>>) {
    if (!invite) return { exists: false };
    const expired = Boolean(invite.expiresAt && invite.expiresAt <= new Date());
    return {
      exists: true,
      id: invite.id,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      revokedAt: invite.revokedAt,
      useCount: invite.useCount,
      maxUses: invite.maxUses,
      status: invite.revokedAt ? 'revoked' : expired ? 'expired' : 'active',
      createdBy: invite.createdBy,
    };
  }

  async runDueReminders(communityId: string, actorUserId: string, now = new Date()) {
    const settings = await this.reminderSettings(communityId);
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId } });
    const memberships = await this.prisma.membership.findMany({
      where: { communityId, status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true, email: true } }, role: true, profile: true },
    });
    const admins = memberships.filter((membership) => membership.role.key === 'owner' || membership.role.key === 'admin');
    const today = dateKey(now);
    let created = 0;
    const result = {
      created: 0,
      birthdayRemindersCreated: 0,
      anniversaryRemindersCreated: 0,
      passportRemindersCreated: 0,
      passportAdminAlertsCreated: 0,
      reminderEmailsQueued: 0,
    };
    const notificationSettings = await this.notificationSettings(communityId);
    const emailAvailable = settings.passportEmailEnabled ? (await this.email.publicSettings(communityId)).available : false;

    for (const membership of memberships) {
      if (settings.birthdayReminderEnabled && membership.profile?.birthdate) {
        const birthday = nextAnnualDate(membership.profile.birthdate, now);
        const daysUntil = daysBetween(now, birthday);
        if ((daysUntil === 0 && settings.birthdayDayNotificationEnabled) || (daysUntil !== 0 && daysUntil === settings.birthdayReminderDaysBefore)) {
          const template = daysUntil === 0 ? settings.birthdayDayTemplate : settings.birthdayReminderTemplate;
          const body = applyTemplate(template, {
            memberName: membership.user.name,
            communityName: community.name,
            date: birthday.toISOString().slice(0, 10),
            years: '',
          });
          const recipients = new Set([membership.userId, ...admins.map((admin) => admin.userId)]);
          if (settings.birthdayNotifyAllMembers) memberships.forEach((item) => recipients.add(item.userId));
          const count = await this.createNotificationsForUsers(communityId, Array.from(recipients), {
            type: daysUntil === 0 ? 'BIRTHDAY_DAY' : 'BIRTHDAY_REMINDER',
            title: daysUntil === 0 ? 'Birthday today' : 'Birthday reminder',
            body,
            targetId: `birthday:${membership.userId}:${today}`,
            metadata: { subjectUserId: membership.userId, monthDay: monthDayKey(membership.profile.birthdate), reminderDate: today },
          });
          created += count;
          result.birthdayRemindersCreated += count;
        }
      }

      if (settings.anniversaryReminderEnabled) {
        const anniversary = nextAnnualDate(membership.joinedAt, now);
        const years = Math.max(1, anniversary.getUTCFullYear() - membership.joinedAt.getUTCFullYear());
        const daysUntil = daysBetween(now, anniversary);
        if ((daysUntil === 0 && settings.anniversaryDayNotificationEnabled) || (daysUntil !== 0 && daysUntil === settings.anniversaryReminderDaysBefore)) {
          const template = daysUntil === 0 ? settings.anniversaryDayTemplate : settings.anniversaryReminderTemplate;
          const body = applyTemplate(template, {
            memberName: membership.user.name,
            communityName: community.name,
            date: anniversary.toISOString().slice(0, 10),
            years: String(years),
          });
          const count = await this.createNotificationsForUsers(communityId, [membership.userId, ...admins.map((admin) => admin.userId)], {
            type: daysUntil === 0 ? 'ANNIVERSARY_DAY' : 'ANNIVERSARY_REMINDER',
            title: daysUntil === 0 ? 'Membership anniversary today' : 'Membership anniversary reminder',
            body,
            targetId: `anniversary:${membership.userId}:${today}`,
            metadata: { subjectUserId: membership.userId, years, reminderDate: today },
          });
          created += count;
          result.anniversaryRemindersCreated += count;
        }
      }

      if (settings.passportRemindersEnabled && membership.profile?.passportExpiresAt) {
        const expirationDate = startOfUtcDay(membership.profile.passportExpiresAt);
        const daysUntil = daysBetween(now, expirationDate);
        const stages = [
          { offset: settings.passportFirstReminderDaysBefore, label: 'First notice' },
          { offset: settings.passportSecondReminderDaysBefore, label: 'Second notice' },
          { offset: settings.passportFinalReminderDaysBefore, label: 'Final notice' },
        ];
        const stage = stages.find((item) => item.offset === daysUntil) ?? (daysUntil === 0 && settings.passportDayOfReminderEnabled ? { offset: 0, label: 'Expiration day' } : null);
        if (stage) {
          const template = daysUntil === 0 ? settings.passportDayOfTemplate : settings.passportReminderTemplate;
          const values = {
            memberName: membership.user.name,
            communityName: community.name,
            expirationDate: expirationDate.toISOString().slice(0, 10),
            daysRemaining: String(daysUntil),
            stageLabel: stage.label,
          };
          const body = applyPassportTemplate(template, values);
          const targetId = `passport:${membership.userId}:${values.expirationDate}:${stage.offset}`;
          let memberCreated = 0;
          let adminCreated = 0;
          if (settings.passportNotifyMember) {
            memberCreated = await this.createNotificationsForUsers(communityId, [membership.userId], {
              type: daysUntil === 0 ? 'PASSPORT_EXPIRATION_DAY' : 'PASSPORT_EXPIRATION_REMINDER',
              title: 'Passport renewal reminder',
              body,
              targetId,
              metadata: { stageOffsetDays: stage.offset, stageLabel: stage.label, expirationDate: values.expirationDate, memberId: membership.userId },
            });
            created += memberCreated;
            result.passportRemindersCreated += memberCreated;
          }
          if (settings.passportNotifyAdmins && notificationSettings.adminInAppAlertsEnabled && notificationSettings.passportExpirationAdminAlertsEnabled) {
            adminCreated = await this.createNotificationsForUsers(communityId, admins.map((admin) => admin.userId), {
              type: daysUntil === 0 ? 'PASSPORT_EXPIRATION_DAY' : 'PASSPORT_EXPIRATION_REMINDER',
              title: 'Passport renewal reminder',
              body: `A member's passport is nearing expiration: ${membership.user.name} - ${values.expirationDate}.`,
              targetId: `admin:${targetId}`,
              metadata: { targetMemberId: membership.userId, targetMemberName: membership.user.name, expirationDate: values.expirationDate, stageOffsetDays: stage.offset, stageLabel: stage.label },
            });
            created += adminCreated;
            result.passportAdminAlertsCreated += adminCreated;
          }
          if (settings.passportEmailEnabled && emailAvailable) {
            if (settings.passportNotifyMember && memberCreated > 0) {
              await this.email.queuePassportReminderEmail(communityId, { userId: membership.userId, email: membership.user.email, name: membership.user.name }, 'Passport renewal reminder', body);
              result.reminderEmailsQueued += 1;
            }
            if (settings.passportNotifyAdmins && notificationSettings.adminInAppAlertsEnabled && notificationSettings.passportExpirationAdminAlertsEnabled && adminCreated > 0 && admins.length) {
              await this.email.queueCampaign({
                communityId,
                createdById: actorUserId,
                type: 'PASSPORT_EXPIRATION',
                subject: 'Passport renewal reminder',
                textBody: `A member's passport is nearing expiration: ${membership.user.name} - ${values.expirationDate}.`,
                recipients: admins.map((admin) => ({ userId: admin.userId, email: admin.user.email, name: admin.user.name })),
              });
              result.reminderEmailsQueued += admins.length;
            }
          }
        }
      }
    }

    result.created = created;
    await this.prisma.auditLog.create({
      data: { communityId, actorUserId, action: 'reminders.run', targetType: 'Community', targetId: communityId, metadata: result },
    });
    return result;
  }

  async event(communityId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, communityId },
      include: { rsvps: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    if (!event) throw new NotFoundException('Event not found.');
    return adminEventShape(event);
  }

  async createEvent(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const data = eventData(input);
    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.event.create({ data: { communityId, ...data }, include: { rsvps: true } });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'event.created', targetType: 'Event', targetId: created.id, metadata: { title: created.title } },
      });
      return created;
    });
    await this.notifyEventCreated(communityId, event.id, event.title, event.startsAt);
    return adminEventShape(event);
  }

  async updateEvent(communityId: string, eventId: string, actorUserId: string, input: Record<string, unknown>) {
    const existing = await this.prisma.event.findFirst({ where: { id: eventId, communityId } });
    if (!existing) throw new NotFoundException('Event not found.');
    const event = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.event.update({ where: { id: existing.id }, data: eventData(input), include: { rsvps: true } });
      await tx.taskBoard.updateMany({ where: { communityId, eventId: updated.id }, data: { name: updated.title } });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'event.updated', targetType: 'Event', targetId: updated.id, metadata: { title: updated.title } },
      });
      return updated;
    });
    return adminEventShape(event);
  }

  async deleteEvent(communityId: string, eventId: string, actorUserId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, communityId } });
    if (!event) throw new NotFoundException('Event not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'event.deleted', targetType: 'Event', targetId: event.id, metadata: { title: event.title } },
      });
      await tx.taskBoard.updateMany({ where: { communityId, eventId: event.id, archivedAt: null }, data: { archivedAt: new Date() } });
      await tx.eventRsvp.deleteMany({ where: { eventId: event.id } });
      await tx.event.delete({ where: { id: event.id } });
    });
    return { deleted: true, id: event.id };
  }

  async eventRsvps(communityId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, communityId },
      include: {
        rsvps: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                memberships: { where: { communityId }, take: 1, select: { role: { select: { key: true } } } },
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found.');
    const rsvps = event.rsvps.map(({ user, ...rsvp }) => ({
      ...rsvp,
      user: { id: user.id, name: user.name, email: user.email, role: user.memberships[0]?.role.key ?? null },
    }));
    return {
      event: adminEventShape({ ...event, rsvps }),
      rsvps,
    };
  }

  emailEventAttendees(communityId: string, eventId: string, actorUserId: string, input: Record<string, unknown>) {
    return this.email.queueEventAttendeeEmail(communityId, actorUserId, eventId, input);
  }

  async eventTasks(communityId: string, eventId: string) {
    await this.requireCommunityEvent(communityId, eventId);
    const tasks = await this.prisma.eventTask.findMany({
      where: { communityId, eventId, archivedAt: null },
      include: eventTaskInclude,
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return { tasks: tasks.map(eventTaskShape) };
  }

  async eventPlanningOverview(communityId: string, eventId: string) {
    const event = await this.requireCommunityEvent(communityId, eventId);
    const now = new Date();
    const dueSoonAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const recentActivitySince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const tasks = await this.prisma.eventTask.findMany({
      where: { communityId, eventId, archivedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assigneeId: true,
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
        checklistItems: { where: { archivedAt: null }, select: { isCompleted: true } },
        _count: {
          select: {
            comments: { where: { archivedAt: null } },
            attachments: { where: { archivedAt: null } },
            activities: { where: { createdAt: { gte: recentActivitySince } } },
          },
        },
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === EventTaskStatus.DONE).length;
    const todo = tasks.filter((task) => task.status === EventTaskStatus.TODO).length;
    const inProgress = tasks.filter((task) => task.status === EventTaskStatus.IN_PROGRESS).length;
    const overdueTasks = tasks.filter((task) => task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate < now);
    const dueSoonTasks = tasks.filter((task) => task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate >= now && task.dueDate <= dueSoonAt);
    const unassignedTasks = tasks.filter((task) => !task.assigneeId);
    const checklistTotal = tasks.reduce((sum, task) => sum + task.checklistItems.length, 0);
    const checklistCompleted = tasks.reduce((sum, task) => sum + task.checklistItems.filter((item) => item.isCompleted).length, 0);
    const checklistPercent = checklistTotal ? Math.round((checklistCompleted / checklistTotal) * 100) : 100;
    const assignedRatio = total ? (total - unassignedTasks.length) / total : 0;
    const rawScore = total ? (done / total) * 60 + (checklistPercent / 100) * 25 + assignedRatio * 15 - overdueTasks.length * 8 : 0;
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));
    const label = score >= 95 && overdueTasks.length === 0
      ? 'COMPLETE'
      : overdueTasks.length > 0 || score < 45
        ? 'AT_RISK'
        : score >= 75
          ? 'ON_TRACK'
          : 'NEEDS_ATTENTION';

    const assigneeMap = new Map<string, { id: string; name: string; avatarUrl: string | null; dicebearStyle: string | null; dicebearSeed: string | null; totalTasks: number; doneTasks: number; overdueTasks: number }>();
    for (const task of tasks) {
      if (!task.assignee) continue;
      const profile = task.assignee.memberships[0]?.profile;
      const current = assigneeMap.get(task.assignee.id) ?? { id: task.assignee.id, name: task.assignee.name, avatarUrl: profile?.avatarUrl ?? null, dicebearStyle: profile?.dicebearStyle ?? null, dicebearSeed: profile?.dicebearSeed ?? null, totalTasks: 0, doneTasks: 0, overdueTasks: 0 };
      current.totalTasks += 1;
      if (task.status === EventTaskStatus.DONE) current.doneTasks += 1;
      if (task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate < now) current.overdueTasks += 1;
      assigneeMap.set(current.id, current);
    }

    const blockers: Array<{ type: 'OVERDUE_TASK' | 'UNASSIGNED_TASK' | 'INCOMPLETE_CHECKLIST' | 'NO_TASKS'; taskId?: string; title: string }> = [];
    if (!total) blockers.push({ type: 'NO_TASKS', title: event.title });
    overdueTasks.forEach((task) => blockers.push({ type: 'OVERDUE_TASK', taskId: task.id, title: task.title }));
    unassignedTasks.forEach((task) => blockers.push({ type: 'UNASSIGNED_TASK', taskId: task.id, title: task.title }));
    tasks.filter((task) => task.checklistItems.some((item) => !item.isCompleted)).forEach((task) => blockers.push({ type: 'INCOMPLETE_CHECKLIST', taskId: task.id, title: task.title }));

    return {
      event: { id: event.id, title: event.title, startsAt: event.startsAt },
      readiness: { score, label },
      tasks: { total, todo, inProgress, done, overdue: overdueTasks.length, dueSoon: dueSoonTasks.length, unassigned: unassignedTasks.length },
      checklist: { total: checklistTotal, completed: checklistCompleted, percent: checklistPercent },
      collaboration: {
        comments: tasks.reduce((sum, task) => sum + task._count.comments, 0),
        attachments: tasks.reduce((sum, task) => sum + task._count.attachments, 0),
        recentActivity: tasks.reduce((sum, task) => sum + task._count.activities, 0),
      },
      assignees: Array.from(assigneeMap.values()).sort((left, right) => right.overdueTasks - left.overdueTasks || right.totalTasks - left.totalTasks || left.name.localeCompare(right.name)),
      blockers: blockers.slice(0, 8),
    };
  }

  async createEventTask(communityId: string, eventId: string, actorUserId: string, input: Record<string, unknown>) {
    const event = await this.requireCommunityEvent(communityId, eventId);
    const data = eventTaskCreateData(input);
    const assigneeIds = eventTaskAssigneeIds(input) ?? [];
    await this.requireActiveEventTaskAssignees(communityId, assigneeIds);
    const task = await this.prisma.$transaction(async (tx) => {
      const board = await tx.taskBoard.upsert({
        where: { eventId },
        update: { name: event.title, archivedAt: null },
        create: { communityId, eventId, name: event.title, visibility: 'PUBLIC', createdById: actorUserId },
      });
      const highestOrder = await tx.eventTask.aggregate({
        where: { communityId, eventId, status: EventTaskStatus.TODO, archivedAt: null },
        _max: { sortOrder: true },
      });
      const created = await tx.eventTask.create({
        data: {
          communityId,
          eventId,
          taskBoardId: board.id,
          createdById: actorUserId,
          sortOrder: (highestOrder._max.sortOrder ?? -1) + 1,
          ...data,
          assigneeId: assigneeIds[0] ?? null,
        },
      });
      if (assigneeIds.length) {
        await tx.eventTaskAssignee.createMany({
          data: assigneeIds.map((userId) => ({ communityId, taskId: created.id, userId, assignedById: actorUserId })),
          skipDuplicates: true,
        });
      }
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'event.task.created', targetType: 'EventTask', targetId: created.id, metadata: { eventId, title: created.title } },
      });
      await this.eventTaskCollaboration.recordActivity(tx, communityId, eventId, created.id, actorUserId, [
        { type: EventTaskActivityType.CREATED },
        ...(assigneeIds.length ? [{ type: EventTaskActivityType.ASSIGNED, metadata: { toAssigneeIds: assigneeIds } }] : []),
      ]);
      for (const assigneeId of assigneeIds) {
        if (assigneeId !== actorUserId) await this.createEventTaskAssignmentNotification(tx, communityId, assigneeId, created.id, board.id, eventId, created.title, event.title, created.updatedAt);
      }
      return tx.eventTask.findUniqueOrThrow({ where: { id: created.id }, include: eventTaskInclude });
    });
    this.emitEventTaskChanged(communityId, eventId, 'created', task.id);
    return eventTaskShape(task);
  }

  eventTaskTemplates(communityId: string) {
    return this.prisma.eventTaskTemplate.findMany({
      where: { communityId, archivedAt: null },
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async eventTaskTemplate(communityId: string, templateId: string) {
    const template = await this.prisma.eventTaskTemplate.findFirst({
      where: { id: templateId, communityId, archivedAt: null },
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!template) throw new NotFoundException('Event task template not found.');
    return template;
  }

  async createEventTaskTemplate(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const data = eventTaskTemplateData(input);
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.eventTaskTemplate.create({
        data: {
          communityId,
          createdById: actorUserId,
          name: data.name,
          description: data.description,
          isActive: data.isActive,
          items: { create: data.items },
        },
        include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'event.task_template.created', targetType: 'EventTaskTemplate', targetId: template.id, metadata: { name: template.name, itemCount: template.items.length } } });
      return template;
    });
  }

  async updateEventTaskTemplate(communityId: string, templateId: string, actorUserId: string, input: Record<string, unknown>) {
    await this.eventTaskTemplate(communityId, templateId);
    const data = eventTaskTemplateData(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.eventTaskTemplateItem.deleteMany({ where: { templateId } });
      const template = await tx.eventTaskTemplate.update({
        where: { id: templateId },
        data: {
          name: data.name,
          description: data.description,
          isActive: data.isActive,
          items: { create: data.items },
        },
        include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
      });
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'event.task_template.updated', targetType: 'EventTaskTemplate', targetId: template.id, metadata: { name: template.name, itemCount: template.items.length } } });
      return template;
    });
  }

  async archiveEventTaskTemplate(communityId: string, templateId: string, actorUserId: string) {
    const existing = await this.eventTaskTemplate(communityId, templateId);
    const archivedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.eventTaskTemplate.update({ where: { id: existing.id }, data: { archivedAt, isActive: false } }),
      this.prisma.auditLog.create({ data: { communityId, actorUserId, action: 'event.task_template.archived', targetType: 'EventTaskTemplate', targetId: existing.id, metadata: { name: existing.name } } }),
    ]);
    return { id: existing.id, archivedAt };
  }

  async applyEventTaskTemplate(communityId: string, eventId: string, templateId: string, actorUserId: string, input: Record<string, unknown>) {
    const event = await this.requireCommunityEvent(communityId, eventId);
    const template = await this.eventTaskTemplate(communityId, templateId);
    if (!template.isActive) throw new BadRequestException('Event task template is inactive.');
    if (!template.items.length) throw new BadRequestException('Event task template has no items.');
    const status = input.defaultStatus === undefined ? EventTaskStatus.TODO : requiredEventTaskStatus(input.defaultStatus);
    const tasks = await this.prisma.$transaction(async (tx) => {
      const board = await tx.taskBoard.upsert({
        where: { eventId },
        update: { name: event.title, archivedAt: null },
        create: { communityId, eventId, name: event.title, visibility: 'PUBLIC', createdById: actorUserId },
      });
      const highestOrder = await tx.eventTask.aggregate({ where: { communityId, eventId, status, archivedAt: null }, _max: { sortOrder: true } });
      const created: EventTaskWithAssignee[] = [];
      for (const [index, item] of template.items.entries()) {
        const task = await tx.eventTask.create({
          data: {
            communityId,
            eventId,
            taskBoardId: board.id,
            createdById: actorUserId,
            title: item.title,
            description: item.description,
            priority: item.priority,
            label: item.label,
            dueDate: item.dueOffsetDays === null ? null : new Date(event.startsAt.getTime() + item.dueOffsetDays * 86_400_000),
            status,
            sortOrder: (highestOrder._max.sortOrder ?? -1) + index + 1,
          },
          include: eventTaskInclude,
        });
        await this.eventTaskCollaboration.recordActivity(tx, communityId, eventId, task.id, actorUserId, [{ type: EventTaskActivityType.CREATED }]);
        created.push(task);
      }
      await tx.auditLog.create({ data: { communityId, actorUserId, action: 'event.task_template.applied', targetType: 'Event', targetId: eventId, metadata: { templateId: template.id, templateName: template.name, taskCount: created.length } } });
      return created;
    });
    this.emitEventTaskChanged(communityId, eventId, 'created');
    return { tasks: tasks.map(eventTaskShape) };
  }

  async updateEventTask(communityId: string, eventId: string, taskId: string, actorUserId: string, input: Record<string, unknown>) {
    const event = await this.requireCommunityEvent(communityId, eventId);
    const existing = await this.requireEventTask(communityId, eventId, taskId);
    const data = eventTaskUpdateData(input);
    const assigneeIds = eventTaskAssigneeIds(input);
    await this.requireActiveEventTaskAssignees(communityId, assigneeIds ?? []);
    const previousAssigneeIds = existing.assignees.map((assignment) => assignment.userId);
    const assignmentChanged = assigneeIds !== undefined && !sameStringSet(previousAssigneeIds, assigneeIds);
    const newlyAssignedIds = assigneeIds?.filter((userId) => !previousAssigneeIds.includes(userId)) ?? [];
    const updateData: EventTaskUpdateData = { ...data };
    if (assigneeIds !== undefined) updateData.assigneeId = assigneeIds[0] ?? null;
    const taskChanged = assignmentChanged || eventTaskDataChanged(existing, updateData);
    const assignmentActivityTypes = new Set<EventTaskActivityType>([EventTaskActivityType.ASSIGNED, EventTaskActivityType.UNASSIGNED, EventTaskActivityType.REASSIGNED]);
    const activity = eventTaskUpdateActivities(existing, updateData).filter((entry) => !assignmentActivityTypes.has(entry.type));
    if (assignmentChanged) activity.unshift({ type: assigneeIds?.length ? EventTaskActivityType.ASSIGNED : EventTaskActivityType.UNASSIGNED, metadata: { fromAssigneeIds: previousAssigneeIds, toAssigneeIds: assigneeIds ?? [] } });
    const task = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventTask.update({ where: { id: existing.id }, data: updateData });
      if (assigneeIds !== undefined) {
        await tx.eventTaskAssignee.updateMany({ where: { taskId: existing.id, userId: { notIn: assigneeIds }, archivedAt: null }, data: { archivedAt: new Date() } });
        for (const userId of assigneeIds) {
          await tx.eventTaskAssignee.upsert({
            where: { taskId_userId: { taskId: existing.id, userId } },
            update: { archivedAt: null, assignedById: actorUserId, assignedAt: new Date() },
            create: { communityId, taskId: existing.id, userId, assignedById: actorUserId },
          });
        }
      }
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'event.task.updated', targetType: 'EventTask', targetId: updated.id, metadata: { eventId, title: updated.title } },
      });
      await this.eventTaskCollaboration.recordActivity(tx, communityId, eventId, updated.id, actorUserId, activity);
      for (const assigneeId of newlyAssignedIds) {
        if (assigneeId !== actorUserId) await this.createEventTaskAssignmentNotification(tx, communityId, assigneeId, updated.id, updated.taskBoardId, eventId, updated.title, event.title, updated.updatedAt);
      }
      return tx.eventTask.findUniqueOrThrow({ where: { id: updated.id }, include: eventTaskInclude });
    });
    if (taskChanged) this.emitEventTaskChanged(communityId, eventId, 'updated', task.id);
    return eventTaskShape(task);
  }

  async updateEventTaskStatus(communityId: string, eventId: string, taskId: string, actorUserId: string, input: Record<string, unknown>) {
    const existing = await this.requireEventTask(communityId, eventId, taskId);
    const status = requiredEventTaskStatus(input.status);
    const requestedOrder = optionalSortOrder(input.sortOrder);
    const task = await this.prisma.$transaction(async (tx) => {
      const highestOrder = requestedOrder === undefined
        ? await tx.eventTask.aggregate({ where: { communityId, eventId, status, archivedAt: null, id: { not: existing.id } }, _max: { sortOrder: true } })
        : null;
      const updated = await tx.eventTask.update({
        where: { id: existing.id },
        data: { status, sortOrder: requestedOrder ?? ((highestOrder?._max.sortOrder ?? -1) + 1) },
        include: eventTaskInclude,
      });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'event.task.moved', targetType: 'EventTask', targetId: updated.id, metadata: { eventId, from: existing.status, to: status, sortOrder: updated.sortOrder } },
      });
      if (existing.status !== status) {
        await this.eventTaskCollaboration.recordActivity(tx, communityId, eventId, updated.id, actorUserId, [{ type: EventTaskActivityType.STATUS_CHANGED, metadata: { from: existing.status, to: status } }]);
      }
      return updated;
    });
    this.emitEventTaskChanged(communityId, eventId, 'moved', task.id);
    return eventTaskShape(task);
  }

  async reorderEventTasks(communityId: string, eventId: string, actorUserId: string, input: Record<string, unknown>) {
    await this.requireCommunityEvent(communityId, eventId);
    const columns = eventTaskColumns(input.columns);
    const existing = await this.prisma.eventTask.findMany({ where: { communityId, eventId, archivedAt: null }, select: { id: true, status: true, sortOrder: true } });
    const existingIds = new Set(existing.map((task) => task.id));
    const orderedIds = Object.values(columns).flat();
    const orderedIdSet = new Set(orderedIds);
    if (orderedIds.length !== orderedIdSet.size || orderedIds.length !== existingIds.size || orderedIds.some((taskId) => !existingIds.has(taskId))) {
      throw new BadRequestException('Reorder must include every active task exactly once.');
    }
    const changedTaskIds = existing.filter((task) => {
      const nextStatus = EVENT_TASK_STATUSES.find((status) => columns[status].includes(task.id));
      return nextStatus !== task.status || (nextStatus ? columns[nextStatus].indexOf(task.id) : -1) !== task.sortOrder;
    }).map((task) => task.id);
    const requestedActivityTaskId = typeof input.taskId === 'string' && changedTaskIds.includes(input.taskId) ? input.taskId : changedTaskIds[0];
    await this.prisma.$transaction(async (tx) => {
      for (const status of EVENT_TASK_STATUSES) {
        for (const [sortOrder, taskId] of columns[status].entries()) {
          await tx.eventTask.update({ where: { id: taskId }, data: { status, sortOrder } });
        }
      }
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'event.tasks.reordered', targetType: 'Event', targetId: eventId, metadata: { taskCount: orderedIds.length } },
      });
      if (requestedActivityTaskId) {
        await this.eventTaskCollaboration.recordActivity(tx, communityId, eventId, requestedActivityTaskId, actorUserId, [{ type: EventTaskActivityType.REORDERED, metadata: { changedTaskCount: changedTaskIds.length } }]);
      }
    });
    const result = await this.eventTasks(communityId, eventId);
    this.emitEventTaskChanged(communityId, eventId, 'reordered', requestedActivityTaskId);
    return result;
  }

  async archiveEventTask(communityId: string, eventId: string, taskId: string, actorUserId: string) {
    const existing = await this.requireEventTask(communityId, eventId, taskId);
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventTask.update({ where: { id: existing.id }, data: { archivedAt } });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'event.task.archived', targetType: 'EventTask', targetId: existing.id, metadata: { eventId, title: existing.title } },
      });
      await this.eventTaskCollaboration.recordActivity(tx, communityId, eventId, existing.id, actorUserId, [{ type: EventTaskActivityType.ARCHIVED }]);
    });
    this.emitEventTaskChanged(communityId, eventId, 'archived', existing.id);
    return { id: existing.id, archivedAt };
  }

  private emitEventTaskChanged(communityId: string, eventId: string, reason: 'created' | 'updated' | 'moved' | 'reordered' | 'archived', taskId?: string) {
    this.eventTasksRealtime.emitTaskChanged({ communityId, eventId, reason, taskId, changedAt: new Date().toISOString() });
  }

  taskActivity(communityId: string, eventId: string, taskId: string) {
    return this.eventTaskCollaboration.activity(communityId, eventId, taskId);
  }

  taskComments(communityId: string, eventId: string, taskId: string, actorUserId: string, canArchiveAny: boolean) {
    return this.eventTaskCollaboration.comments(communityId, eventId, taskId, actorUserId, canArchiveAny);
  }

  addTaskComment(communityId: string, eventId: string, taskId: string, actorUserId: string, body: unknown) {
    return this.eventTaskCollaboration.addComment(communityId, eventId, taskId, actorUserId, body);
  }

  archiveTaskComment(communityId: string, eventId: string, taskId: string, commentId: string, actorUserId: string) {
    return this.eventTaskCollaboration.archiveComment(communityId, eventId, taskId, commentId, actorUserId, true);
  }

  taskAttachments(communityId: string, eventId: string, taskId: string, actorUserId: string, canRemoveAny: boolean) {
    return this.eventTaskCollaboration.attachments(communityId, eventId, taskId, actorUserId, canRemoveAny);
  }

  addTaskAttachments(communityId: string, eventId: string, taskId: string, actorUserId: string, files: UploadedEventTaskAttachmentFile[]) {
    return this.eventTaskCollaboration.addAttachments(communityId, eventId, taskId, actorUserId, files);
  }

  taskAttachmentDownload(communityId: string, eventId: string, taskId: string, attachmentId: string) {
    return this.eventTaskCollaboration.attachmentDownload(communityId, eventId, taskId, attachmentId);
  }

  archiveTaskAttachment(communityId: string, eventId: string, taskId: string, attachmentId: string, actorUserId: string) {
    return this.eventTaskCollaboration.archiveAttachment(communityId, eventId, taskId, attachmentId, actorUserId, true);
  }

  taskChecklist(communityId: string, eventId: string, taskId: string, actorUserId: string, canManage: boolean) {
    return this.eventTaskCollaboration.checklist(communityId, eventId, taskId, actorUserId, canManage, canManage);
  }

  addTaskChecklistItem(communityId: string, eventId: string, taskId: string, actorUserId: string, title: unknown) {
    return this.eventTaskCollaboration.addChecklistItem(communityId, eventId, taskId, actorUserId, title, true);
  }

  updateTaskChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, actorUserId: string, title: unknown) {
    return this.eventTaskCollaboration.updateChecklistItem(communityId, eventId, taskId, itemId, actorUserId, title, true);
  }

  toggleTaskChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, actorUserId: string) {
    return this.eventTaskCollaboration.toggleChecklistItem(communityId, eventId, taskId, itemId, actorUserId, true);
  }

  reorderTaskChecklist(communityId: string, eventId: string, taskId: string, actorUserId: string, itemIds: unknown) {
    return this.eventTaskCollaboration.reorderChecklist(communityId, eventId, taskId, actorUserId, itemIds);
  }

  archiveTaskChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, actorUserId: string) {
    return this.eventTaskCollaboration.archiveChecklistItem(communityId, eventId, taskId, itemId, actorUserId, true);
  }

  private async requireCommunityEvent(communityId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, communityId }, select: { id: true, title: true, startsAt: true } });
    if (!event) throw new NotFoundException('Event not found.');
    return event;
  }

  private async requireEventTask(communityId: string, eventId: string, taskId: string) {
    await this.requireCommunityEvent(communityId, eventId);
    const task = await this.prisma.eventTask.findFirst({ where: { id: taskId, communityId, eventId, archivedAt: null }, include: eventTaskInclude });
    if (!task) throw new NotFoundException('Event task not found.');
    return task;
  }

  private async requireActiveEventTaskAssignees(communityId: string, assigneeIds: string[]) {
    if (!assigneeIds.length) return;
    const count = await this.prisma.membership.count({ where: { communityId, userId: { in: assigneeIds }, status: 'ACTIVE' } });
    if (count !== assigneeIds.length) throw new BadRequestException('Every assignee must be an active member of this community.');
  }

  private async createEventTaskAssignmentNotification(tx: Prisma.TransactionClient, communityId: string, assigneeId: string, taskId: string, taskBoardId: string | null, eventId: string, taskTitle: string, eventTitle: string, assignedAt: Date) {
    const settings = await tx.communitySettings.findUnique({ where: { communityId }, select: { defaultLanguage: true } });
    const copy = eventTaskAssignmentNotificationCopy(settings?.defaultLanguage, taskTitle, eventTitle);
    await tx.notification.create({
      data: {
        communityId,
        userId: assigneeId,
        type: 'EVENT_TASK_ASSIGNED',
        title: copy.title,
        body: copy.body,
        metadata: { kind: 'EVENT_TASK_ASSIGNED', eventId, taskId, boardId: taskBoardId, eventTitle, boardName: eventTitle, taskTitle, tab: 'activity' } as Prisma.InputJsonObject,
        dedupeKey: `EVENT_TASK_ASSIGNED:${taskId}:${assigneeId}:${assignedAt.getTime()}`,
      },
    });
  }

  async member(communityId: string, memberId: string) {
    const member = await this.prisma.membership.findFirst({
      where: { id: memberId, communityId },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true, updatedAt: true, twoFactorEnabled: true } }, role: true, profile: true, profileLinks: { select: profileLinkDtoSelect, orderBy: { position: 'asc' } } },
    });
    if (!member) throw new NotFoundException('Member not found.');
    return { ...member, profileLinks: safeProfileLinkResponses(member.profileLinks) };
  }

  async resetMemberPassword(communityId: string, memberId: string, actorUserId: string, input: Record<string, unknown>) {
    const temporaryPassword = stringValue(input.temporaryPassword);
    if (!temporaryPassword || temporaryPassword.length < 8) throw new BadRequestException('Temporary password must be at least 8 characters.');
    const membership = await this.prisma.membership.findFirst({ where: { id: memberId, communityId }, include: { role: true, user: true } });
    if (!membership) throw new NotFoundException('Member not found.');
    await this.assertCanModifyMembership(communityId, actorUserId, membership, 'member.password.reset');
    const passwordHash = await this.passwords.hash(temporaryPassword);
    const forcePasswordChange = booleanValue(input.forcePasswordChange) ?? false;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: membership.userId },
        data: { passwordHash, forcePasswordChange, passwordChangedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: membership.userId } });
      await tx.emailChangeRequest.updateMany({
        where: { userId: membership.userId, activeUserId: membership.userId, verifiedAt: null, cancelledAt: null },
        data: { cancelledAt: new Date(), activeUserId: null, activeNewEmail: null },
      });
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'member.password.reset',
          targetType: 'User',
          targetId: membership.userId,
          metadata: { membershipId: membership.id, forcePasswordChange },
        },
      });
    });
    realtimeSessionRegistry.revokeUser(membership.userId);
    return { ok: true, forcePasswordChange };
  }

  async resetMemberTwoFactor(communityId: string, memberId: string, actorUserId: string, input: Record<string, unknown>) {
    const membership = await this.prisma.membership.findFirst({ where: { id: memberId, communityId }, include: { role: true, user: true } });
    if (!membership) throw new NotFoundException('Member not found.');
    if (membership.userId === actorUserId) throw new BadRequestException('Use your own account recovery-code controls for self-service 2FA recovery.');
    await this.assertCanModifyMembership(communityId, actorUserId, membership, 'USER_2FA_RESET');
    const reason = stringValue(input.reason);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: membership.userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorConfirmedAt: null },
      });
      await tx.userTwoFactorBackupCode.deleteMany({ where: { userId: membership.userId } });
      await tx.session.deleteMany({ where: { userId: membership.userId } });
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'USER_2FA_RESET',
          targetType: 'User',
          targetId: membership.userId,
          metadata: { membershipId: membership.id, targetRole: membership.role.key, reason: reason ?? null, sessionsInvalidated: true },
        },
      });
    });
    realtimeSessionRegistry.revokeUser(membership.userId);
    return this.member(communityId, memberId);
  }

  async updateMember(communityId: string, memberId: string, actorUserId: string, input: Record<string, unknown>) {
    const member = await this.prisma.membership.findFirst({ where: { id: memberId, communityId }, include: { user: true, role: true } });
    if (!member) throw new NotFoundException('Member not found.');
    await this.assertCanModifyMembership(communityId, actorUserId, member, 'member.profile.updated');
    const name = stringValue(input.name);
    await this.prisma.$transaction(async (tx) => {
      if (name) {
        await tx.user.update({ where: { id: member.userId }, data: { name } });
      }
      await tx.memberProfile.upsert({
        where: { membershipId: member.id },
        update: profileData(input),
        create: { membershipId: member.id, ...profileData(input) },
      });
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'member.profile.updated',
          targetType: 'Membership',
          targetId: member.id,
          metadata: { memberUserId: member.userId },
        },
      });
    });
    return this.member(communityId, memberId);
  }

  async suspendMember(communityId: string, memberId: string, actorUserId: string, statusInput?: unknown) {
    const nextStatus = statusInput === undefined ? 'SUSPENDED' : statusInput;
    if (nextStatus !== 'ACTIVE' && nextStatus !== 'SUSPENDED') throw new BadRequestException('Invalid member status transition.');
    const member = await this.prisma.membership.findFirst({ where: { id: memberId, communityId }, include: { role: true, user: { select: { name: true } } } });
    if (!member) throw new NotFoundException('Member not found.');
    if (member.userId === actorUserId) throw new BadRequestException('You cannot change your own membership status.');
    if (nextStatus === 'SUSPENDED' && member.status !== 'ACTIVE') throw new BadRequestException('Only active members can be suspended.');
    if (nextStatus === 'ACTIVE' && member.status !== 'SUSPENDED') throw new BadRequestException('Only suspended members can be reactivated.');
    const action = nextStatus === 'ACTIVE' ? 'member.reactivated' : 'member.suspended';
    await this.assertCanModifyMembership(communityId, actorUserId, member, action, { removesActiveOwner: nextStatus === 'SUSPENDED' });
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: member.id }, data: { status: nextStatus } });
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action,
          targetType: 'Membership',
          targetId: member.id,
          metadata: {
            memberUserId: member.userId,
            targetMemberName: member.user.name,
            changes: { status: { from: member.status, to: nextStatus } },
            audit: { category: 'MEMBERS', outcome: 'SUCCESS', severity: 'INFO', actorType: 'USER', targetLabel: member.user.name },
          },
        },
      });
    });
    if (nextStatus === 'SUSPENDED') realtimeSessionRegistry.revokeUser(member.userId);
    return this.member(communityId, memberId);
  }

  async removeMember(communityId: string, memberId: string, actorUserId: string) {
    const member = await this.prisma.membership.findFirst({ where: { id: memberId, communityId }, include: { role: true } });
    if (!member) throw new NotFoundException('Member not found.');
    if (member.userId === actorUserId) throw new BadRequestException('You cannot remove your own membership.');
    await this.assertCanModifyMembership(communityId, actorUserId, member, 'member.removed', { removesActiveOwner: true });
    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'member.removed',
          targetType: 'Membership',
          targetId: member.id,
          metadata: { memberUserId: member.userId },
        },
      });
      await tx.memberProfile.deleteMany({ where: { membershipId: member.id } });
      await tx.membership.delete({ where: { id: member.id } });
    });
    realtimeSessionRegistry.revokeUser(member.userId);
    return { removed: true, id: member.id };
  }

  async changeRole(communityId: string, memberId: string, actorUserId: string, roleKey?: string) {
    if (!roleKey) throw new BadRequestException('Role is required.');
    const normalizedRoleKey = normalizeSystemRole(roleKey);
    if (normalizedRoleKey !== roleKey) throw new BadRequestException('Role is required.');
    const member = await this.prisma.membership.findFirst({ where: { id: memberId, communityId }, include: { role: true } });
    if (!member) throw new NotFoundException('Member not found.');
    await this.assertCanModifyMembership(communityId, actorUserId, member, 'member.role.changed', {
      newRoleKey: normalizedRoleKey,
      removesActiveOwner: member.role.key === 'owner' && normalizedRoleKey !== 'owner',
    });
    const role = await this.prisma.role.findUnique({ where: { communityId_key: { communityId, key: normalizedRoleKey } } });
    if (!role) throw new NotFoundException('Role not found.');
    const oldRole = member.role.key;
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: member.id }, data: { roleId: role.id } });
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: 'member.role.changed',
          targetType: 'Membership',
          targetId: member.id,
          metadata: { targetUserId: member.userId, oldRole, newRole: normalizedRoleKey },
        },
      });
      if (oldRole !== 'owner' && normalizedRoleKey === 'owner') {
        await tx.auditLog.create({
          data: { communityId, actorUserId, action: 'member.owner.promoted', targetType: 'Membership', targetId: member.id, metadata: { targetUserId: member.userId, oldRole, newRole: normalizedRoleKey } },
        });
      }
      if (oldRole === 'owner' && normalizedRoleKey !== 'owner') {
        await tx.auditLog.create({
          data: { communityId, actorUserId, action: 'member.owner.demoted', targetType: 'Membership', targetId: member.id, metadata: { targetUserId: member.userId, oldRole, newRole: normalizedRoleKey } },
        });
      }
    });
    realtimeSessionRegistry.revokeUser(member.userId);
    return this.member(communityId, memberId);
  }

  registrations(communityId: string) {
    return this.prisma.registrationApplication.findMany({
      where: { communityId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }).then((applications) => applications.map(publicRegistrationApplication));
  }

  async review(communityId: string, applicationId: string, actorUserId: string, status: 'APPROVED' | 'REJECTED', reason?: string) {
    const application = await this.prisma.registrationApplication.findFirst({ where: { id: applicationId, communityId } });
    if (!application) throw new NotFoundException('Registration application not found.');
    if (application.status === status) return publicRegistrationApplication(application);
    if (application.status !== 'PENDING') throw new BadRequestException('This registration application is no longer actionable.');
    if (status === 'APPROVED' && (!application.passwordHash || this.passwords.identifyFormat(application.passwordHash) === 'UNKNOWN')) {
      throw new BadRequestException('This registration cannot be approved because a secure password is not available. Ask the applicant to submit a new registration.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.registrationApplication.updateMany({
        where: { id: application.id, communityId, status: 'PENDING' },
        data: { status, reviewedAt: new Date(), reviewedBy: actorUserId, passwordHash: null },
      });
      if (claimed.count === 0) {
        const current = await tx.registrationApplication.findUniqueOrThrow({ where: { id: application.id } });
        if (current.status === status) return { application: current, approvedUser: null };
        throw new BadRequestException('This registration application is no longer actionable.');
      }
      const updated = await tx.registrationApplication.findUniqueOrThrow({
        where: { id: application.id },
      });
      let approvedUser: { id: string; email: string; name: string; emailVerifiedAt: Date | null } | null = null;
      if (status === 'APPROVED') {
        const role = await tx.role.findUniqueOrThrow({ where: { communityId_key: { communityId, key: 'member' } } });
        const passwordHash = application.passwordHash!;
        const existingUser = await tx.user.findFirst({
          where: { email: { equals: application.normalizedEmail, mode: 'insensitive' } },
          select: { id: true },
        });
        const user = existingUser
          ? await tx.user.update({ where: { id: existingUser.id }, data: { name: application.name } })
          : await tx.user.create({ data: { email: application.normalizedEmail, name: application.name, passwordHash } });
        approvedUser = { id: user.id, email: user.email, name: user.name, emailVerifiedAt: user.emailVerifiedAt };
        const membership = await tx.membership.upsert({
          where: { userId_communityId: { userId: user.id, communityId } },
          update: { status: 'ACTIVE', roleId: role.id },
          create: { userId: user.id, communityId, roleId: role.id, status: 'ACTIVE' },
        });
        const avatarProfile = defaultDicebearProfile(user.id, application.sex);
        const existingProfile = await tx.memberProfile.findUnique({ where: { membershipId: membership.id } });
        await tx.memberProfile.upsert({
          where: { membershipId: membership.id },
          update: {
            sex: avatarProfile.sex,
            dicebearStyle: existingProfile?.dicebearStyle ?? avatarProfile.dicebearStyle,
            dicebearSeed: existingProfile?.dicebearSeed ?? avatarProfile.dicebearSeed,
          },
          create: { membershipId: membership.id, ...avatarProfile },
        });
        await tx.registrationApplication.updateMany({
          where: {
            communityId,
            normalizedEmail: application.normalizedEmail,
            status: 'PENDING',
            id: { not: application.id },
          },
          data: { status: 'SUPERSEDED', passwordHash: null },
        });
      }
      await tx.auditLog.create({
        data: {
          communityId,
          actorUserId,
          action: status === 'APPROVED' ? 'registration.approved' : 'registration.rejected',
          targetType: 'RegistrationApplication',
          targetId: application.id,
          metadata: {
            emailReference: createHash('sha256').update(application.normalizedEmail).digest('hex'),
            reason,
          },
        },
      });
      return { application: updated, approvedUser };
    });
    if (result.approvedUser) {
      try {
        await this.emailChanges.queueRegistrationApproval(communityId, result.approvedUser);
      } catch {
        await this.prisma.auditLog.create({
          data: {
            communityId,
            actorUserId,
            action: 'registration.approval_email_failed',
            targetType: 'RegistrationApplication',
            targetId: application.id,
            metadata: {},
          },
        }).catch(() => undefined);
      }
    }
    return publicRegistrationApplication(result.application);
  }

  private async notifyEventCreated(communityId: string, eventId: string, title: string, startsAt: Date) {
    await this.createMemberNotifications(communityId, {
      type: 'EVENT_CREATED',
      title: 'New event',
      body: title,
      targetId: eventId,
      metadata: { eventId, startsAt: startsAt.toISOString() },
    });
  }

  private async notifyAnnouncementPublished(communityId: string, announcementId: string, title: string, body: string) {
    await this.createMemberNotifications(communityId, {
      type: 'ANNOUNCEMENT_PUBLISHED',
      title: 'New announcement',
      body: title || body,
      targetId: announcementId,
      metadata: { announcementId },
    });
  }

  private async createMemberNotifications(communityId: string, input: { type: string; title: string; body: string; targetId: string; metadata: Record<string, unknown> }) {
    const memberships = await this.prisma.membership.findMany({
      where: { communityId, status: 'ACTIVE' },
      select: { userId: true },
    });
    if (!memberships.length) return;
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { communityId, userId: { in: memberships.map((membership) => membership.userId) } },
    });
    const preferencesByUser = new Map(preferences.map((preference) => [preference.userId, preference]));
    const eligibleMemberships = memberships.filter((membership) => {
      const preference = preferencesByUser.get(membership.userId);
      if (input.type === 'ANNOUNCEMENT_PUBLISHED') return preference?.announcementNotifications ?? true;
      if (input.type === 'EVENT_CREATED') return preference?.eventNotifications ?? true;
      if (input.type.startsWith('BIRTHDAY_') || input.type.startsWith('ANNIVERSARY_')) return preference?.birthdayReminderNotifications ?? true;
      return true;
    });
    if (!eligibleMemberships.length) return;
    await this.prisma.notification.createMany({
      data: eligibleMemberships.map((membership) => ({
        communityId,
        userId: membership.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata as Prisma.InputJsonObject,
        dedupeKey: `${input.type}:${input.targetId}:${membership.userId}`,
      })),
      skipDuplicates: true,
    });
  }

  private async createNotificationsForUsers(communityId: string, userIds: string[], input: { type: string; title: string; body: string; targetId: string; metadata: Record<string, unknown> }) {
    const uniqueUserIds = Array.from(new Set(userIds));
    if (!uniqueUserIds.length) return 0;
    const memberships = await this.prisma.membership.findMany({ where: { communityId, status: 'ACTIVE', userId: { in: uniqueUserIds } }, select: { userId: true } });
    const preferences = await this.prisma.notificationPreference.findMany({ where: { communityId, userId: { in: memberships.map((membership) => membership.userId) } } });
    const preferencesByUser = new Map(preferences.map((preference) => [preference.userId, preference]));
    const eligibleUserIds = memberships.map((membership) => membership.userId).filter((userId) => {
      const preference = preferencesByUser.get(userId);
      if (input.type.startsWith('PASSPORT_')) return preference?.passportExpirationRemindersEnabled ?? true;
      return preference?.birthdayReminderNotifications ?? true;
    });
    if (!eligibleUserIds.length) return 0;
    const result = await this.prisma.notification.createMany({
      data: eligibleUserIds.map((userId) => ({
        communityId,
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata as Prisma.InputJsonObject,
        dedupeKey: `${input.type}:${input.targetId}:${userId}`,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  private async assertCanModifyMembership(
    communityId: string,
    actorUserId: string,
    target: { id: string; userId: string; status?: string; role: { key: string } },
    action: string,
    options: { newRoleKey?: SystemRole; removesActiveOwner?: boolean } = {},
  ) {
    const actor = await this.prisma.membership.findFirst({ where: { communityId, userId: actorUserId }, include: { role: true } });
    if (!actor) throw new ForbiddenException('Admin access required.');
    const actorRole = normalizeSystemRole(actor.role.key);
    const targetRole = normalizeSystemRole(target.role.key);
    const nextRole = options.newRoleKey;

    if (targetRole === 'owner' && actorRole !== 'owner') {
      await this.auditProtectionBlocked(communityId, actorUserId, target, action, 'protected_owner');
      throw new ForbiddenException('Cannot modify protected owner.');
    }
    if (targetRole === 'admin' && actorRole !== 'owner') {
      await this.auditProtectionBlocked(communityId, actorUserId, target, action, 'admin_hierarchy');
      throw new ForbiddenException('Insufficient permission.');
    }
    if (nextRole === 'owner' && actorRole !== 'owner') {
      await this.auditProtectionBlocked(communityId, actorUserId, target, action, 'owner_promotion');
      throw new ForbiddenException('Insufficient permission.');
    }
    if (nextRole && targetRole !== 'member' && actorRole !== 'owner') {
      await this.auditProtectionBlocked(communityId, actorUserId, target, action, 'role_hierarchy');
      throw new ForbiddenException('Insufficient permission.');
    }
    if (targetRole === 'owner' && (options.removesActiveOwner || (nextRole && nextRole !== 'owner')) && await this.isLastActiveOwner(communityId, target.id)) {
      await this.auditProtectionBlocked(communityId, actorUserId, target, action, 'last_owner');
      throw new ForbiddenException('Cannot remove the last active owner.');
    }
  }

  private async isLastActiveOwner(communityId: string, membershipId: string) {
    const activeOwners = await this.prisma.membership.findMany({
      where: { communityId, status: 'ACTIVE', role: { key: 'owner' } },
      select: { id: true },
    });
    return activeOwners.length === 1 && activeOwners[0]?.id === membershipId;
  }

  private async auditProtectionBlocked(communityId: string, actorUserId: string, target: { id: string; userId: string; role: { key: string } }, action: string, reason: string) {
    await this.prisma.auditLog.create({
      data: {
        communityId,
        actorUserId,
        action: 'roles.protection.blocked',
        targetType: 'Membership',
        targetId: target.id,
        metadata: { attemptedAction: action, targetUserId: target.userId, targetRole: target.role.key, reason },
      },
    }).catch(() => undefined);
  }
}

function publicRegistrationApplication<T extends { passwordHash?: string | null }>(application: T) {
  const { passwordHash, ...safeApplication } = application;
  void passwordHash;
  return safeApplication;
}

type EventWithRsvps = {
  rsvps: { status: string }[];
  [key: string]: unknown;
};

function adminEventShape<T extends EventWithRsvps>(event: T) {
  return {
    ...event,
    rsvpCounts: {
      going: event.rsvps.filter((rsvp) => rsvp.status === 'GOING').length,
      maybe: event.rsvps.filter((rsvp) => rsvp.status === 'MAYBE').length,
      declined: event.rsvps.filter((rsvp) => rsvp.status === 'DECLINED').length,
    },
  };
}

function eventTaskShape(task: EventTaskWithAssignee) {
  const assignees = task.assignees.map((assignment) => ({ id: assignment.user.id, name: assignment.user.name, email: assignment.user.email }));
  return {
    id: task.id,
    eventId: task.eventId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    label: task.label,
    dueDate: task.dueDate,
    assigneeId: assignees[0]?.id ?? null,
    sortOrder: task.sortOrder,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    assignee: assignees[0] ?? null,
    assignees,
    checklistProgress: {
      completed: task.checklistItems.filter((item) => item.isCompleted).length,
      total: task.checklistItems.length,
    },
  };
}

function taskBoardShape(board: any) {
  const now = new Date();
  const tasks = Array.isArray(board.tasks) ? board.tasks : [];
  const todo = tasks.filter((task: any) => task.status === EventTaskStatus.TODO).length;
  const inProgress = tasks.filter((task: any) => task.status === EventTaskStatus.IN_PROGRESS).length;
  const done = tasks.filter((task: any) => task.status === EventTaskStatus.DONE).length;
  const overdue = tasks.filter((task: any) => task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate < now).length;
  const checklistTotal = tasks.reduce((sum: number, task: any) => sum + (task.checklistItems?.length ?? 0), 0);
  const checklistCompleted = tasks.reduce((sum: number, task: any) => sum + (task.checklistItems?.filter((item: any) => item.isCompleted).length ?? 0), 0);
  const assignees = new Map<string, any>();
  tasks.forEach((task: any) => {
    (task.assignees ?? []).forEach((assignment: any) => {
      const user = assignment.user;
      const profile = user?.memberships?.[0]?.profile;
      if (user) assignees.set(user.id, { id: user.id, name: user.name, avatarUrl: profile?.avatarUrl ?? null, dicebearStyle: profile?.dicebearStyle ?? null, dicebearSeed: profile?.dicebearSeed ?? null });
    });
  });
  const dueDates = tasks.filter((task: any) => task.status !== EventTaskStatus.DONE && task.dueDate).map((task: any) => task.dueDate as Date).sort((left: Date, right: Date) => left.getTime() - right.getTime());
  return {
    id: board.id,
    name: board.event?.title ?? board.name,
    description: board.description ?? null,
    visibility: board.visibility,
    status: board.status,
    linkedEvent: board.event ? { id: board.event.id, title: board.event.title, startsAt: board.event.startsAt } : null,
    eventEnded: Boolean(board.event?.startsAt && board.event.startsAt.getTime() <= now.getTime()),
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    taskCounts: { total: tasks.length, todo, inProgress, done, overdue },
    checklistProgress: { completed: checklistCompleted, total: checklistTotal },
    assignees: Array.from(assignees.values()),
    nextDueDate: dueDates[0] ?? null,
  };
}

function taskBoardProgress(board: { taskCounts: { total: number; done: number } }) {
  return board.taskCounts.total ? board.taskCounts.done / board.taskCounts.total : 0;
}

function nullableTime(value: Date | string | null) {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function taskBoardVisibility(value: unknown): 'PRIVATE' | 'PUBLIC' {
  if (value === undefined || value === null || value === '') return 'PRIVATE';
  if (value !== 'PRIVATE' && value !== 'PUBLIC') throw new BadRequestException('Task board visibility is invalid.');
  return value;
}

function taskBoardName(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new BadRequestException('Task board name is invalid.');
  const name = value.trim();
  if (name.length > 200) throw new BadRequestException('Task board name must be 200 characters or fewer.');
  return name;
}

function automationPresetMetadata(input: Record<string, unknown>, required: boolean) {
  const rawName = input.name;
  let name: string | undefined;
  if (rawName !== undefined || required) {
    if (typeof rawName !== 'string' || !rawName.trim()) throw new BadRequestException('Automation preset name is required.');
    name = rawName.trim();
    if (name.length > 120) throw new BadRequestException('Automation preset name must be 120 characters or fewer.');
  }
  const description = nullableEventTaskString(input.description, 'Automation preset description', 500);
  return { name, description };
}

function automationPresetRuleData(value: unknown, position: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Automation preset rule is invalid.');
  const normalized = taskBoardAutomationRuleData(value as Record<string, unknown>, true, true);
  return {
    position,
    type: normalized.type!,
    name: normalized.name,
    enabled: normalized.enabled ?? true,
    config: automationRuleBehaviorConfig(normalized.config) as Prisma.InputJsonObject,
  };
}

type AutomationValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';
type AutomationValidationItem = { code: string; severity: AutomationValidationSeverity; field?: string };
type AutomationValidationResult = { valid: boolean; items: AutomationValidationItem[] };
const notificationAutomationTemplateKeys = [
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_DUE_BEFORE,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_STALE_TASK_FOLLOW_UP,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_CHECKLIST_INCOMPLETE_BEFORE_DUE,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE_ESCALATION,
] as const;
type AutomationValidationContext = {
  rules: Array<{ id: string; type: TaskBoardAutomationRuleType; config: Prisma.JsonValue; draftName?: string | null; draftEnabled?: boolean | null; draftConfig?: Prisma.JsonValue | null; draftUpdatedAt?: Date | null; draftUpdatedById?: string | null; archivedById?: string | null; archiveReason?: string | null; createdFromPreset?: { id: string; name: string } | null }>;
  emailAvailable: boolean;
  templates: Map<NotificationTemplateKey, boolean>;
  tasks: Array<{
    id: string;
    title: string;
    status: EventTaskStatus;
    dueDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
    lastActivityAt: Date;
    assignees: Array<{ id: string }>;
    checklistItems: Array<{ isCompleted: boolean; updatedAt: Date }>;
  }>;
  eligibleAdminCount: number;
  now: Date;
};

type AutomationPresetForPreview = {
  id: string;
  name: string;
  rules: Array<{
    id: string;
    type: TaskBoardAutomationRuleType;
    name: string | null;
    enabled: boolean;
    config: Prisma.JsonValue;
  }>;
};

type AutomationRuleDraftSource = {
  id: string;
  type: TaskBoardAutomationRuleType;
  name: string | null;
  enabled: boolean;
  config: Prisma.JsonValue;
  currentVersion: number;
  draftName: string | null;
  draftEnabled: boolean | null;
  draftConfig: Prisma.JsonValue | null;
  draftUpdatedAt: Date | null;
  archivedAt: Date | null;
  archivedBy: { id: string; name: string } | null;
  archiveReason: string | null;
  createdFromPreset: { id: string; name: string } | null;
};

function automationRuleDraftResponse(rule: AutomationRuleDraftSource, context: AutomationValidationContext, updatedBy: { id: string; name: string; avatarUrl: string | null } | null) {
  const liveConfig = automationRuleBehaviorConfig(automationRuleConfigWithDefaults(rule.type, rule.config));
  const lifecycle = { archivedAt: rule.archivedAt, archivedBy: rule.archivedBy, archiveReason: rule.archiveReason, createdFromPreset: rule.createdFromPreset };
  if (!rule.draftUpdatedAt || !rule.draftConfig || rule.draftEnabled === null) {
    return { hasDraft: false, staleDraft: false, draft: null, live: { name: rule.name, enabled: rule.enabled, config: liveConfig, currentVersion: rule.currentVersion }, lifecycle, diff: [], validation: automationValidationResult([]) };
  }
  const draftConfig = automationRuleBehaviorConfig(automationRuleConfigWithDefaults(rule.type, rule.draftConfig));
  const validation = validateAutomationRule(rule.type, draftConfig, rule.id, context);
  return {
    hasDraft: true,
    staleDraft: isStaleAutomationDraft(rule.draftUpdatedAt),
    draft: { name: rule.draftName, enabled: rule.draftEnabled, config: draftConfig, updatedAt: rule.draftUpdatedAt, updatedBy },
    live: { name: rule.name, enabled: rule.enabled, config: liveConfig, currentVersion: rule.currentVersion },
    lifecycle,
    diff: automationRuleDraftDiff(rule.type, { name: rule.name, enabled: rule.enabled, config: liveConfig }, { name: rule.draftName, enabled: rule.draftEnabled, config: draftConfig }),
    validation: { ...validation, items: validation.items.map((item) => ({ ...item, message: item.code })) },
  };
}

function isStaleAutomationDraft(updatedAt: Date | null | undefined) {
  return Boolean(updatedAt && Date.now() - updatedAt.getTime() > 14 * 24 * 60 * 60 * 1_000);
}

function automationRuleDraftDiff(type: TaskBoardAutomationRuleType, live: { name: string | null; enabled: boolean; config: Record<string, unknown> }, draft: { name: string | null; enabled: boolean; config: Record<string, unknown> }) {
  const rows: Array<{ field: string; label: string; liveValue: string; draftValue: string }> = [];
  const add = (field: string, liveValue: string, draftValue: string) => { if (liveValue !== draftValue) rows.push({ field, label: field, liveValue, draftValue }); };
  add('name', live.name ?? '', draft.name ?? '');
  add('enabled', live.enabled ? 'ENABLED' : 'DISABLED', draft.enabled ? 'ENABLED' : 'DISABLED');
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) add('hoursBeforeDue', String(Number(live.config.hoursBeforeDue ?? 24)), String(Number(draft.config.hoursBeforeDue ?? 24)));
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) add('inactiveDays', String(Number(live.config.inactiveDays ?? 3)), String(Number(draft.config.inactiveDays ?? 3)));
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) {
    add('hoursBeforeDue', String(Number(live.config.hoursBeforeDue ?? 24)), String(Number(draft.config.hoursBeforeDue ?? 24)));
    add('requireChecklist', live.config.requireChecklistItems === false ? 'NO' : 'YES', draft.config.requireChecklistItems === false ? 'NO' : 'YES');
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) add('graceDays', String(Number(live.config.graceDays ?? 2)), String(Number(draft.config.graceDays ?? 2)));
  if (isNotificationAutomationRule(type)) {
    add('recipients', automationDraftRecipientValue(live.config), automationDraftRecipientValue(draft.config));
    add('delivery', automationDraftDeliveryValue(live.config), automationDraftDeliveryValue(draft.config));
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE || type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) add('repeatDaily', live.config.repeatDaily === true ? 'DAILY' : 'ONCE', draft.config.repeatDaily === true ? 'DAILY' : 'ONCE');
  if (type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) add('requireChecklist', live.config.requireAtLeastOneChecklistItem === false ? 'NO' : 'YES', draft.config.requireAtLeastOneChecklistItem === false ? 'NO' : 'YES');
  if (type === TaskBoardAutomationRuleType.FLAG_UNASSIGNED) add('includeInOverview', live.config.includeInOverview === false ? 'NO' : 'YES', draft.config.includeInOverview === false ? 'NO' : 'YES');
  return rows;
}

function automationDraftRecipientValue(config: Record<string, unknown>) {
  return [config.notifyAssignees === true ? 'ASSIGNEES' : '', config.notifyAdmins === true ? 'ADMINS' : ''].filter(Boolean).join('+') || 'NONE';
}

function automationDraftDeliveryValue(config: Record<string, unknown>) {
  const delivery = normalizeAutomationDeliveryConfig(config.delivery);
  return [delivery.channels.inApp ? 'IN_APP' : '', delivery.channels.email ? 'EMAIL' : ''].filter(Boolean).join('+') || 'NONE';
}

function automationPresetPreview(preset: AutomationPresetForPreview, context: AutomationValidationContext) {
  const actions = preset.rules.map((presetRule) => {
    const config = automationRuleConfigWithDefaults(presetRule.type, presetRule.config);
    const duplicate = findExactAutomationRule(context.rules, presetRule.type, config);
    const validation = validateAutomationRule(presetRule.type, config, undefined, context);
    const items = [...validation.items];
    const similar = !duplicate && context.rules.some((rule) => rule.type === presetRule.type);
    if (similar && !items.some((item) => item.code === 'SIMILAR_RULE_EXISTS')) {
      items.push({ code: 'SIMILAR_RULE_EXISTS', severity: 'WARNING' });
    }
    const hasError = !duplicate && items.some((item) => item.severity === 'ERROR');
    return {
      presetRuleId: presetRule.id,
      type: presetRule.type,
      title: presetRule.name ?? taskBoardAutomationRuleName(presetRule.type),
      action: duplicate ? 'SKIP_DUPLICATE' as const : hasError || similar ? 'WARNING' as const : 'CREATE' as const,
      validation: items.map((item) => ({ ...item, message: item.code })),
      duplicateOfRuleId: duplicate?.id ?? null,
      enabled: presetRule.enabled,
      config,
    };
  });
  return {
    preset: { id: preset.id, name: preset.name, ruleCount: preset.rules.length },
    actions,
    summary: {
      willCreate: actions.filter((action) => action.action !== 'SKIP_DUPLICATE' && !action.validation.some((item) => item.severity === 'ERROR')).length,
      willSkipDuplicates: actions.filter((action) => action.action === 'SKIP_DUPLICATE').length,
      warnings: actions.reduce((count, action) => count + action.validation.filter((item) => item.severity === 'WARNING').length, 0),
      errors: actions.filter((action) => action.action !== 'SKIP_DUPLICATE' && action.validation.some((item) => item.severity === 'ERROR')).length,
    },
  };
}

function findExactAutomationRule(rules: AutomationValidationContext['rules'], type: TaskBoardAutomationRuleType, config: Record<string, unknown>) {
  return rules.find((rule) => rule.type === type && exactAutomationRuleMatch(type, rule.config, config));
}

function exactAutomationRuleMatch(type: TaskBoardAutomationRuleType, leftValue: unknown, rightValue: unknown) {
  const left = automationRuleConfigWithDefaults(type, leftValue);
  const right = automationRuleConfigWithDefaults(type, rightValue);
  if (type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) {
    return (left.requireAtLeastOneChecklistItem !== false) === (right.requireAtLeastOneChecklistItem !== false);
  }
  if (type === TaskBoardAutomationRuleType.FLAG_UNASSIGNED) {
    return (left.includeInOverview !== false) === (right.includeInOverview !== false);
  }
  const leftDelivery = normalizeAutomationDeliveryConfig(left.delivery);
  const rightDelivery = normalizeAutomationDeliveryConfig(right.delivery);
  const sameNotificationSettings = (left.notifyAssignees === true) === (right.notifyAssignees === true)
    && (left.notifyAdmins === true) === (right.notifyAdmins === true)
    && leftDelivery.channels.inApp === rightDelivery.channels.inApp
    && leftDelivery.channels.email === rightDelivery.channels.email
    && leftDelivery.includeDeepLink === rightDelivery.includeDeepLink
    && leftDelivery.dedupeEnabled === rightDelivery.dedupeEnabled;
  if (!sameNotificationSettings) return false;
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) return Number(left.hoursBeforeDue) === Number(right.hoursBeforeDue);
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) return Number(left.inactiveDays) === Number(right.inactiveDays);
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) return Number(left.hoursBeforeDue) === Number(right.hoursBeforeDue)
    && (left.requireChecklistItems !== false) === (right.requireChecklistItems !== false);
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) return Number(left.graceDays) === Number(right.graceDays)
    && (left.repeatDaily === true) === (right.repeatDaily === true);
  return (left.repeatDaily === true) === (right.repeatDaily === true);
}

function notificationTemplateKeyForRule(type: TaskBoardAutomationRuleType) {
  if (type === TaskBoardAutomationRuleType.OVERDUE) return NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE;
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) return NotificationTemplateKey.TASK_BOARD_AUTOMATION_STALE_TASK_FOLLOW_UP;
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) return NotificationTemplateKey.TASK_BOARD_AUTOMATION_CHECKLIST_INCOMPLETE_BEFORE_DUE;
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) return NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE_ESCALATION;
  return NotificationTemplateKey.TASK_BOARD_AUTOMATION_DUE_BEFORE;
}

function automationTaskLastActivityAt(task: { createdAt: Date; updatedAt: Date; activities?: Array<{ createdAt: Date }>; comments?: Array<{ updatedAt: Date }>; attachments?: Array<{ updatedAt: Date }>; checklistItems?: Array<{ updatedAt: Date }> }) {
  return [task.createdAt, task.updatedAt, ...(task.activities ?? []).map((item) => item.createdAt), ...(task.comments ?? []).map((item) => item.updatedAt), ...(task.attachments ?? []).map((item) => item.updatedAt), ...(task.checklistItems ?? []).map((item) => item.updatedAt)]
    .reduce((latest, value) => value > latest ? value : latest, task.createdAt);
}

function safeCalendarTimezone(value: string | null | undefined) {
  const timezone = value?.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return 'UTC';
  }
}

function calendarDateKeyInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function operationsCalendarMonth(value: unknown, timezone: string) {
  if (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return calendarDateKeyInTimezone(new Date(), timezone).slice(0, 7);
}

function operationsCalendarSources(value: unknown) {
  const requested = typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter((item): item is OperationsCalendarSourceFilter => OPERATIONS_CALENDAR_SOURCES.includes(item as OperationsCalendarSourceFilter)) : [];
  return new Set<OperationsCalendarSourceFilter>(requested.length ? requested : OPERATIONS_CALENDAR_SOURCES);
}

function operationsCalendarEntryFilter(source: OperationsCalendarEntrySource): OperationsCalendarSourceFilter {
  if (source === 'EVENT') return 'events';
  if (source === 'BIRTHDAY') return 'birthdays';
  if (source === 'MEMBERSHIP_ANNIVERSARY') return 'anniversaries';
  if (source === 'DOCUMENT_EXPIRATION') return 'expirations';
  if (source === 'TASK_DEADLINE') return 'taskDeadlines';
  return 'automation';
}

function operationsCalendarEntry(entry: Omit<OperationsCalendarEntry, 'colorKey' | 'description' | 'memberId' | 'eventId' | 'taskBoardId' | 'taskId' | 'automationRuleId'> & Partial<Pick<OperationsCalendarEntry, 'description' | 'memberId' | 'eventId' | 'taskBoardId' | 'taskId' | 'automationRuleId'>>): OperationsCalendarEntry {
  const colorKey = entry.source === 'EVENT' ? 'emerald' : entry.source === 'BIRTHDAY' ? 'amber' : entry.source === 'MEMBERSHIP_ANNIVERSARY' ? 'violet' : entry.source === 'DOCUMENT_EXPIRATION' ? 'red' : entry.source === 'TASK_DEADLINE' ? 'cyan' : 'blue';
  return { description: null, memberId: null, eventId: null, taskBoardId: null, taskId: null, automationRuleId: null, ...entry, colorKey };
}

function calendarAnnualOccurrence(value: Date, year: number) {
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay), 12));
}

function operationsCalendarSeverity(value: Date, now: Date): 'INFO' | 'WARNING' | 'CRITICAL' {
  const days = Math.ceil((value.getTime() - now.getTime()) / 86_400_000);
  if (days < 0 || days <= 7) return 'CRITICAL';
  if (days <= 30) return 'WARNING';
  return 'INFO';
}

function operationsCalendarTaskSeverity(dueDate: Date, status: EventTaskStatus, now: Date): 'INFO' | 'WARNING' | 'CRITICAL' {
  if (status === EventTaskStatus.DONE) return 'INFO';
  const remainingMs = dueDate.getTime() - now.getTime();
  if (remainingMs < 0) return 'CRITICAL';
  if (remainingMs <= 48 * 3_600_000) return 'WARNING';
  return 'INFO';
}

function operationsCalendarAutomationDelivery(config: Record<string, unknown>) {
  if (config.notifyAssignees !== true && config.notifyAdmins !== true) return null;
  const delivery = normalizeAutomationDeliveryConfig(config.delivery);
  if (!delivery.channels.inApp && !delivery.channels.email) return null;
  if (delivery.channels.inApp && delivery.channels.email) return 'IN_APP_EMAIL';
  return delivery.channels.email ? 'EMAIL' : 'IN_APP';
}

function operationsCalendarAutomationWindow(type: TaskBoardAutomationRuleType, config: Record<string, unknown>) {
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE || type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) return `HOURS_BEFORE:${Number(config.hoursBeforeDue)}`;
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) return `DAYS_AFTER:${Number(config.graceDays)}`;
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) return `DAYS_INACTIVE:${Number(config.inactiveDays)}`;
  return 'AT_DUE_DATE';
}

function operationsCalendarAutomationSeverity(type: TaskBoardAutomationRuleType, task: AutomationValidationContext['tasks'][number], eligibleAt: Date, now: Date): 'INFO' | 'WARNING' | 'CRITICAL' {
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) return eligibleAt <= now && Boolean(task.dueDate && task.dueDate < now) ? 'CRITICAL' : 'WARNING';
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE && task.dueDate && task.dueDate.getTime() - now.getTime() <= 24 * 3_600_000) return 'WARNING';
  return 'INFO';
}

function automationRuleEligibleAt(type: TaskBoardAutomationRuleType, config: Record<string, unknown>, task: AutomationValidationContext['tasks'][number]) {
  if (task.status === EventTaskStatus.DONE) return null;
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) {
    const hours = Number(config.hoursBeforeDue);
    return task.dueDate && Number.isInteger(hours) && hours >= 1 && hours <= 720 ? new Date(task.dueDate.getTime() - hours * 3_600_000) : null;
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE) return task.dueDate;
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) {
    const days = Number(config.inactiveDays);
    return task.assignees.length > 0 && Number.isInteger(days) && days >= 1 && days <= 30 ? new Date(task.lastActivityAt.getTime() + days * 86_400_000) : null;
  }
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) {
    const hours = Number(config.hoursBeforeDue);
    const hasChecklist = task.checklistItems.length > 0;
    const checklistEligible = config.requireChecklistItems === false || hasChecklist;
    const checklistIncomplete = hasChecklist ? task.checklistItems.some((item) => !item.isCompleted) : config.requireChecklistItems === false;
    return task.dueDate && checklistEligible && checklistIncomplete && Number.isInteger(hours) && hours >= 1 && hours <= 720 ? new Date(task.dueDate.getTime() - hours * 3_600_000) : null;
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) {
    const days = Number(config.graceDays);
    return task.dueDate && Number.isInteger(days) && days >= 1 && days <= 30 ? new Date(task.dueDate.getTime() + days * 86_400_000) : null;
  }
  return null;
}

function automationTaskMatchesRule(type: TaskBoardAutomationRuleType, config: Record<string, unknown>, task: AutomationValidationContext['tasks'][number], now: Date) {
  if (task.status === EventTaskStatus.DONE) return false;
  const nowMs = now.getTime();
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) {
    const hours = Number(config.hoursBeforeDue);
    return Boolean(task.dueDate && task.dueDate.getTime() >= nowMs && task.dueDate.getTime() - nowMs <= hours * 3_600_000);
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE) return Boolean(task.dueDate && task.dueDate.getTime() < nowMs);
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) return task.assignees.length > 0 && task.lastActivityAt.getTime() <= nowMs - Number(config.inactiveDays) * 86_400_000;
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) {
    const hasChecklist = task.checklistItems.length > 0;
    const checklistEligible = config.requireChecklistItems === false || hasChecklist;
    const checklistIncomplete = hasChecklist ? task.checklistItems.some((item) => !item.isCompleted) : config.requireChecklistItems === false;
    return Boolean(task.dueDate && checklistEligible && checklistIncomplete
      && task.dueDate.getTime() >= nowMs && task.dueDate.getTime() - nowMs <= Number(config.hoursBeforeDue) * 3_600_000);
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) return Boolean(task.dueDate && task.dueDate.getTime() <= nowMs - Number(config.graceDays) * 86_400_000);
  if (type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) return task.checklistItems.length > 0 && task.checklistItems.every((item) => item.isCompleted);
  return task.assignees.length === 0;
}

function automationNotificationKind(type: TaskBoardAutomationRuleType) {
  if (type === TaskBoardAutomationRuleType.OVERDUE) return 'EVENT_TASK_OVERDUE';
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) return 'EVENT_TASK_STALE_FOLLOW_UP';
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) return 'EVENT_TASK_CHECKLIST_INCOMPLETE';
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) return 'EVENT_TASK_OVERDUE_ESCALATION';
  return 'EVENT_TASK_DUE_SOON';
}

function automationNotificationDedupeWindow(type: TaskBoardAutomationRuleType, config: Record<string, unknown>, task: AutomationValidationContext['tasks'][number], now: Date) {
  if ((type === TaskBoardAutomationRuleType.OVERDUE || type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) && config.repeatDaily === true) return now.toISOString().slice(0, 10);
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) return `${task.lastActivityAt.toISOString()}:${Number(config.inactiveDays)}`;
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) return `${task.dueDate?.toISOString() ?? 'no-due'}:${Number(config.hoursBeforeDue)}:${task.checklistItems.filter((item) => item.isCompleted).length}:${task.checklistItems.length}`;
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) return `${task.dueDate?.toISOString() ?? 'no-due'}:${Number(config.graceDays)}`;
  return task.dueDate?.toISOString() ?? 'no-due';
}

function automationNotificationVariables(type: TaskBoardAutomationRuleType, config: Record<string, unknown>, task: AutomationValidationContext['tasks'][number], now: Date) {
  const done = task.checklistItems.filter((item) => item.isCompleted).length;
  return {
    inactiveDays: type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP ? String(Number(config.inactiveDays)) : '',
    lastActivityAt: task.lastActivityAt.toISOString(),
    hoursBeforeDue: type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE ? String(Number(config.hoursBeforeDue)) : '',
    checklistDoneCount: String(done),
    checklistTotalCount: String(task.checklistItems.length),
    graceDays: type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION ? String(Number(config.graceDays)) : '',
    daysOverdue: task.dueDate ? String(Math.max(0, Math.floor((now.getTime() - task.dueDate.getTime()) / 86_400_000))) : '0',
  };
}

function validateAutomationRule(type: TaskBoardAutomationRuleType, value: unknown, ruleId: string | undefined, context: AutomationValidationContext): AutomationValidationResult {
  const config = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const items: AutomationValidationItem[] = [];
  const notificationRule = isNotificationAutomationRule(type);
  const delivery = normalizeAutomationDeliveryConfig(config.delivery);
  const notifyAssignees = config.notifyAssignees === true;
  const notifyAdmins = config.notifyAdmins === true;

  if (notificationRule) {
    if (!notifyAssignees && !notifyAdmins) items.push({ code: 'NO_RECIPIENTS', severity: 'ERROR', field: 'recipients' });
    if (!delivery.channels.inApp && (!delivery.channels.email || !context.emailAvailable)) items.push({ code: 'NO_SUPPORTED_DELIVERY_CHANNEL', severity: 'ERROR', field: 'delivery' });
    if (delivery.channels.email && !context.emailAvailable) items.push({ code: 'EMAIL_SMTP_UNAVAILABLE', severity: 'ERROR', field: 'delivery.channels.email' });
    if (notifyAssignees && context.tasks.some((task) => task.assignees.length === 0)) items.push({ code: 'UNASSIGNED_TASK_RECIPIENTS', severity: 'INFO', field: 'recipients' });
    if (notifyAdmins && context.eligibleAdminCount === 0) items.push({ code: 'NO_ELIGIBLE_ADMINS', severity: 'WARNING', field: 'recipients' });

    const templateKey = notificationTemplateKeyForRule(type);
    const templateEnabled = context.templates.get(templateKey);
    if (templateEnabled === undefined) items.push({ code: 'DEFAULT_TEMPLATE_FALLBACK', severity: 'INFO', field: 'template' });
    else if (!templateEnabled) items.push({ code: 'TEMPLATE_UNAVAILABLE', severity: 'WARNING', field: 'template' });
  }

  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) {
    const hours = Number(config.hoursBeforeDue);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) items.push({ code: 'INVALID_DUE_WINDOW', severity: 'ERROR', field: 'hoursBeforeDue' });
    else {
      if (hours > 336) items.push({ code: 'LONG_DUE_WINDOW', severity: 'INFO', field: 'hoursBeforeDue' });
      const cutoff = context.now.getTime() + hours * 3_600_000;
      if (!context.tasks.some((task) => task.dueDate && task.dueDate.getTime() > context.now.getTime() && task.dueDate.getTime() <= cutoff)) {
        items.push({ code: 'NO_CURRENT_MATCHES', severity: 'INFO' });
      }
      const duplicate = context.rules.some((rule) => rule.id !== ruleId
        && rule.type === type
        && exactNotificationRuleMatch(rule.config, config, { hoursBeforeDue: hours }));
      if (duplicate) items.push({ code: 'DUPLICATE_DUE_BEFORE_RULE', severity: 'WARNING' });
    }
  } else if (type === TaskBoardAutomationRuleType.OVERDUE) {
    if (!context.tasks.some((task) => task.dueDate && task.dueDate.getTime() < context.now.getTime())) items.push({ code: 'NO_CURRENT_MATCHES', severity: 'INFO' });
    const duplicate = context.rules.some((rule) => rule.id !== ruleId
      && rule.type === type
      && exactNotificationRuleMatch(rule.config, config, { repeatDaily: config.repeatDaily === true }));
    if (duplicate) items.push({ code: 'DUPLICATE_OVERDUE_RULE', severity: 'WARNING' });
    if (config.repeatDaily === true) items.push({ code: 'OVERDUE_REPEATS_DAILY', severity: 'INFO' });
  } else if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) {
    const days = Number(config.inactiveDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) items.push({ code: 'INVALID_INACTIVE_DAYS', severity: 'ERROR', field: 'inactiveDays' });
    else {
      if (days > 14) items.push({ code: 'LONG_INACTIVE_WINDOW', severity: 'INFO', field: 'inactiveDays' });
      if (!context.tasks.some((task) => automationTaskMatchesRule(type, config, task, context.now))) items.push({ code: 'NO_CURRENT_MATCHES', severity: 'INFO' });
      if (context.rules.some((rule) => rule.id !== ruleId && rule.type === type && exactAutomationRuleMatch(type, rule.config, config))) items.push({ code: 'DUPLICATE_STALE_TASK_RULE', severity: 'WARNING' });
    }
  } else if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) {
    const hours = Number(config.hoursBeforeDue);
    if (!Number.isInteger(hours) || hours < 1 || hours > 720) items.push({ code: 'INVALID_DUE_WINDOW', severity: 'ERROR', field: 'hoursBeforeDue' });
    else {
      if (hours > 336) items.push({ code: 'LONG_DUE_WINDOW', severity: 'INFO', field: 'hoursBeforeDue' });
      if (!context.tasks.some((task) => automationTaskMatchesRule(type, config, task, context.now))) items.push({ code: 'NO_CURRENT_MATCHES', severity: 'INFO' });
      if (context.rules.some((rule) => rule.id !== ruleId && rule.type === type && exactAutomationRuleMatch(type, rule.config, config))) items.push({ code: 'DUPLICATE_CHECKLIST_DUE_RULE', severity: 'WARNING' });
    }
  } else if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) {
    const days = Number(config.graceDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) items.push({ code: 'INVALID_GRACE_DAYS', severity: 'ERROR', field: 'graceDays' });
    else {
      if (!context.tasks.some((task) => automationTaskMatchesRule(type, config, task, context.now))) items.push({ code: 'NO_CURRENT_MATCHES', severity: 'INFO' });
      if (context.rules.some((rule) => rule.id !== ruleId && rule.type === type && exactAutomationRuleMatch(type, rule.config, config))) items.push({ code: 'DUPLICATE_OVERDUE_ESCALATION_RULE', severity: 'WARNING' });
    }
    if (config.repeatDaily === true) items.push({ code: 'ESCALATION_REPEATS_DAILY', severity: 'WARNING', field: 'repeatDaily' });
  } else if (type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) {
    if (!context.tasks.some((task) => task.checklistItems.length > 0 && task.checklistItems.every((item) => item.isCompleted))) items.push({ code: 'NO_CURRENT_MATCHES', severity: 'INFO' });
  } else if (!context.tasks.some((task) => task.assignees.length === 0)) {
    items.push({ code: 'NO_CURRENT_MATCHES', severity: 'INFO' });
  }

  return automationValidationResult(items);
}

function automationRuleSchedule(type: TaskBoardAutomationRuleType, config: Record<string, unknown>, tasks: AutomationValidationContext['tasks'], now: Date) {
  const nowMs = now.getTime();
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) {
    const hours = Number(config.hoursBeforeDue);
    const windowMs = Number.isFinite(hours) ? hours * 3_600_000 : 0;
    const cutoff = nowMs + windowMs;
    const matches = tasks.filter((task) => task.dueDate && task.dueDate.getTime() >= nowMs && task.dueDate.getTime() <= cutoff);
    const upcoming = tasks.filter((task) => task.dueDate && task.dueDate.getTime() > cutoff);
    const nextEligibleAt = upcoming.reduce<Date | null>((earliest, task) => {
      const eligibleAt = automationRuleEligibleAt(type, config, task);
      if (!eligibleAt) return earliest;
      return !earliest || eligibleAt < earliest ? eligibleAt : earliest;
    }, null);
    return {
      matches,
      upcomingMatches: upcoming.length,
      nextEligibleAt,
      nextCheckCode: 'HOURLY_WORKER_CYCLE',
      taskReasonCode: 'DUE_WITHIN_WINDOW',
      reasons: matches.length
        ? [{ code: 'CURRENT_MATCHES', severity: 'INFO' as const, count: matches.length }]
        : [
            { code: 'NO_TASKS_IN_REMINDER_WINDOW', severity: 'INFO' as const, hours },
            ...(upcoming.length ? [{ code: 'TASKS_MAY_MATCH_LATER', severity: 'INFO' as const, count: upcoming.length }] : []),
          ],
    };
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE) {
    const matches = tasks.filter((task) => task.dueDate && task.dueDate.getTime() < nowMs);
    const upcoming = tasks.filter((task) => task.dueDate && task.dueDate.getTime() >= nowMs);
    const nextEligibleAt = upcoming.reduce<Date | null>((earliest, task) => {
      const eligibleAt = automationRuleEligibleAt(type, config, task);
      return eligibleAt && (!earliest || eligibleAt < earliest) ? eligibleAt : earliest;
    }, null);
    return {
      matches,
      upcomingMatches: upcoming.length,
      nextEligibleAt,
      nextCheckCode: 'HOURLY_WORKER_CYCLE',
      taskReasonCode: 'TASK_OVERDUE',
      reasons: [
        matches.length ? { code: 'CURRENT_MATCHES', severity: 'INFO' as const, count: matches.length } : { code: 'NO_OVERDUE_MATCHES', severity: 'INFO' as const },
        { code: config.repeatDaily === true ? 'REPEAT_DAILY_ENABLED' : 'REPEAT_DAILY_DISABLED', severity: 'INFO' as const },
      ],
    };
  }
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) {
    const days = Number(config.inactiveDays);
    const thresholdMs = days * 86_400_000;
    const matches = tasks.filter((task) => automationTaskMatchesRule(type, config, task, now));
    const upcoming = tasks.filter((task) => task.status !== EventTaskStatus.DONE && task.assignees.length > 0 && !matches.includes(task));
    const nextEligibleAt = upcoming.reduce<Date | null>((earliest, task) => {
      const eligibleAt = automationRuleEligibleAt(type, config, task);
      if (!eligibleAt) return earliest;
      return eligibleAt > now && (!earliest || eligibleAt < earliest) ? eligibleAt : earliest;
    }, null);
    return {
      matches,
      upcomingMatches: upcoming.length,
      nextEligibleAt,
      nextCheckCode: 'HOURLY_WORKER_CYCLE',
      taskReasonCode: 'TASK_INACTIVE',
      reasons: matches.length
        ? [{ code: 'STALE_TASKS_MATCH', severity: 'INFO' as const, count: matches.length, days }]
        : [{ code: 'NO_STALE_TASK_MATCHES', severity: 'INFO' as const }, ...(upcoming.length ? [{ code: 'TASKS_MAY_MATCH_LATER', severity: 'INFO' as const, count: upcoming.length }] : [])],
    };
  }
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) {
    const hours = Number(config.hoursBeforeDue);
    const windowMs = hours * 3_600_000;
    const matches = tasks.filter((task) => automationTaskMatchesRule(type, config, task, now));
    const upcoming = tasks.filter((task) => task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate.getTime() > nowMs + windowMs && (task.checklistItems.length ? task.checklistItems.some((item) => !item.isCompleted) : config.requireChecklistItems === false));
    const nextEligibleAt = upcoming.reduce<Date | null>((earliest, task) => {
      const eligibleAt = automationRuleEligibleAt(type, config, task);
      if (!eligibleAt) return earliest;
      return !earliest || eligibleAt < earliest ? eligibleAt : earliest;
    }, null);
    return {
      matches,
      upcomingMatches: upcoming.length,
      nextEligibleAt,
      nextCheckCode: 'HOURLY_WORKER_CYCLE',
      taskReasonCode: 'CHECKLIST_INCOMPLETE_NEAR_DUE',
      reasons: matches.length
        ? [{ code: 'INCOMPLETE_CHECKLISTS_MATCH', severity: 'INFO' as const, count: matches.length, hours }]
        : [{ code: 'NO_INCOMPLETE_CHECKLIST_MATCHES', severity: 'INFO' as const }, ...(upcoming.length ? [{ code: 'TASKS_MAY_MATCH_LATER', severity: 'INFO' as const, count: upcoming.length }] : [])],
    };
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) {
    const days = Number(config.graceDays);
    const graceMs = days * 86_400_000;
    const matches = tasks.filter((task) => automationTaskMatchesRule(type, config, task, now));
    const upcoming = tasks.filter((task) => task.status !== EventTaskStatus.DONE && task.dueDate && task.dueDate.getTime() + graceMs > nowMs);
    const nextEligibleAt = upcoming.reduce<Date | null>((earliest, task) => {
      const eligibleAt = automationRuleEligibleAt(type, config, task);
      if (!eligibleAt) return earliest;
      return !earliest || eligibleAt < earliest ? eligibleAt : earliest;
    }, null);
    return {
      matches,
      upcomingMatches: upcoming.length,
      nextEligibleAt,
      nextCheckCode: 'HOURLY_WORKER_CYCLE',
      taskReasonCode: 'TASK_OVERDUE_BEYOND_GRACE',
      reasons: [
        matches.length ? { code: 'ESCALATION_TASKS_MATCH', severity: 'INFO' as const, count: matches.length, days } : { code: 'NO_ESCALATION_MATCHES', severity: 'INFO' as const },
        { code: config.repeatDaily === true ? 'REPEAT_DAILY_ENABLED' : 'REPEAT_DAILY_DISABLED', severity: 'INFO' as const },
      ],
    };
  }
  if (type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) {
    const matches = tasks.filter((task) => task.checklistItems.length > 0 && task.checklistItems.every((item) => item.isCompleted));
    return {
      matches,
      upcomingMatches: null,
      nextEligibleAt: null,
      nextCheckCode: 'CHECKLIST_CHANGE',
      taskReasonCode: 'CHECKLIST_COMPLETE',
      reasons: [
        matches.length ? { code: 'TASKS_READY_TO_COMPLETE', severity: 'INFO' as const, count: matches.length } : { code: 'NO_COMPLETED_CHECKLIST', severity: 'INFO' as const },
        { code: 'WAITS_FOR_CHECKLIST_CHANGES', severity: 'INFO' as const },
      ],
    };
  }
  const matches = tasks.filter((task) => task.assignees.length === 0);
  return {
    matches,
    upcomingMatches: null,
    nextEligibleAt: null,
    nextCheckCode: 'BOARD_READ',
    taskReasonCode: 'TASK_UNASSIGNED',
    reasons: [matches.length ? { code: 'UNASSIGNED_TASKS_MATCH', severity: 'INFO' as const, count: matches.length } : { code: 'NO_UNASSIGNED_MATCHES', severity: 'INFO' as const }],
  };
}

function exactNotificationRuleMatch(value: unknown, config: Record<string, unknown>, extra: Record<string, unknown>) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const existing = value as Record<string, unknown>;
  const existingDelivery = normalizeAutomationDeliveryConfig(existing.delivery);
  const delivery = normalizeAutomationDeliveryConfig(config.delivery);
  return (existing.notifyAssignees === true) === (config.notifyAssignees === true)
    && (existing.notifyAdmins === true) === (config.notifyAdmins === true)
    && existingDelivery.channels.inApp === delivery.channels.inApp
    && existingDelivery.channels.email === delivery.channels.email
    && Object.entries(extra).every(([key, expected]) => key === 'hoursBeforeDue' ? Number(existing[key]) === expected : existing[key] === expected);
}

function automationValidationResult(items: AutomationValidationItem[]): AutomationValidationResult {
  return { valid: !items.some((item) => item.severity === 'ERROR'), items };
}

function assertAutomationValidation(validation: AutomationValidationResult) {
  if (!validation.valid) throw new BadRequestException({ message: 'Automation rule validation failed.', code: 'AUTOMATION_VALIDATION_FAILED', items: validation.items });
}

function taskBoardAutomationRuleData(input: Record<string, unknown>, required: boolean, emailAvailable = false) {
  const allowedTypes = Object.values(TaskBoardAutomationRuleType);
  const type = input.type === undefined && !required ? undefined : allowedTypes.includes(input.type as TaskBoardAutomationRuleType) ? input.type as TaskBoardAutomationRuleType : null;
  if (type === null || (required && !type)) throw new BadRequestException('Automation rule type is invalid.');
  const name = input.name === undefined ? undefined : nullableEventTaskString(input.name, 'Rule name', 120);
  const enabled = input.enabled === undefined ? undefined : booleanValue(input.enabled);
  if (input.enabled !== undefined && enabled === undefined) throw new BadRequestException('Automation rule enabled state is invalid.');
  if (!type) return { type, name, enabled, config: undefined };
  const rawConfig = input.config;
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) throw new BadRequestException('Automation rule configuration is required.');
  const config = rawConfig as Record<string, unknown>;
  const layout = automationRuleLayout(config.layout);
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) {
    const hoursBeforeDue = Number(config.hoursBeforeDue);
    const notifyAssignees = config.notifyAssignees === true;
    const notifyAdmins = config.notifyAdmins === true;
    if (!Number.isInteger(hoursBeforeDue) || hoursBeforeDue < 1 || hoursBeforeDue > 720) throw new BadRequestException('Hours before due must be between 1 and 720.');
    if (!notifyAssignees && !notifyAdmins) throw new BadRequestException('At least one recipient target is required.');
    const delivery = normalizeAutomationDeliveryConfig(config.delivery, true, emailAvailable);
    return { type, name, enabled, config: { hoursBeforeDue, notifyAssignees, notifyAdmins, delivery, ...(layout ? { layout } : {}) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE) {
    const notifyAssignees = config.notifyAssignees === true;
    const notifyAdmins = config.notifyAdmins === true;
    if (!notifyAssignees && !notifyAdmins) throw new BadRequestException('At least one recipient target is required.');
    const delivery = normalizeAutomationDeliveryConfig(config.delivery, true, emailAvailable);
    return { type, name, enabled, config: { notifyAssignees, notifyAdmins, repeatDaily: config.repeatDaily === true, delivery, ...(layout ? { layout } : {}) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) {
    const inactiveDays = Number(config.inactiveDays);
    const notifyAssignees = config.notifyAssignees === true;
    const notifyAdmins = config.notifyAdmins === true;
    if (!Number.isInteger(inactiveDays) || inactiveDays < 1 || inactiveDays > 30) throw new BadRequestException('Inactive days must be between 1 and 30.');
    if (!notifyAssignees && !notifyAdmins) throw new BadRequestException('At least one recipient target is required.');
    return { type, name, enabled, config: { inactiveDays, notifyAssignees, notifyAdmins, delivery: normalizeAutomationDeliveryConfig(config.delivery, true, emailAvailable), ...(layout ? { layout } : {}) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) {
    const hoursBeforeDue = Number(config.hoursBeforeDue);
    const notifyAssignees = config.notifyAssignees === true;
    const notifyAdmins = config.notifyAdmins === true;
    if (!Number.isInteger(hoursBeforeDue) || hoursBeforeDue < 1 || hoursBeforeDue > 720) throw new BadRequestException('Hours before due must be between 1 and 720.');
    if (!notifyAssignees && !notifyAdmins) throw new BadRequestException('At least one recipient target is required.');
    return { type, name, enabled, config: { hoursBeforeDue, requireChecklistItems: config.requireChecklistItems !== false, notifyAssignees, notifyAdmins, delivery: normalizeAutomationDeliveryConfig(config.delivery, true, emailAvailable), ...(layout ? { layout } : {}) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) {
    const graceDays = Number(config.graceDays);
    const notifyAssignees = config.notifyAssignees === true;
    const notifyAdmins = config.notifyAdmins === true;
    if (!Number.isInteger(graceDays) || graceDays < 1 || graceDays > 30) throw new BadRequestException('Grace days must be between 1 and 30.');
    if (!notifyAssignees && !notifyAdmins) throw new BadRequestException('At least one recipient target is required.');
    return { type, name, enabled, config: { graceDays, notifyAssignees, notifyAdmins, repeatDaily: config.repeatDaily === true, delivery: normalizeAutomationDeliveryConfig(config.delivery, true, emailAvailable), ...(layout ? { layout } : {}) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) {
    return { type, name, enabled, config: { requireAtLeastOneChecklistItem: config.requireAtLeastOneChecklistItem !== false, ...(layout ? { layout } : {}) } as Prisma.InputJsonObject };
  }
  return { type, name, enabled, config: { includeInOverview: config.includeInOverview !== false, ...(layout ? { layout } : {}) } as Prisma.InputJsonObject };
}

function taskBoardAutomationDraftData(type: TaskBoardAutomationRuleType, currentName: string | null, input: Record<string, unknown>) {
  const name = input.name === undefined ? currentName : nullableEventTaskString(input.name, 'Rule name', 120);
  const enabled = booleanValue(input.enabled);
  if (enabled === undefined) throw new BadRequestException('Automation rule enabled state is invalid.');
  const rawConfig = input.config;
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) throw new BadRequestException('Automation rule configuration is required.');
  const config = rawConfig as Record<string, unknown>;
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) {
    const hoursBeforeDue = Number(config.hoursBeforeDue);
    if (!Number.isInteger(hoursBeforeDue) || hoursBeforeDue < 1 || hoursBeforeDue > 720) throw new BadRequestException('Hours before due must be between 1 and 720.');
    return { name, enabled, config: { hoursBeforeDue, notifyAssignees: config.notifyAssignees === true, notifyAdmins: config.notifyAdmins === true, delivery: normalizeAutomationDraftDeliveryConfig(config.delivery) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE) {
    return { name, enabled, config: { notifyAssignees: config.notifyAssignees === true, notifyAdmins: config.notifyAdmins === true, repeatDaily: config.repeatDaily === true, delivery: normalizeAutomationDraftDeliveryConfig(config.delivery) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) {
    const inactiveDays = Number(config.inactiveDays);
    if (!Number.isInteger(inactiveDays) || inactiveDays < 1 || inactiveDays > 30) throw new BadRequestException('Inactive days must be between 1 and 30.');
    return { name, enabled, config: { inactiveDays, notifyAssignees: config.notifyAssignees === true, notifyAdmins: config.notifyAdmins === true, delivery: normalizeAutomationDraftDeliveryConfig(config.delivery) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) {
    const hoursBeforeDue = Number(config.hoursBeforeDue);
    if (!Number.isInteger(hoursBeforeDue) || hoursBeforeDue < 1 || hoursBeforeDue > 720) throw new BadRequestException('Hours before due must be between 1 and 720.');
    return { name, enabled, config: { hoursBeforeDue, requireChecklistItems: config.requireChecklistItems !== false, notifyAssignees: config.notifyAssignees === true, notifyAdmins: config.notifyAdmins === true, delivery: normalizeAutomationDraftDeliveryConfig(config.delivery) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) {
    const graceDays = Number(config.graceDays);
    if (!Number.isInteger(graceDays) || graceDays < 1 || graceDays > 30) throw new BadRequestException('Grace days must be between 1 and 30.');
    return { name, enabled, config: { graceDays, notifyAssignees: config.notifyAssignees === true, notifyAdmins: config.notifyAdmins === true, repeatDaily: config.repeatDaily === true, delivery: normalizeAutomationDraftDeliveryConfig(config.delivery) } as Prisma.InputJsonObject };
  }
  if (type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) {
    return { name, enabled, config: { requireAtLeastOneChecklistItem: config.requireAtLeastOneChecklistItem !== false } as Prisma.InputJsonObject };
  }
  return { name, enabled, config: { includeInOverview: config.includeInOverview !== false } as Prisma.InputJsonObject };
}

function isNotificationAutomationRule(type: TaskBoardAutomationRuleType) {
  return type === TaskBoardAutomationRuleType.DUE_BEFORE
    || type === TaskBoardAutomationRuleType.OVERDUE
    || type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP
    || type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE
    || type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION;
}

function normalizeAutomationDeliveryConfig(value: unknown, strict = false, emailAvailable = false) {
  const defaults = { channels: { inApp: true, email: false }, includeDeepLink: true, dedupeEnabled: true };
  if (value === undefined || value === null) return defaults;
  if (typeof value !== 'object' || Array.isArray(value)) {
    if (strict) throw new BadRequestException('Automation delivery configuration is invalid.');
    return defaults;
  }
  const delivery = value as Record<string, unknown>;
  const channels = delivery.channels;
  if (channels !== undefined && (typeof channels !== 'object' || channels === null || Array.isArray(channels))) {
    if (strict) throw new BadRequestException('Automation delivery channels are invalid.');
    return defaults;
  }
  const channelValues = (channels ?? {}) as Record<string, unknown>;
  const inApp = channelValues.inApp === undefined ? true : channelValues.inApp;
  const email = channelValues.email === undefined ? false : channelValues.email;
  const includeDeepLink = delivery.includeDeepLink === undefined ? true : delivery.includeDeepLink;
  const dedupeEnabled = delivery.dedupeEnabled === undefined ? true : delivery.dedupeEnabled;
  if (typeof inApp !== 'boolean' || typeof email !== 'boolean' || typeof includeDeepLink !== 'boolean' || typeof dedupeEnabled !== 'boolean') {
    if (strict) throw new BadRequestException('Automation delivery configuration is invalid.');
    return defaults;
  }
  if (strict && (!inApp && (!email || !emailAvailable))) throw new BadRequestException('At least one available delivery channel is required.');
  if (strict && email && !emailAvailable) throw new BadRequestException('SMTP email delivery is not available.');
  if (strict && !dedupeEnabled) throw new BadRequestException('Dedupe protection is required.');
  return { channels: { inApp: inApp === true, email: email === true }, includeDeepLink, dedupeEnabled: true };
}

function normalizeAutomationDraftDeliveryConfig(value: unknown) {
  const defaults = { channels: { inApp: true, email: false }, includeDeepLink: true, dedupeEnabled: true };
  if (value === undefined || value === null) return defaults;
  if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Automation delivery configuration is invalid.');
  const delivery = value as Record<string, unknown>;
  const channels = delivery.channels;
  if (channels !== undefined && (typeof channels !== 'object' || channels === null || Array.isArray(channels))) throw new BadRequestException('Automation delivery channels are invalid.');
  const channelValues = (channels ?? {}) as Record<string, unknown>;
  const inApp = channelValues.inApp === undefined ? true : channelValues.inApp;
  const email = channelValues.email === undefined ? false : channelValues.email;
  const includeDeepLink = delivery.includeDeepLink === undefined ? true : delivery.includeDeepLink;
  const dedupeEnabled = delivery.dedupeEnabled === undefined ? true : delivery.dedupeEnabled;
  if (typeof inApp !== 'boolean' || typeof email !== 'boolean' || typeof includeDeepLink !== 'boolean' || typeof dedupeEnabled !== 'boolean') throw new BadRequestException('Automation delivery configuration is invalid.');
  return { channels: { inApp, email }, includeDeepLink, dedupeEnabled: true };
}

function automationRuleConfigWithDefaults(type: TaskBoardAutomationRuleType, value: unknown) {
  const config = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (!isNotificationAutomationRule(type)) return config;
  const defaults = type === TaskBoardAutomationRuleType.DUE_BEFORE ? { hoursBeforeDue: 24, notifyAssignees: true, notifyAdmins: false }
    : type === TaskBoardAutomationRuleType.OVERDUE ? { notifyAssignees: true, notifyAdmins: true, repeatDaily: false }
      : type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP ? { inactiveDays: 3, notifyAssignees: true, notifyAdmins: false }
        : type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE ? { hoursBeforeDue: 24, requireChecklistItems: true, notifyAssignees: true, notifyAdmins: false }
          : { graceDays: 2, notifyAssignees: false, notifyAdmins: true, repeatDaily: false };
  return { ...defaults, ...config, delivery: normalizeAutomationDeliveryConfig(config.delivery) };
}

type AutomationRuleSnapshotSource = {
  id: string;
  communityId: string;
  boardId: string;
  currentVersion: number;
  type: TaskBoardAutomationRuleType;
  enabled: boolean;
  name: string | null;
  config: Prisma.JsonValue;
};

function automationRuleVersionData(rule: AutomationRuleSnapshotSource, changedById: string, changeType: TaskBoardAutomationRuleChangeType, changeSummary: string): Prisma.TaskBoardAutomationRuleVersionUncheckedCreateInput {
  return {
    communityId: rule.communityId,
    boardId: rule.boardId,
    ruleId: rule.id,
    version: rule.currentVersion,
    type: rule.type,
    enabled: rule.enabled,
    name: rule.name,
    config: automationRuleBehaviorConfig(rule.config) as Prisma.InputJsonValue,
    changeType,
    changeSummary,
    changedById,
  };
}

function automationRuleBehaviorConfig(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const { layout: _layout, ...config } = value as Record<string, unknown>;
  return config;
}

function automationRuleLayoutConfig(value: unknown): { layout?: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const layout = (value as Record<string, unknown>).layout;
  return layout === undefined ? {} : { layout };
}

function automationRuleBehaviorChanged(previous: AutomationRuleSnapshotSource, next: Pick<AutomationRuleSnapshotSource, 'type' | 'enabled' | 'name'> & { config: unknown }) {
  return previous.type !== next.type
    || previous.enabled !== next.enabled
    || previous.name !== next.name
    || JSON.stringify(automationRuleBehaviorConfig(previous.config)) !== JSON.stringify(automationRuleBehaviorConfig(next.config));
}

function automationRuleChangeSummary(previous: AutomationRuleSnapshotSource, next: AutomationRuleSnapshotSource) {
  if (previous.enabled !== next.enabled) return next.enabled ? 'RULE_ENABLED' : 'RULE_DISABLED';
  if (previous.type !== next.type) return 'RULE_TYPE_CHANGED';
  const before = automationRuleBehaviorConfig(previous.config);
  const after = automationRuleBehaviorConfig(next.config);
  if (previous.type === TaskBoardAutomationRuleType.DUE_BEFORE && before.hoursBeforeDue !== after.hoursBeforeDue) return `HOURS_BEFORE_DUE:${before.hoursBeforeDue}:${after.hoursBeforeDue}`;
  if (previous.type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP && before.inactiveDays !== after.inactiveDays) return `INACTIVE_DAYS:${before.inactiveDays}:${after.inactiveDays}`;
  if (previous.type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION && before.graceDays !== after.graceDays) return `GRACE_DAYS:${before.graceDays}:${after.graceDays}`;
  if (before.notifyAssignees !== after.notifyAssignees || before.notifyAdmins !== after.notifyAdmins) return 'RECIPIENTS_CHANGED';
  const beforeDelivery = normalizeAutomationDeliveryConfig(before.delivery);
  const afterDelivery = normalizeAutomationDeliveryConfig(after.delivery);
  if (beforeDelivery.channels.email !== afterDelivery.channels.email) return afterDelivery.channels.email ? 'EMAIL_ENABLED' : 'EMAIL_DISABLED';
  if (before.repeatDaily !== after.repeatDaily) return after.repeatDaily ? 'REPEAT_DAILY_ENABLED' : 'REPEAT_DAILY_DISABLED';
  if (JSON.stringify(beforeDelivery) !== JSON.stringify(afterDelivery)) return 'DELIVERY_SETTINGS_CHANGED';
  return 'RULE_UPDATED';
}

function automationRuleLayout(value: unknown) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Automation rule layout is invalid.');
  const layout = value as Record<string, unknown>;
  const x = Number(layout.x);
  const y = Number(layout.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 5000 || y > 5000) throw new BadRequestException('Automation rule layout is invalid.');
  return { x: Math.round(x), y: Math.round(y) };
}

function taskBoardAutomationRuleName(type: TaskBoardAutomationRuleType, language?: string | null) {
  const french = language === 'fr';
  if (type === TaskBoardAutomationRuleType.DUE_BEFORE) return french ? 'Notifier avant la date limite' : 'Notify before due date';
  if (type === TaskBoardAutomationRuleType.OVERDUE) return french ? 'Notifier lorsqu’une tâche est en retard' : 'Notify when a task is overdue';
  if (type === TaskBoardAutomationRuleType.AUTO_COMPLETE_WHEN_CHECKLIST_DONE) return french ? 'Terminer lorsque la checklist est terminée' : 'Complete when checklist is done';
  if (type === TaskBoardAutomationRuleType.STALE_TASK_FOLLOW_UP) return french ? 'Relancer les tâches inactives' : 'Follow up on stale tasks';
  if (type === TaskBoardAutomationRuleType.CHECKLIST_INCOMPLETE_BEFORE_DUE) return french ? 'Avertir quand la checklist est incomplète avant l’échéance' : 'Warn when checklist is incomplete before due date';
  if (type === TaskBoardAutomationRuleType.OVERDUE_ESCALATION) return french ? 'Escalader les tâches en retard' : 'Escalate overdue tasks';
  return french ? 'Signaler les tâches non assignées' : 'Flag unassigned tasks';
}

function taskBoardAutomationTestCopy(language: string | null | undefined, ruleName: string, boardName: string) {
  return language === 'fr'
    ? { title: 'Notification de test d’automatisation', body: `Ceci est un test pour « ${ruleName} » sur « ${boardName} ».` }
    : { title: 'Test automation notification', body: `This is a test for “${ruleName}” on “${boardName}”.` };
}

function taskBoardAutomationTestEmailCopy(language: string | null | undefined, ruleName: string, boardName: string, communityName: string, actionUrl: string | null) {
  const french = language === 'fr';
  const lines = french
    ? [`Ceci est un e-mail de test pour « ${ruleName} » sur « ${boardName} ».`, `Communauté : ${communityName}`]
    : [`This is a test email for “${ruleName}” on “${boardName}”.`, `Community: ${communityName}`];
  if (actionUrl) lines.push('', actionUrl);
  return { subject: french ? 'E-mail de test d’automatisation' : 'Test automation email', body: lines.join('\n') };
}

function automationBoardUrl(boardId: string) {
  return `${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')}/admin/task-boards/${boardId}?section=automation`;
}

function automationTaskUrl(boardId: string, taskId: string) {
  return `${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')}/admin/task-boards/${boardId}?task=${taskId}&tab=activity`;
}

function eventTaskCreateData(input: Record<string, unknown>) {
  const title = eventTaskTitle(input.title, true);
  return {
    title: title!,
    description: nullableEventTaskString(input.description, 'Task description', 2000),
    assigneeId: eventTaskAssigneeIds(input)?.[0] ?? null,
    dueDate: eventTaskDueDate(input.dueDate),
    priority: eventTaskPriority(input.priority) ?? EventTaskPriority.MEDIUM,
    label: nullableEventTaskString(input.label, 'Task label', 60),
  };
}

function eventTaskUpdateData(input: Record<string, unknown>): EventTaskUpdateData {
  const data: EventTaskUpdateData = {};
  const title = eventTaskTitle(input.title, false);
  const description = nullableEventTaskString(input.description, 'Task description', 2000);
  const assigneeIds = eventTaskAssigneeIds(input);
  const dueDate = eventTaskDueDate(input.dueDate);
  const priority = eventTaskPriority(input.priority);
  const label = nullableEventTaskString(input.label, 'Task label', 60);
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description;
  if (assigneeIds !== undefined) data.assigneeId = assigneeIds[0] ?? null;
  if (dueDate !== undefined) data.dueDate = dueDate;
  if (priority !== undefined) data.priority = priority;
  if (label !== undefined) data.label = label;
  if (Object.keys(data).length === 0) throw new BadRequestException('At least one task field is required.');
  return data;
}

function eventTaskAssigneeIds(input: Record<string, unknown>): string[] | undefined {
  if (input.assigneeIds !== undefined) {
    if (!Array.isArray(input.assigneeIds)) throw new BadRequestException('Assignees must be an array.');
    const ids = input.assigneeIds.map((value) => {
      if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new BadRequestException('Assignee is invalid.');
      return value.trim();
    });
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length > 10) throw new BadRequestException('A task can have at most 10 assignees.');
    return uniqueIds;
  }
  if (input.assigneeId === undefined) return undefined;
  const assigneeId = nullableEventTaskString(input.assigneeId, 'Assignee', 200);
  return assigneeId ? [assigneeId] : [];
}

function sameStringSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function eventTaskDataChanged(existing: {
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: Date | null;
  priority: EventTaskPriority;
  label: string | null;
}, data: EventTaskUpdateData) {
  if (data.title !== undefined && data.title !== existing.title) return true;
  if (data.description !== undefined && data.description !== existing.description) return true;
  if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) return true;
  if (data.dueDate !== undefined && data.dueDate?.getTime() !== existing.dueDate?.getTime()) return true;
  if (data.priority !== undefined && data.priority !== existing.priority) return true;
  if (data.label !== undefined && data.label !== existing.label) return true;
  return false;
}

function eventTaskUpdateActivities(existing: {
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: Date | null;
  priority: EventTaskPriority;
  label: string | null;
}, data: EventTaskUpdateData): { type: EventTaskActivityType; metadata?: Prisma.InputJsonObject }[] {
  const activity: { type: EventTaskActivityType; metadata?: Prisma.InputJsonObject }[] = [];
  if (data.assigneeId !== undefined && data.assigneeId !== existing.assigneeId) {
    if (!existing.assigneeId && data.assigneeId) activity.push({ type: EventTaskActivityType.ASSIGNED, metadata: { toAssigneeId: data.assigneeId } });
    else if (existing.assigneeId && !data.assigneeId) activity.push({ type: EventTaskActivityType.UNASSIGNED, metadata: { fromAssigneeId: existing.assigneeId } });
    else activity.push({ type: EventTaskActivityType.REASSIGNED, metadata: { fromAssigneeId: existing.assigneeId!, toAssigneeId: data.assigneeId! } });
  }
  if (data.priority !== undefined && data.priority !== existing.priority) activity.push({ type: EventTaskActivityType.PRIORITY_CHANGED, metadata: { from: existing.priority, to: data.priority } });
  if (data.dueDate !== undefined && data.dueDate?.getTime() !== existing.dueDate?.getTime()) activity.push({ type: EventTaskActivityType.DUE_DATE_CHANGED });
  if (data.title !== undefined && data.title !== existing.title) activity.push({ type: EventTaskActivityType.TITLE_CHANGED });
  if (data.description !== undefined && data.description !== existing.description) activity.push({ type: EventTaskActivityType.DESCRIPTION_CHANGED });
  if (data.label !== undefined && data.label !== existing.label) activity.push({ type: EventTaskActivityType.LABEL_CHANGED });
  return activity;
}

function eventTaskTitle(raw: unknown, required: boolean) {
  if (raw === undefined && !required) return undefined;
  if (typeof raw !== 'string' || !raw.trim()) throw new BadRequestException('Task title is required.');
  const value = raw.trim();
  if (value.length > 160) throw new BadRequestException('Task title must be 160 characters or fewer.');
  return value;
}

function nullableEventTaskString(raw: unknown, label: string, maxLength: number): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new BadRequestException(`${label} is invalid.`);
  const value = raw.trim();
  if (!value) return null;
  if (value.length > maxLength) throw new BadRequestException(`${label} must be ${maxLength} characters or fewer.`);
  return value;
}

function eventTaskDueDate(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new BadRequestException('Task due date is invalid.');
  const dueDate = new Date(raw);
  if (Number.isNaN(dueDate.getTime())) throw new BadRequestException('Task due date is invalid.');
  return dueDate;
}

function eventTaskPriority(raw: unknown): EventTaskPriority | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !Object.values(EventTaskPriority).includes(raw as EventTaskPriority)) {
    throw new BadRequestException('Task priority is invalid.');
  }
  return raw as EventTaskPriority;
}

function requiredEventTaskStatus(raw: unknown): EventTaskStatus {
  if (typeof raw !== 'string' || !Object.values(EventTaskStatus).includes(raw as EventTaskStatus)) {
    throw new BadRequestException('Task status is invalid.');
  }
  return raw as EventTaskStatus;
}

function optionalSortOrder(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) throw new BadRequestException('Task sort order is invalid.');
  return raw;
}

function eventTaskColumns(raw: unknown): Record<EventTaskStatus, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Task columns are required.');
  const columns = raw as Record<string, unknown>;
  return EVENT_TASK_STATUSES.reduce<Record<EventTaskStatus, string[]>>((result, status) => {
    const taskIds = columns[status];
    if (!Array.isArray(taskIds) || taskIds.some((taskId) => typeof taskId !== 'string' || !taskId)) {
      throw new BadRequestException(`Task column ${status} is invalid.`);
    }
    result[status] = taskIds as string[];
    return result;
  }, { TODO: [], IN_PROGRESS: [], DONE: [] });
}

function eventTaskAssignmentNotificationCopy(language: string | null | undefined, taskTitle: string, eventTitle: string) {
  if (language === 'fr') {
    return {
      title: 'Nouvelle tâche d’événement assignée',
      body: `La tâche « ${taskTitle} » vous a été assignée pour « ${eventTitle} ».`,
    };
  }
  return {
    title: 'New event task assigned',
    body: `You were assigned “${taskTitle}” for “${eventTitle}”.`,
  };
}

function eventTaskTemplateData(input: Record<string, unknown>) {
  const name = eventTaskTitle(input.name, true)!;
  const description = nullableEventTaskString(input.description, 'Template description', 1000) ?? null;
  const isActive = input.isActive === undefined ? true : input.isActive;
  if (typeof isActive !== 'boolean') throw new BadRequestException('Template active state is invalid.');
  if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('At least one template item is required.');
  if (input.items.length > 100) throw new BadRequestException('A template can contain at most 100 items.');
  const items = input.items.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Template item is invalid.');
    const item = raw as Record<string, unknown>;
    const title = eventTaskTitle(item.title, true)!;
    const itemDescription = nullableEventTaskString(item.description, 'Template item description', 2000) ?? null;
    const label = nullableEventTaskString(item.label, 'Template item label', 60) ?? null;
    const priority = eventTaskPriority(item.priority) ?? EventTaskPriority.MEDIUM;
    const dueOffsetDays = item.dueOffsetDays === null || item.dueOffsetDays === undefined ? null : Number(item.dueOffsetDays);
    if (dueOffsetDays !== null && (!Number.isInteger(dueOffsetDays) || dueOffsetDays < -3650 || dueOffsetDays > 3650)) throw new BadRequestException('Due offset days must be a whole number between -3650 and 3650.');
    return { title, description: itemDescription, label, priority, dueOffsetDays, sortOrder: index };
  });
  return { name, description, isActive, items };
}

function eventData(input: Record<string, unknown>) {
  const title = stringValue(input.title);
  const description = stringValue(input.description);
  const location = stringValue(input.location);
  const startsAtValue = stringValue(input.startsAt);
  if (!title || !description || !location || !startsAtValue) throw new BadRequestException('Event title, description, location, and date are required.');
  const startsAt = new Date(startsAtValue);
  if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Event date is invalid.');
  const capacityValue = typeof input.capacity === 'number' ? input.capacity : Number(stringValue(input.capacity));
  return {
    title,
    description,
    location,
    startsAt,
    onlineUrl: stringValue(input.onlineUrl),
    capacity: Number.isFinite(capacityValue) && capacityValue > 0 ? Math.floor(capacityValue) : null,
  };
}

type PreparedPublicationCover = {
  data: { coverUrl?: string | null; coverSource?: 'UPLOAD' | 'EXTERNAL' | null };
  uploadedPath?: string;
  replacesExisting: boolean;
};

async function preparePublicationCover(mutation: PublicationCoverMutation): Promise<PreparedPublicationCover> {
  if (mutation.action === 'keep') return { data: {}, replacesExisting: false };
  if (mutation.action === 'clear') return { data: { coverUrl: null, coverSource: null }, replacesExisting: true };
  if (mutation.action === 'external') {
    return { data: { coverUrl: mutation.coverUrl, coverSource: mutation.coverSource }, replacesExisting: true };
  }
  const filename = `${randomUUID()}${mutation.extension}`;
  const uploadDir = publicationCoverUploadDir();
  const uploadedPath = join(uploadDir, filename);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(uploadedPath, mutation.file.buffer);
  return {
    data: { coverUrl: publicationCoverPublicUrl(filename), coverSource: mutation.coverSource },
    uploadedPath,
    replacesExisting: true,
  };
}

async function removeUploadedPublicationCover(coverUrl: string | null | undefined, coverSource: string | null | undefined) {
  if (!coverUrl || coverSource !== 'UPLOAD') return;
  try {
    const filename = basename(new URL(coverUrl).pathname);
    if (!/^[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(filename)) return;
    await unlink(join(publicationCoverUploadDir(), filename)).catch(() => undefined);
  } catch {
    // Malformed legacy metadata never becomes a filesystem path.
  }
}

function announcementData(input: Record<string, unknown>) {
  const title = stringValue(input.title);
  const body = stringValue(input.body);
  if (!title || !body) throw new BadRequestException('Announcement title and body are required.');
  return { title, body };
}

function announcementAuthorMode(value: unknown): AnnouncementAuthorMode {
  if (value === undefined || value === null) return AnnouncementAuthorMode.USER;
  if (value === AnnouncementAuthorMode.USER || value === AnnouncementAuthorMode.COMMUNITY_TEAM) return value;
  throw new BadRequestException('Announcement author mode is invalid.');
}

function reminderSettingsData(input: Record<string, unknown>) {
  return {
    birthdayReminderEnabled: booleanValue(input.birthdayReminderEnabled),
    birthdayReminderDaysBefore: numberValue(input.birthdayReminderDaysBefore),
    birthdayDayNotificationEnabled: booleanValue(input.birthdayDayNotificationEnabled),
    birthdayNotifyAllMembers: booleanValue(input.birthdayNotifyAllMembers),
    anniversaryReminderEnabled: booleanValue(input.anniversaryReminderEnabled),
    anniversaryReminderDaysBefore: numberValue(input.anniversaryReminderDaysBefore),
    anniversaryDayNotificationEnabled: booleanValue(input.anniversaryDayNotificationEnabled),
    birthdayReminderTemplate: stringValue(input.birthdayReminderTemplate),
    birthdayDayTemplate: stringValue(input.birthdayDayTemplate),
    anniversaryReminderTemplate: stringValue(input.anniversaryReminderTemplate),
    anniversaryDayTemplate: stringValue(input.anniversaryDayTemplate),
    passportRemindersEnabled: booleanValue(input.passportRemindersEnabled),
    passportNotifyMember: booleanValue(input.passportNotifyMember),
    passportNotifyAdmins: booleanValue(input.passportNotifyAdmins),
    passportEmailEnabled: booleanValue(input.passportEmailEnabled),
    passportFirstReminderDaysBefore: numberValue(input.passportFirstReminderDaysBefore),
    passportSecondReminderDaysBefore: numberValue(input.passportSecondReminderDaysBefore),
    passportFinalReminderDaysBefore: numberValue(input.passportFinalReminderDaysBefore),
    passportDayOfReminderEnabled: booleanValue(input.passportDayOfReminderEnabled),
    passportReminderTemplate: stringValue(input.passportReminderTemplate),
    passportDayOfTemplate: stringValue(input.passportDayOfTemplate),
  };
}

function validatePassportReminderStages(data: ReturnType<typeof reminderSettingsData>) {
  const stages = [data.passportFirstReminderDaysBefore, data.passportSecondReminderDaysBefore, data.passportFinalReminderDaysBefore].filter((value): value is number => typeof value === 'number');
  if (!stages.length) return;
  if (stages.some((value) => value <= 0)) throw new BadRequestException('Passport reminder stages must be positive.');
  if (new Set(stages).size !== stages.length) throw new BadRequestException('Passport reminder stages must be unique.');
  if (stages.length === 3 && !(stages[0] > stages[1] && stages[1] > stages[2])) throw new BadRequestException('Passport reminder stages must be ordered from largest to smallest.');
}

function communitySettingsData(input: Record<string, unknown>) {
  return {
    twoFactorEnabled: booleanValue(input.twoFactorEnabled),
  };
}

const supportedLanguages = ['en', 'fr'] as const;
const fallbackTimezones = ['UTC', 'Africa/Kinshasa', 'Africa/Lagos', 'Africa/Johannesburg', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Toronto'] as const;
const supportedRegistrationApprovalModes = ['invite_link', 'portal_registration'] as const;
const supportedDirectoryVisibilities = ['members_only', 'hidden'] as const;
const notificationSettingKeys = [
  'adminInAppAlertsEnabled',
  'emailDeliveryIssueAlertsEnabled',
  'registrationReviewAlertsEnabled',
  'passportExpirationAdminAlertsEnabled',
  'reminderRunSummaryAlertsEnabled',
] as const;

function generalSettingsData(input: Record<string, unknown>) {
  const defaultLanguage = enumValue(input.defaultLanguage, supportedLanguages, 'default language');
  const timezone = timezoneValue(input.timezone);
  const registrationApprovalMode = enumValue(input.registrationApprovalMode, supportedRegistrationApprovalModes, 'registration approval mode');
  const memberDirectoryVisibility = enumValue(input.memberDirectoryVisibility, supportedDirectoryVisibilities, 'member directory visibility');
  const supportContactEmail = optionalEmail(input.supportContactEmail);
  return {
    defaultLanguage,
    timezone,
    registrationApprovalMode,
    memberDirectoryVisibility,
    supportContactEmail,
  };
}

function generalSettingsShape(
  community: { id: string; name: string; slug: string },
  settings: {
    defaultLanguage: string;
    timezone: string;
    registrationApprovalMode: string;
    memberDirectoryVisibility: string;
    supportContactEmail: string | null;
  },
) {
  return {
    communityId: community.id,
    communityName: community.name,
    communitySlug: community.slug,
    defaultLanguage: settings.defaultLanguage,
    timezone: settings.timezone,
    registrationApprovalMode: settings.registrationApprovalMode,
    memberDirectoryVisibility: settings.memberDirectoryVisibility,
    supportContactEmail: settings.supportContactEmail ?? '',
  };
}

function notificationSettingsData(input: Record<string, unknown>) {
  return {
    adminInAppAlertsEnabled: requiredBoolean(input.adminInAppAlertsEnabled, 'admin in-app alerts enabled'),
    emailDeliveryIssueAlertsEnabled: requiredBoolean(input.emailDeliveryIssueAlertsEnabled, 'email delivery issue alerts enabled'),
    registrationReviewAlertsEnabled: requiredBoolean(input.registrationReviewAlertsEnabled, 'registration review alerts enabled'),
    passportExpirationAdminAlertsEnabled: requiredBoolean(input.passportExpirationAdminAlertsEnabled, 'passport expiration admin alerts enabled'),
    reminderRunSummaryAlertsEnabled: requiredBoolean(input.reminderRunSummaryAlertsEnabled, 'reminder run summary alerts enabled'),
  };
}

function notificationSettingsShape(settings: Record<(typeof notificationSettingKeys)[number], boolean>) {
  return notificationSettingKeys.reduce<Record<(typeof notificationSettingKeys)[number], boolean>>((shape, key) => {
    shape[key] = settings[key];
    return shape;
  }, {} as Record<(typeof notificationSettingKeys)[number], boolean>);
}

function adminNotificationWhere(communityId: string, userId: string): Prisma.NotificationWhereInput {
  return {
    communityId,
    OR: [{ userId }, { userId: null }],
    AND: [
      {
        OR: [
          { type: { startsWith: 'PASSPORT_' } },
          { type: 'REGISTRATION_SUBMITTED' },
          { type: { in: ['EVENT_TASK_COMMENTED', 'EVENT_TASK_DUE_SOON', 'EVENT_TASK_OVERDUE', 'EVENT_TASK_ATTACHMENT_ADDED', 'EVENT_TASK_ATTACHMENT_REMOVED'] } },
        ],
      },
    ],
  };
}

type ReminderTemplateField =
  | 'birthdayReminderTemplate'
  | 'birthdayDayTemplate'
  | 'anniversaryReminderTemplate'
  | 'anniversaryDayTemplate'
  | 'passportReminderTemplate'
  | 'passportDayOfTemplate';

const defaultReminderTemplateValues = defaultReminderSettings();

const reminderTemplateDefinitions: Array<{
  key: string;
  channel: 'notification' | 'email';
  title: string;
  description: string;
  subject: string;
  field: ReminderTemplateField;
  defaultBody: string;
  variables: string[];
  requiredVariables: string[];
}> = [
  {
    key: 'birthday_notification',
    channel: 'notification',
    title: 'Birthday in-app notification',
    description: 'Body used for advance birthday reminder notifications.',
    subject: 'Birthday reminder',
    field: 'birthdayReminderTemplate',
    defaultBody: defaultReminderTemplateValues.birthdayReminderTemplate,
    variables: ['memberName', 'communityName', 'date', 'years'],
    requiredVariables: [],
  },
  {
    key: 'birthday_day_notification',
    channel: 'notification',
    title: 'Birthday day in-app notification',
    description: 'Body used on the member birthday.',
    subject: 'Birthday today',
    field: 'birthdayDayTemplate',
    defaultBody: defaultReminderTemplateValues.birthdayDayTemplate,
    variables: ['memberName', 'communityName', 'date', 'years'],
    requiredVariables: [],
  },
  {
    key: 'anniversary_notification',
    channel: 'notification',
    title: 'Anniversary in-app notification',
    description: 'Body used for advance membership anniversary reminders.',
    subject: 'Membership anniversary reminder',
    field: 'anniversaryReminderTemplate',
    defaultBody: defaultReminderTemplateValues.anniversaryReminderTemplate,
    variables: ['memberName', 'communityName', 'date', 'years'],
    requiredVariables: [],
  },
  {
    key: 'anniversary_day_notification',
    channel: 'notification',
    title: 'Anniversary day in-app notification',
    description: 'Body used on the membership anniversary day.',
    subject: 'Membership anniversary today',
    field: 'anniversaryDayTemplate',
    defaultBody: defaultReminderTemplateValues.anniversaryDayTemplate,
    variables: ['memberName', 'communityName', 'date', 'years'],
    requiredVariables: [],
  },
  {
    key: 'passport_expiration_notification',
    channel: 'notification',
    title: 'Passport expiration in-app notification',
    description: 'Body used for private passport expiration reminders.',
    subject: 'Passport renewal reminder',
    field: 'passportReminderTemplate',
    defaultBody: defaultReminderTemplateValues.passportReminderTemplate,
    variables: ['memberName', 'communityName', 'expirationDate', 'daysRemaining', 'stageLabel'],
    requiredVariables: ['expirationDate'],
  },
  {
    key: 'passport_expiration_email',
    channel: 'email',
    title: 'Passport expiration email',
    description: 'Plain-text body queued when passport reminder email delivery is enabled.',
    subject: 'Passport renewal reminder',
    field: 'passportReminderTemplate',
    defaultBody: defaultReminderTemplateValues.passportReminderTemplate,
    variables: ['memberName', 'communityName', 'expirationDate', 'daysRemaining', 'stageLabel'],
    requiredVariables: ['expirationDate'],
  },
];

function reminderMessageTemplates(settings: Record<ReminderTemplateField, string>) {
  return reminderTemplateDefinitions.map((definition) => reminderTemplateFromSettings(settings, definition));
}

function reminderTemplateFromSettings(settings: Record<ReminderTemplateField, string>, definition: (typeof reminderTemplateDefinitions)[number]) {
  return {
    key: definition.key,
    channel: definition.channel,
    displayName: definition.title,
    description: definition.description,
    subject: definition.subject,
    body: settings[definition.field],
    defaultBody: definition.defaultBody,
    variables: definition.variables,
    requiredVariables: definition.requiredVariables,
    isEditable: true,
    isSystem: false,
    updatedAt: null,
  };
}

function messageTemplateShape(template: {
  key: string;
  channel: string;
  title?: string;
  displayName?: string;
  description?: string;
  subject: string;
  body: string;
  defaultBody: string;
  variablesJson?: Prisma.JsonValue;
  variables?: string[];
  requiredVariables?: string[];
  isEditable: boolean;
  isSystem: boolean;
  updatedAt: Date | string | null;
}) {
  const definition = messageTemplateDefinition(template.key);
  return {
    key: template.key,
    channel: template.channel,
    displayName: template.displayName ?? template.title ?? definition?.title ?? template.key,
    description: template.description ?? definition?.description ?? '',
    subject: template.subject,
    body: template.body,
    defaultBody: template.defaultBody,
    variables: template.variables ?? jsonStringArray(template.variablesJson) ?? definition?.variables ?? [],
    requiredVariables: template.requiredVariables ?? definition?.requiredVariables ?? [],
    isEditable: template.isEditable,
    isSystem: template.isSystem,
    updatedAt: template.updatedAt,
  };
}

type CommunityMessageTemplateRecord = Prisma.CommunityMessageTemplateGetPayload<Record<string, never>>;

function localizedMessageTemplateShape(template: CommunityMessageTemplateRecord) {
  const definition = messageTemplateDefinition(template.key, normalizeEmailLocale(template.locale));
  if (!definition) throw new Error(`Unsupported email template key: ${template.key}`);
  return {
    locale: normalizeEmailLocale(template.locale),
    subject: template.subject,
    previewText: template.previewText,
    heading: template.heading,
    greeting: template.greeting,
    body: template.body,
    buttonLabel: template.buttonLabel,
    fallbackLinkInstructions: template.fallbackLinkInstructions,
    expirationNotice: template.expirationNotice,
    securityNotice: template.securityNotice,
    footerExplanation: template.footerExplanation,
    defaultContent: template.defaultContent ?? templateDefaultContent(definition),
    configured: true,
    needsReview: template.needsReview,
    updatedAt: template.updatedAt,
  };
}

function localizedMessageTemplateShapes(templates: CommunityMessageTemplateRecord[]) {
  const grouped = new Map<string, CommunityMessageTemplateRecord[]>();
  for (const template of templates) {
    grouped.set(template.key, [...(grouped.get(template.key) ?? []), template]);
  }
  return [...grouped.entries()].map(([key, variants]) => {
    const definition = messageTemplateDefinition(key);
    if (!definition) throw new Error(`Unsupported email template key: ${key}`);
    const byLocale = Object.fromEntries(EMAIL_LOCALES.map((locale) => {
      const record = variants.find((variant) => variant.locale === locale);
      const fallback = messageTemplateDefinition(key, locale);
      return [locale, record ? localizedMessageTemplateShape(record) : {
        locale,
        ...templateDefaultContent(fallback!),
        defaultContent: templateDefaultContent(fallback!),
        configured: false,
        needsReview: false,
        updatedAt: null,
      }];
    }));
    return {
      key,
      channel: 'email',
      displayName: definition.title,
      description: definition.description,
      variables: [...definition.variables],
      requiredVariables: [...editableTemplateRequiredVariables(definition)],
      isEditable: true,
      isSystem: false,
      variants: byLocale,
      updatedAt: variants.reduce<Date | null>((latest, variant) => !latest || variant.updatedAt > latest ? variant.updatedAt : latest, null),
    };
  });
}

function groupedMessageTemplates(templates: Array<ReturnType<typeof messageTemplateShape> | ReturnType<typeof localizedMessageTemplateShapes>[number]>) {
  return {
    notification: templates.filter((template) => template.channel === 'notification'),
    email: templates.filter((template) => template.channel === 'email'),
    system: templates.filter((template) => template.channel === 'system'),
  };
}

function strictEmailLocale(value: unknown): EmailLocale {
  if (value !== 'en' && value !== 'fr') throw new BadRequestException('Template locale must be en or fr.');
  return value;
}

function localizedTemplateInput(input: Record<string, unknown>, definition: LocalizedEmailTemplate): LocalizedEmailTemplate {
  const optional = (key: string) => typeof input[key] === 'string' && input[key] !== '' ? String(input[key]).trim() : null;
  return {
    ...definition,
    subject: requiredTemplateField(input, 'subject'),
    previewText: optional('previewText'),
    heading: requiredTemplateField(input, 'heading'),
    greeting: optional('greeting'),
    body: requiredTemplateField(input, 'body'),
    buttonLabel: optional('buttonLabel'),
    fallbackLinkInstructions: optional('fallbackLinkInstructions'),
    expirationNotice: optional('expirationNotice'),
    securityNotice: optional('securityNotice'),
    footerExplanation: optional('footerExplanation'),
  };
}

function requiredTemplateField(input: Record<string, unknown>, field: string) {
  if (typeof input[field] !== 'string' || !String(input[field]).trim()) {
    throw new BadRequestException(`${field} is required.`);
  }
  return String(input[field]).trim();
}

function validateLocalizedTemplate(template: LocalizedEmailTemplate, requiredVariables: readonly string[]) {
  if (emailTemplateUsesLayoutAction(template) && !template.buttonLabel?.trim()) {
    throw new BadRequestException('buttonLabel is required.');
  }
  const content = [
    template.subject,
    template.previewText,
    template.heading,
    template.greeting,
    template.body,
    template.buttonLabel,
    template.fallbackLinkInstructions,
    template.expirationNotice,
    template.securityNotice,
    template.footerExplanation,
  ].filter(Boolean).join('\n');
  const missing = missingRequiredVariables(content, requiredVariables);
  if (missing.length) throw new BadRequestException(`Template must include {{${missing[0]}}}.`);
}

function notificationTemplateShape(template: Prisma.NotificationTemplateGetPayload<Record<string, never>>) {
  const definition = notificationTemplateDefinition(template.key);
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    description: template.description ?? definition?.description ?? '',
    channelScope: template.channelScope,
    enabled: template.enabled,
    version: template.version,
    subjectEn: template.subjectEn ?? '',
    subjectFr: template.subjectFr ?? '',
    inAppTitleEn: template.inAppTitleEn,
    inAppTitleFr: template.inAppTitleFr,
    inAppBodyEn: template.inAppBodyEn,
    inAppBodyFr: template.inAppBodyFr,
    emailTitleEn: template.emailTitleEn ?? '',
    emailTitleFr: template.emailTitleFr ?? '',
    emailBodyEn: template.emailBodyEn ?? '',
    emailBodyFr: template.emailBodyFr ?? '',
    buttonLabelEn: template.buttonLabelEn ?? '',
    buttonLabelFr: template.buttonLabelFr ?? '',
    usedBy: 'AUTOMATION',
    channels: ['IN_APP', 'EMAIL'],
    languages: ['EN', 'FR'],
    placeholders: allowedNotificationTemplatePlaceholders,
    updatedAt: template.updatedAt,
    updatedById: template.updatedById,
  };
}

function notificationTemplateUpdateData(input: Record<string, unknown>): Prisma.NotificationTemplateUncheckedUpdateInput {
  const data: Prisma.NotificationTemplateUncheckedUpdateInput = { channelScope: templateChannelScope() };
  const optionalFields = ['subjectEn', 'subjectFr', 'emailTitleEn', 'emailTitleFr', 'emailBodyEn', 'emailBodyFr', 'buttonLabelEn', 'buttonLabelFr'] as const;
  const requiredFields = ['inAppTitleEn', 'inAppTitleFr', 'inAppBodyEn', 'inAppBodyFr'] as const;
  for (const field of optionalFields) {
    if (input[field] !== undefined) data[field] = nullableTemplateText(input[field], field);
  }
  for (const field of requiredFields) {
    if (input[field] !== undefined) data[field] = requiredTemplateText(input[field], field);
  }
  if (input.enabled !== undefined) data.enabled = Boolean(input.enabled);
  if (input.name !== undefined) data.name = requiredTemplateText(input.name, 'name');
  if (input.description !== undefined) data.description = nullableTemplateText(input.description, 'description');
  return data;
}

function requiredTemplateText(value: unknown, field: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new BadRequestException(`${field} is required.`);
  if (text.length > 5000) throw new BadRequestException(`${field} must be 5000 characters or fewer.`);
  return text;
}

function nullableTemplateText(value: unknown, field: string) {
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text.length > 5000) throw new BadRequestException(`${field} must be 5000 characters or fewer.`);
  return text || null;
}

function templateBodyValue(value: unknown) {
  const body = stringValue(value);
  if (!body?.trim()) throw new BadRequestException('Template body is required.');
  if (body.length > 5000) throw new BadRequestException('Template body must be 5000 characters or fewer.');
  return body;
}

function validateTemplateBody(body: string, requiredVariables: string[]) {
  const missing = missingRequiredVariables(body, requiredVariables);
  if (missing.length) throw new BadRequestException(`This template must include {{${missing[0]}}}.`);
}

function jsonStringArray(value: Prisma.JsonValue | undefined) {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === 'string');
}

function changedSettings<T extends Record<string, unknown>, K extends keyof T>(previous: T, updated: T, keys: readonly K[]) {
  return keys.reduce<Record<string, { old: unknown; new: unknown }>>((changes, key) => {
    if (previous[key] !== updated[key]) changes[String(key)] = { old: previous[key], new: updated[key] };
    return changes;
  }, {});
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  const candidate = stringValue(value);
  if (!candidate || !allowed.includes(candidate)) throw new BadRequestException(`Unsupported ${label}.`);
  return candidate;
}

function timezoneValue(value: unknown) {
  const candidate = stringValue(value);
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }).supportedValuesOf;
  const timezones = supportedValuesOf ? supportedValuesOf('timeZone') : [...fallbackTimezones];
  const allowed = new Set(['UTC', ...timezones]);
  if (!candidate || !allowed.has(candidate)) throw new BadRequestException('Unsupported timezone.');
  return candidate;
}

function requiredBoolean(value: unknown, label: string) {
  const result = booleanValue(value);
  if (typeof result !== 'boolean') throw new BadRequestException(`${label} must be a boolean.`);
  return result;
}

function optionalEmail(value: unknown) {
  const email = stringValue(value);
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Invalid email address.');
  return email.toLowerCase();
}

function hashInviteToken(token: string) {
  return createHash('sha256').update(normalizeInviteToken(token) ?? '').digest('hex');
}

function normalizeInviteToken(token: unknown) {
  return stringValue(token);
}

function inviteUrl(token: string) {
  const origin = process.env.WEB_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 3000}`;
  return `${origin.replace(/\/$/, '')}/register?invite=${encodeURIComponent(token)}`;
}

function defaultReminderSettings() {
  return {
    birthdayReminderEnabled: true,
    birthdayReminderDaysBefore: 3,
    birthdayDayNotificationEnabled: true,
    birthdayNotifyAllMembers: false,
    anniversaryReminderEnabled: true,
    anniversaryReminderDaysBefore: 3,
    anniversaryDayNotificationEnabled: true,
    birthdayReminderTemplate: '{{memberName}} has a birthday coming up in {{communityName}} on {{date}}.',
    birthdayDayTemplate: 'Happy birthday, {{memberName}}!',
    anniversaryReminderTemplate: '{{memberName}} reaches a {{years}} year membership anniversary in {{communityName}} on {{date}}.',
    anniversaryDayTemplate: '{{memberName}} reaches a {{years}} year membership anniversary today.',
    passportRemindersEnabled: false,
    passportNotifyMember: true,
    passportNotifyAdmins: true,
    passportEmailEnabled: false,
    passportFirstReminderDaysBefore: 180,
    passportSecondReminderDaysBefore: 90,
    passportFinalReminderDaysBefore: 30,
    passportDayOfReminderEnabled: true,
    passportReminderTemplate: 'Your passport is scheduled to expire on {{expirationDate}}. Please review your document details and renew it before the expiration date.',
    passportDayOfTemplate: 'Your passport expires today. Please review your document details.',
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function announcementIdFromMetadata(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return typeof metadata.announcementId === 'string' ? metadata.announcementId : null;
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(stringValue(value));
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : undefined;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthDayKey(date: Date) {
  return date.toISOString().slice(5, 10);
}

function nextAnnualDate(source: Date, now: Date) {
  const year = now.getUTCFullYear();
  let next = new Date(Date.UTC(year, source.getUTCMonth(), source.getUTCDate()));
  if (next < startOfUtcDay(now)) next = new Date(Date.UTC(year + 1, source.getUTCMonth(), source.getUTCDate()));
  return next;
}

function daysBetween(from: Date, to: Date) {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / 86_400_000);
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function applyTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(memberName|communityName|date|years)\}\}/g, (_, key: string) => values[key] ?? '');
}

function applyPassportTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(memberName|communityName|expirationDate|daysRemaining|stageLabel)\}\}/g, (_, key: string) => values[key] ?? '');
}
