import { Prisma, PrismaClient } from '@prisma/client';
import type { EmailLocale, EmailTemplateKey, LocalizedEmailTemplate } from '@pe/shared';
import { evaluateAutomationExecution } from '@pe/shared';
import { Queue, Worker } from 'bullmq';
import { createDecipheriv, createHash } from 'crypto';
import { unlink } from 'fs/promises';
import { join } from 'path';
import nodemailer from 'nodemailer';
import { createRequire } from 'module';
import { loadAutomationExecutionDecision } from './automation-lifecycle.js';

const {
  builtInEmailTemplate,
  normalizeEmailLocale,
  renderBrandedEmail,
  renderTemplateEmail,
} = createRequire(import.meta.url)('@pe/shared') as typeof import('@pe/shared');

const connection = { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
const emailQueueName = 'pe-community-email';
const notificationQueueName = 'pe-community-notifications';
const prisma = new PrismaClient();
const AUTOMATION_FAILURE_REASONS = {
  EXECUTION_ERROR: 'The automation could not be completed safely.',
} as const;
const emailQueue = new Queue(emailQueueName, { connection });
const notificationQueue = new Queue(notificationQueueName, { connection });

new Worker(
  emailQueueName,
  async (job) => {
    if (job.name !== 'send-email') return;
    const { campaignId, recipientId, locale } = job.data as { campaignId: string; recipientId: string; locale: EmailLocale };
    console.log('[email:worker] processing queued delivery');
    await sendCampaignRecipient(campaignId, recipientId, normalizeEmailLocale(locale));
  },
  { connection },
);

new Worker(
  notificationQueueName,
  async (job) => {
    if (job.name === 'chat-media-delete') {
      const { operationId } = job.data as { operationId: string };
      await deleteEncryptedChatMedia(operationId);
      return;
    }
    if (job.name === 'event-task-reminders') {
      const created = await createEventTaskReminders();
      console.log(`[notification:worker] event task reminders created=${created}`);
      return;
    }
    if (job.name === 'registration-email') {
      await createRegistrationEmail(job.data as RegistrationNotificationJob);
      return;
    }
    console.log(`[worker] processed ${job.name}`);
  },
  { connection },
);

void notificationQueue.add('event-task-reminders', {}, {
  jobId: 'event-task-reminders-hourly',
  repeat: { every: 60 * 60 * 1000 },
  removeOnComplete: 24,
  removeOnFail: 48,
}).catch((error) => {
  console.error(`[notification:worker] could not schedule event task reminders: ${error instanceof Error ? error.message : String(error)}`);
});

console.log(`[worker] listening on ${emailQueueName} and ${notificationQueueName}`);

type RegistrationNotificationJob = {
  category:
    | 'REGISTRATION_ACKNOWLEDGEMENT'
    | 'REGISTRATION_PENDING_REMINDER'
    | 'REGISTRATION_EXISTING_ACCOUNT_NOTICE'
    | 'REGISTRATION_POLICY_GUIDANCE';
  communityId: string;
  applicationId?: string;
  recipientEmail: string;
  recipientName: string;
  emailReference: string;
  noticeKey: string;
  locale: EmailLocale;
};

async function createRegistrationEmail(job: RegistrationNotificationJob) {
  const existing = await prisma.emailCampaign.findFirst({
    where: {
      communityId: job.communityId,
      type: job.category,
      metadata: { path: ['noticeKey'], equals: job.noticeKey },
    },
    select: { id: true },
  });
  if (existing) return;
  const community = await prisma.community.findUniqueOrThrow({
    where: { id: job.communityId },
    include: { settings: true },
  });
  const locale = normalizeEmailLocale(job.locale);
  const template = await resolveWorkerEmailTemplate(job.communityId, job.category, locale);
  const loginUrl = publicWebUrl('/login');
  const passwordRecoveryUrl = publicWebUrl('/forgot-password');
  const actionUrl = job.category === 'REGISTRATION_EXISTING_ACCOUNT_NOTICE'
    ? loginUrl
    : job.category === 'REGISTRATION_POLICY_GUIDANCE'
      ? passwordRecoveryUrl
      : null;
  const rendered = renderTemplateEmail(
    template,
    {
      communityName: community.name,
      recipientName: job.recipientName,
      supportEmail: community.settings?.supportContactEmail ?? '',
      loginUrl,
      passwordRecoveryUrl,
    },
    { communityName: community.name, actionUrl },
  );
  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.emailCampaign.create({
      data: {
        communityId: job.communityId,
        type: job.category,
        subject: rendered.subject,
        textBody: rendered.text,
        htmlBody: rendered.html,
        status: 'QUEUED',
        metadata: {
          noticeKey: job.noticeKey,
          emailReference: job.emailReference,
          applicationId: job.applicationId,
          category: job.category,
          templateKey: job.category,
          locale: template.locale,
        },
      },
    });
    const recipient = await tx.emailRecipient.create({
      data: {
        campaignId: created.id,
        email: job.recipientEmail,
        name: job.recipientName,
        status: 'QUEUED',
      },
    });
    return { campaignId: created.id, recipientId: recipient.id };
  });
  await emailQueue.add(
    'send-email',
    { campaignId: campaign.campaignId, recipientId: campaign.recipientId, locale: template.locale },
    {
      jobId: `registration-delivery-${job.noticeKey}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}

async function deleteEncryptedChatMedia(operationId: string) {
  const operation = await prisma.chatMediaDeletionOperation.findUnique({
    where: { id: operationId },
    include: { attachment: true },
  });
  if (!operation || operation.status === 'COMPLETED') return;

  const claimed = await prisma.chatMediaDeletionOperation.updateMany({
    where: { id: operation.id, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'PROCESSING', startedAt: new Date(), attempts: { increment: 1 }, errorCode: null },
  });
  if (!claimed.count && operation.status === 'PROCESSING') return;

  await prisma.chatAttachment.updateMany({
    where: { id: operation.attachmentId, lifecycleStatus: { not: 'DELETED' } },
    data: { lifecycleStatus: 'DELETING', deletionAttempts: { increment: 1 }, deletionError: null },
  });

  try {
    await unlink(join(chatAttachmentUploadDir(), operation.attachment.storageKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await prisma.$transaction(async (tx) => {
      const attachment = await tx.chatAttachment.findUniqueOrThrow({ where: { id: operation.attachmentId } });
      if (attachment.lifecycleStatus !== 'DELETED') {
        const usage = await tx.communityChatStorageUsage.findUnique({ where: { communityId: attachment.communityId } });
        if (usage) {
          const bytes = BigInt(attachment.encryptedSize);
          const categoryField = chatStorageCategoryField(attachment.mediaCategory);
          await tx.communityChatStorageUsage.update({
            where: { communityId: attachment.communityId },
            data: {
              totalBytes: usage.totalBytes > bytes ? usage.totalBytes - bytes : 0n,
              attachmentCount: usage.attachmentCount > 0n ? usage.attachmentCount - 1n : 0n,
              [categoryField]: usage[categoryField] > bytes ? usage[categoryField] - bytes : 0n,
            },
          });
        }
        await tx.chatAttachment.update({
          where: { id: attachment.id },
          data: {
            lifecycleStatus: 'DELETED',
            deletedAt: new Date(),
            deletionCompletedAt: new Date(),
            deletionError: null,
          },
        });
      }
      await tx.chatMediaDeletionOperation.update({
        where: { id: operation.id },
        data: { status: 'COMPLETED', completedAt: new Date(), errorCode: null },
      });
      await tx.auditLog.create({
        data: {
          communityId: operation.communityId,
          actorUserId: operation.requestedById,
          action: 'chat.media.deletion.completed',
          targetType: 'ChatAttachment',
          targetId: operation.attachmentId,
          metadata: { operationId: operation.id, encryptedSize: operation.attachment.encryptedSize },
        },
      });
    });
  } catch (error) {
    const errorCode = error instanceof Error ? error.name.slice(0, 80) : 'DELETE_FAILED';
    await prisma.$transaction([
      prisma.chatMediaDeletionOperation.update({
        where: { id: operation.id },
        data: { status: 'FAILED', errorCode },
      }),
      prisma.chatAttachment.update({
        where: { id: operation.attachmentId },
        data: { lifecycleStatus: 'DELETE_FAILED', deletionError: errorCode },
      }),
      prisma.auditLog.create({
        data: {
          communityId: operation.communityId,
          actorUserId: operation.requestedById,
          action: 'chat.media.deletion.failed',
          targetType: 'ChatAttachment',
          targetId: operation.attachmentId,
          metadata: { operationId: operation.id, errorCode },
        },
      }),
    ]);
    throw error;
  }
}

function chatAttachmentUploadDir() {
  if (process.env.UPLOADS_DIR) return join(process.env.UPLOADS_DIR, 'chat-attachments');
  return join(__dirname, '..', 'uploads', 'chat-attachments');
}

function chatStorageCategoryField(category: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER') {
  if (category === 'IMAGE') return 'imageBytes' as const;
  if (category === 'VIDEO') return 'videoBytes' as const;
  if (category === 'AUDIO') return 'audioBytes' as const;
  if (category === 'DOCUMENT') return 'documentBytes' as const;
  return 'otherBytes' as const;
}

async function createEventTaskReminders() {
  const now = new Date();
  const tasks = await prisma.eventTask.findMany({
    where: {
      archivedAt: null,
      status: { not: 'DONE' },
    },
    select: {
      id: true,
      communityId: true,
      eventId: true,
      taskBoardId: true,
      title: true,
      status: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      assignees: { where: { archivedAt: null }, select: { userId: true, user: { select: { name: true, email: true, memberships: { select: { communityId: true, status: true } } } } } },
      checklistItems: { where: { archivedAt: null }, select: { isCompleted: true, updatedAt: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      comments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
      attachments: { where: { archivedAt: null }, orderBy: { updatedAt: 'desc' }, take: 1, select: { updatedAt: true } },
      event: { select: { title: true, startsAt: true } },
      taskBoard: { select: { name: true, status: true, archivedAt: true, automationRules: { where: { enabled: true, archivedAt: null, type: { in: ['DUE_BEFORE', 'OVERDUE', 'STALE_TASK_FOLLOW_UP', 'CHECKLIST_INCOMPLETE_BEFORE_DUE', 'OVERDUE_ESCALATION'] } }, select: { id: true, type: true, config: true } } } },
      community: { select: { name: true, settings: { select: { defaultLanguage: true, timezone: true } } } },
    },
  });
  const adminRecipients = new Map<string, Array<{ id: string; name: string; email: string }>>();
  let created = 0;
  for (const task of tasks) {
    const scheduleDecision = evaluateAutomationExecution({
      boardStatus: task.taskBoard?.status ?? 'ACTIVE',
      boardArchivedAt: task.taskBoard?.archivedAt,
      eventStartsAt: task.event.startsAt,
      ruleEnabled: true,
      taskStatus: task.status,
      taskArchivedAt: null,
    }, now);
    if (!scheduleDecision.eligible) continue;
    const activeAssignees = task.assignees.filter((assignment) => assignment.user.memberships.some((membership) => membership.communityId === task.communityId && membership.status === 'ACTIVE'));
    const activeAssigneeIds = activeAssignees.map((assignment) => assignment.userId);
    const settings = task.community.settings;
    const reminderDate = dateKeyInTimeZone(now, settings?.timezone ?? 'UTC');
    const configuredRules = task.taskBoard?.automationRules ?? [];
    const lastActivityAt = automationTaskLastActivityAt(task);
    const comparableTask = { ...task, assignees: activeAssignees, lastActivityAt };
    const applicableRules = configuredRules.filter((rule) => {
      if ((rule.type === 'DUE_BEFORE' || rule.type === 'OVERDUE') && !activeAssigneeIds.length) return false;
      return automationTaskMatchesRule(rule.type, rule.config as Record<string, unknown>, comparableTask, now);
    });
    const overdue = Boolean(task.dueDate && task.dueDate.getTime() < now.getTime());
    if (activeAssigneeIds.length && task.dueDate && overdue && !configuredRules.some((rule) => rule.type === 'OVERDUE')) applicableRules.push({ id: 'default-overdue', type: 'OVERDUE', config: { notifyAssignees: true, notifyAdmins: true, repeatDaily: true } });
    if (activeAssigneeIds.length && task.dueDate && !overdue && task.dueDate.getTime() - now.getTime() <= 24 * 3_600_000 && !configuredRules.some((rule) => rule.type === 'DUE_BEFORE')) applicableRules.push({ id: 'default-due-before', type: 'DUE_BEFORE', config: { hoursBeforeDue: 24, notifyAssignees: true, notifyAdmins: false } });
    for (const rule of applicableRules) {
      const config = rule.config as Record<string, unknown>;
      const delivery = automationDeliveryConfig(config.delivery);
      const kind = automationNotificationKind(rule.type);
      const recipients = new Set<string>(config.notifyAssignees === false ? [] : activeAssigneeIds);
      const recipientUsers = new Map(activeAssignees.filter(() => config.notifyAssignees !== false).map((assignment) => [assignment.userId, { id: assignment.userId, name: assignment.user.name, email: assignment.user.email }]));
      if (config.notifyAdmins === true) {
      let adminIds = adminRecipients.get(task.communityId);
      if (!adminIds) {
        const memberships = await prisma.membership.findMany({
          where: {
            communityId: task.communityId,
            status: 'ACTIVE',
            role: {
              key: { in: ['owner', 'admin'] },
              permissions: { some: { permission: { key: 'events.read' } } },
            },
          },
          select: { userId: true, user: { select: { name: true, email: true } } },
        });
        adminIds = memberships.map((membership) => ({ id: membership.userId, name: membership.user.name, email: membership.user.email }));
        adminRecipients.set(task.communityId, adminIds);
      }
      adminIds.forEach((user) => { recipients.add(user.id); recipientUsers.set(user.id, user); });
      }
      if (!recipients.size) continue;
      const templateKey = automationTemplateKey(rule.type);
      const template = task.taskBoardId ? await prisma.notificationTemplate.findUnique({ where: { communityId_key: { communityId: task.communityId, key: templateKey as never } } }) : null;
      const fallbackCopy = automationNotificationFallbackCopy(settings?.defaultLanguage, rule.type, task.title, task.event.title, config);
      const repeatKey = automationDedupeWindow(rule.type, config, comparableTask, now, reminderDate);
      const templateVariables = automationRuleVariables(rule.type, config, comparableTask, now);
      const notificationData = delivery.channels.inApp ? Array.from(recipients).map((userId) => ({
        ...(() => {
          const rendered = template ? renderAutomationTemplate(template, settings?.defaultLanguage, {
            communityName: task.community.name,
            boardName: task.taskBoard?.name ?? task.event.title,
            eventName: task.event.title,
            taskTitle: task.title,
            taskDueDate: task.dueDate ? formatAutomationDate(task.dueDate, settings?.defaultLanguage, settings?.timezone) : '',
            ruleName: automationRuleName(rule.type, settings?.defaultLanguage),
            recipientName: recipientUsers.get(userId)?.name ?? '',
            actionUrl: delivery.includeDeepLink && task.taskBoardId ? automationTaskUrl(task.taskBoardId, task.id) : '',
            taskStatus: task.status,
            taskPriority: '',
            ...templateVariables,
          }) : null;
          return {
            title: rendered?.inAppTitle || fallbackCopy.title,
            body: rendered?.inAppBody || fallbackCopy.body,
          };
        })(),
        communityId: task.communityId,
        userId,
        type: kind,
        metadata: {
          kind,
          eventId: task.eventId,
          boardId: task.taskBoardId,
          eventTitle: task.event.title,
          boardName: task.taskBoard?.name ?? null,
          taskTitle: task.title,
          reminderDate,
          automationRuleId: rule.id.startsWith('default-') ? null : rule.id,
          templateKey,
          templateVersion: template?.version ?? null,
          templateFallbackUsed: !template,
          ...(delivery.includeDeepLink ? { taskId: task.id, tab: 'activity' } : {}),
        },
        dedupeKey: `${kind}:${rule.id}:${task.id}:${userId}:${repeatKey}`,
      })) : [];
      const persistedRuleId = rule.id.startsWith('default-') ? null : rule.id;
      const executionDecision = await loadAutomationExecutionDecision(prisma, {
        communityId: task.communityId,
        boardId: task.taskBoardId,
        ruleId: persistedRuleId,
        ruleType: rule.type,
        ruleConfig: config,
        taskId: task.id,
        now: new Date(),
      });
      if (!executionDecision.eligible) {
        if (persistedRuleId && task.taskBoardId) {
          const finishedAt = new Date();
          await prisma.$transaction(async (tx) => {
            await tx.taskBoardAutomationRun.create({ data: { communityId: task.communityId, boardId: task.taskBoardId!, ruleId: persistedRuleId, taskId: task.id, status: 'SKIPPED', mode: 'LIVE', finishedAt, summary: 'lifecycle_suppressed', details: { ruleType: rule.type, skipReason: executionDecision.reason } } });
            await tx.taskBoardAutomationRule.update({ where: { id: persistedRuleId }, data: { lastRunAt: finishedAt, lastRunStatus: 'SKIPPED', lastRunMode: 'LIVE', lastRunSummary: 'lifecycle_suppressed' } });
          });
        }
        continue;
      }
      if (rule.id.startsWith('default-') || !task.taskBoardId) {
        const result = await prisma.notification.createMany({ data: notificationData, skipDuplicates: true });
        created += result.count;
        continue;
      }
      try {
      const notificationResult = await prisma.notification.createMany({ data: notificationData, skipDuplicates: true });
      const smtpConfig = delivery.channels.email ? await effectiveConfig(task.communityId) : null;
      const emailAvailable = smtpConfig ? isUsable(smtpConfig) : false;
      const emailRecipients = Array.from(recipientUsers.values()).filter((recipient) => Boolean(recipient.email));
      let emailCampaignId: string | null = null;
      let emailQueued = 0;
      let emailSkipped = delivery.channels.email ? Math.max(0, recipients.size - emailRecipients.length) : 0;
      let emailFailed = 0;
      let lifecycleSkipReason: string | null = null;
      if (delivery.channels.email && emailAvailable && emailRecipients.length) {
        const emailLifecycle = await loadAutomationExecutionDecision(prisma, {
          communityId: task.communityId,
          boardId: task.taskBoardId,
          ruleId: rule.id,
          ruleType: rule.type,
          ruleConfig: config,
          taskId: task.id,
          now: new Date(),
        });
        if (!emailLifecycle.eligible) {
          lifecycleSkipReason = emailLifecycle.reason;
          emailSkipped += emailRecipients.length;
        } else try {
          const actionUrl = delivery.includeDeepLink ? automationTaskUrl(task.taskBoardId!, task.id) : null;
          const rendered = template ? renderAutomationTemplate(template, settings?.defaultLanguage, { communityName: task.community.name, boardName: task.taskBoard?.name ?? task.event.title, eventName: task.event.title, taskTitle: task.title, taskDueDate: task.dueDate ? formatAutomationDate(task.dueDate, settings?.defaultLanguage, settings?.timezone) : '', ruleName: automationRuleName(rule.type, settings?.defaultLanguage), recipientName: '', actionUrl: actionUrl ?? '', taskStatus: task.status, taskPriority: '', ...templateVariables }) : null;
          const emailCopy = rendered ? { subject: rendered.subject, title: rendered.emailTitle || rendered.inAppTitle, body: rendered.emailBody || rendered.inAppBody, buttonLabel: rendered.buttonLabel } : automationFallbackEmailCopy(settings?.defaultLanguage, rule.type, task.title, task.taskBoard?.name ?? task.event.title, task.dueDate, task.community.name, actionUrl, config);
          const locale = normalizeEmailLocale(settings?.defaultLanguage);
          const queued = await queueAutomationEmailCampaign({ communityId: task.communityId, type: templateKey, subject: emailCopy.subject || emailCopy.title, textBody: emailCopy.body, htmlBody: brandedAutomationEmailHtml(task.community.name, emailCopy.title || emailCopy.subject, emailCopy.body, actionUrl, emailCopy.buttonLabel, locale), recipients: emailRecipients, metadata: { boardId: task.taskBoardId!, ruleId: rule.id, taskId: task.id, mode: 'LIVE', dedupeKey: `${rule.id}:${task.id}:${repeatKey}`, templateKey, templateVersion: template?.version ?? null, templateFallbackUsed: !template, locale, source: 'AUTOMATION' } });
          emailCampaignId = queued.id;
          emailQueued = queued.duplicate ? 0 : queued.recipientCount;
          if (queued.duplicate) emailSkipped += emailRecipients.length;
        } catch { emailFailed = emailRecipients.length; }
      } else if (delivery.channels.email) emailSkipped += emailRecipients.length;
      const succeeded = notificationResult.count > 0 || emailQueued > 0;
      const failedAll = !succeeded && emailFailed > 0;
      const status = succeeded ? 'SUCCESS' : failedAll ? 'FAILED' : 'SKIPPED';
      const summary = succeeded ? 'notifications_created' : failedAll ? 'email_queue_failed' : lifecycleSkipReason ? 'lifecycle_suppressed' : delivery.channels.inApp || delivery.channels.email ? 'already_notified' : 'no_supported_delivery_channel';
      await prisma.$transaction(async (tx) => {
        await tx.taskBoardAutomationRun.create({ data: { communityId: task.communityId, boardId: task.taskBoardId!, ruleId: rule.id, taskId: task.id, status, mode: 'LIVE', finishedAt: now, summary, details: { ruleType: rule.type, taskTitle: task.title, dueDate: task.dueDate?.toISOString() ?? null, recipientCount: recipients.size, createdNotificationCount: notificationResult.count, dedupeWindow: repeatKey, delivery, deliveryChannels: [delivery.channels.inApp ? 'IN_APP' : '', delivery.channels.email ? 'EMAIL' : ''].filter(Boolean), emailAvailable, emailCampaignIds: emailCampaignId ? [emailCampaignId] : [], ...(lifecycleSkipReason ? { skipReason: lifecycleSkipReason } : {}), template: { key: templateKey, version: template?.version ?? null, fallbackUsed: !template }, results: { inApp: { attempted: delivery.channels.inApp ? recipients.size : 0, created: notificationResult.count, skipped: delivery.channels.inApp ? recipients.size - notificationResult.count : 0, failed: 0 }, email: { attempted: delivery.channels.email ? recipients.size : 0, queued: emailQueued, skipped: emailSkipped, failed: emailFailed } } } } });
        await tx.taskBoardAutomationRule.update({ where: { id: rule.id }, data: { lastRunAt: now, lastRunStatus: status, lastRunMode: 'LIVE', lastRunSummary: summary } });
      });
      created += notificationResult.count;
      } catch (error) {
        await prisma.taskBoardAutomationRun.create({ data: { communityId: task.communityId, boardId: task.taskBoardId, ruleId: rule.id, taskId: task.id, status: 'FAILED', mode: 'LIVE', finishedAt: new Date(), summary: 'execution_failed', errorCode: 'EXECUTION_ERROR', errorMessage: AUTOMATION_FAILURE_REASONS.EXECUTION_ERROR, details: { ruleType: rule.type, failureCategory: 'EXECUTION_ERROR', safeReason: AUTOMATION_FAILURE_REASONS.EXECUTION_ERROR } } }).catch(() => undefined);
        await prisma.taskBoardAutomationRule.update({ where: { id: rule.id }, data: { lastRunAt: new Date(), lastRunStatus: 'FAILED', lastRunMode: 'LIVE', lastRunSummary: 'execution_failed' } }).catch(() => undefined);
        throw error;
      }
    }
  }
  return created;
}

type AutomationTask = {
  dueDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignees: Array<unknown>;
  checklistItems: Array<{ isCompleted: boolean; updatedAt: Date }>;
  activities: Array<{ createdAt: Date }>;
  comments: Array<{ updatedAt: Date }>;
  attachments: Array<{ updatedAt: Date }>;
  lastActivityAt: Date;
};

function automationTaskLastActivityAt(task: Omit<AutomationTask, 'lastActivityAt'>) {
  return [task.createdAt, task.updatedAt, ...task.activities.map((item) => item.createdAt), ...task.comments.map((item) => item.updatedAt), ...task.attachments.map((item) => item.updatedAt), ...task.checklistItems.map((item) => item.updatedAt)]
    .reduce((latest, value) => value > latest ? value : latest, task.createdAt);
}

function automationTaskMatchesRule(type: string, config: Record<string, unknown>, task: AutomationTask, now: Date) {
  const nowMs = now.getTime();
  if (type === 'DUE_BEFORE') return Boolean(task.dueDate && task.dueDate.getTime() >= nowMs && task.dueDate.getTime() - nowMs <= Number(config.hoursBeforeDue) * 3_600_000);
  if (type === 'OVERDUE') return Boolean(task.dueDate && task.dueDate.getTime() < nowMs);
  if (type === 'STALE_TASK_FOLLOW_UP') return task.assignees.length > 0 && task.lastActivityAt.getTime() <= nowMs - Number(config.inactiveDays) * 86_400_000;
  if (type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') {
    const checklistIncomplete = task.checklistItems.length ? task.checklistItems.some((item) => !item.isCompleted) : config.requireChecklistItems === false;
    return Boolean(task.dueDate && checklistIncomplete && task.dueDate.getTime() >= nowMs && task.dueDate.getTime() - nowMs <= Number(config.hoursBeforeDue) * 3_600_000);
  }
  if (type === 'OVERDUE_ESCALATION') return Boolean(task.dueDate && task.dueDate.getTime() <= nowMs - Number(config.graceDays) * 86_400_000);
  return false;
}

function automationNotificationKind(type: string) {
  if (type === 'OVERDUE') return 'EVENT_TASK_OVERDUE';
  if (type === 'STALE_TASK_FOLLOW_UP') return 'EVENT_TASK_STALE_FOLLOW_UP';
  if (type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return 'EVENT_TASK_CHECKLIST_INCOMPLETE';
  if (type === 'OVERDUE_ESCALATION') return 'EVENT_TASK_OVERDUE_ESCALATION';
  return 'EVENT_TASK_DUE_SOON';
}

function automationTemplateKey(type: string) {
  if (type === 'OVERDUE') return 'TASK_BOARD_AUTOMATION_OVERDUE';
  if (type === 'STALE_TASK_FOLLOW_UP') return 'TASK_BOARD_AUTOMATION_STALE_TASK_FOLLOW_UP';
  if (type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return 'TASK_BOARD_AUTOMATION_CHECKLIST_INCOMPLETE_BEFORE_DUE';
  if (type === 'OVERDUE_ESCALATION') return 'TASK_BOARD_AUTOMATION_OVERDUE_ESCALATION';
  return 'TASK_BOARD_AUTOMATION_DUE_BEFORE';
}

function automationDedupeWindow(type: string, config: Record<string, unknown>, task: AutomationTask, now: Date, localDateKey: string) {
  if ((type === 'OVERDUE' || type === 'OVERDUE_ESCALATION') && config.repeatDaily === true) return localDateKey;
  if (type === 'STALE_TASK_FOLLOW_UP') return `${task.lastActivityAt.toISOString()}:${Number(config.inactiveDays)}`;
  if (type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return `${task.dueDate?.toISOString() ?? 'no-due'}:${Number(config.hoursBeforeDue)}:${task.checklistItems.filter((item) => item.isCompleted).length}:${task.checklistItems.length}`;
  if (type === 'OVERDUE_ESCALATION') return `${task.dueDate?.toISOString() ?? 'no-due'}:${Number(config.graceDays)}`;
  return task.dueDate?.toISOString() ?? now.toISOString();
}

function automationRuleVariables(type: string, config: Record<string, unknown>, task: AutomationTask, now: Date) {
  return {
    inactiveDays: type === 'STALE_TASK_FOLLOW_UP' ? String(Number(config.inactiveDays)) : '',
    lastActivityAt: task.lastActivityAt.toISOString(),
    hoursBeforeDue: type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE' ? String(Number(config.hoursBeforeDue)) : '',
    checklistDoneCount: String(task.checklistItems.filter((item) => item.isCompleted).length),
    checklistTotalCount: String(task.checklistItems.length),
    graceDays: type === 'OVERDUE_ESCALATION' ? String(Number(config.graceDays)) : '',
    daysOverdue: task.dueDate ? String(Math.max(0, Math.floor((now.getTime() - task.dueDate.getTime()) / 86_400_000))) : '0',
  };
}

function automationNotificationFallbackCopy(language: string | null | undefined, type: string, taskTitle: string, eventTitle: string, config: Record<string, unknown>) {
  if (type === 'DUE_BEFORE' || type === 'OVERDUE') return eventTaskReminderCopy(language, type === 'OVERDUE', taskTitle, eventTitle);
  const french = language === 'fr';
  if (type === 'STALE_TASK_FOLLOW_UP') return french ? { title: 'Relance de tâche nécessaire', body: `${taskTitle} est sans activité depuis ${Number(config.inactiveDays)} jours.` } : { title: 'Task follow-up needed', body: `${taskTitle} has had no activity for ${Number(config.inactiveDays)} days.` };
  if (type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return french ? { title: 'Checklist incomplète', body: `${taskTitle} a des éléments de checklist encore ouverts.` } : { title: 'Checklist incomplete', body: `${taskTitle} still has open checklist items.` };
  return french ? { title: 'Escalade de tâche en retard', body: `${taskTitle} dépasse sa période de grâce de ${Number(config.graceDays)} jours.` } : { title: 'Overdue task escalation', body: `${taskTitle} is beyond its ${Number(config.graceDays)}-day grace period.` };
}

function automationFallbackEmailCopy(language: string | null | undefined, type: string, taskTitle: string, boardName: string, dueDate: Date | null, communityName: string, actionUrl: string | null, config: Record<string, unknown>) {
  if ((type === 'DUE_BEFORE' || type === 'OVERDUE') && dueDate) return automationReminderEmailCopy(language, type === 'OVERDUE', taskTitle, boardName, dueDate, communityName, type, actionUrl);
  const copy = automationNotificationFallbackCopy(language, type, taskTitle, boardName, config);
  const body = [copy.body, `${language === 'fr' ? 'Communauté' : 'Community'}: ${communityName}`, `${language === 'fr' ? 'Tableau' : 'Board'}: ${boardName}`, ...(actionUrl ? ['', actionUrl] : [])].join('\n');
  return { subject: copy.title, title: copy.title, body, buttonLabel: language === 'fr' ? 'Ouvrir la tâche' : 'Open task' };
}

function automationDeliveryConfig(value: unknown) {
  const delivery = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const channels = delivery.channels && typeof delivery.channels === 'object' && !Array.isArray(delivery.channels) ? delivery.channels as Record<string, unknown> : {};
  return {
    channels: { inApp: channels.inApp !== false, email: channels.email === true },
    includeDeepLink: delivery.includeDeepLink !== false,
    dedupeEnabled: true,
  };
}

async function queueAutomationEmailCampaign(input: { communityId: string; type: string; subject: string; textBody: string; htmlBody?: string | null; recipients: Array<{ id: string; name: string; email: string }>; metadata: { boardId: string; ruleId: string; taskId: string; mode: string; dedupeKey: string; templateKey?: string; templateVersion?: number | null; templateFallbackUsed?: boolean; locale?: string; source?: string } }) {
  const existing = await prisma.emailCampaign.findFirst({ where: { communityId: input.communityId, type: input.type, metadata: { path: ['dedupeKey'], equals: input.metadata.dedupeKey } }, select: { id: true } });
  if (existing) return { id: existing.id, recipientCount: input.recipients.length, duplicate: true };
  const campaign = await prisma.$transaction(async (tx) => {
    const created = await tx.emailCampaign.create({ data: { communityId: input.communityId, type: input.type, subject: input.subject, textBody: input.textBody, htmlBody: input.htmlBody, status: 'QUEUED', metadata: input.metadata } });
    await tx.emailRecipient.createMany({ data: input.recipients.map((recipient) => ({ campaignId: created.id, userId: recipient.id, email: recipient.email, name: recipient.name, status: 'QUEUED' })) });
    return tx.emailCampaign.findUniqueOrThrow({ where: { id: created.id }, include: { recipients: true } });
  });
  const locale = normalizeEmailLocale(input.metadata.locale);
  for (const recipient of campaign.recipients) await emailQueue.add('send-email', { campaignId: campaign.id, recipientId: recipient.id, locale }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  return { id: campaign.id, recipientCount: campaign.recipients.length, duplicate: false };
}

function automationReminderEmailCopy(language: string | null | undefined, overdue: boolean, taskTitle: string, boardName: string, dueDate: Date, communityName: string, ruleType: string, actionUrl: string | null) {
  const french = language === 'fr';
  const ruleName = overdue ? (french ? 'Notifier lorsqu’une tâche est en retard' : 'Notify when a task is overdue') : (french ? 'Notifier avant la date limite' : 'Notify before due date');
  const formattedDueDate = new Intl.DateTimeFormat(french ? 'fr-FR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(dueDate);
  const subject = overdue ? (french ? `Tâche en retard : ${taskTitle}` : `Overdue task: ${taskTitle}`) : (french ? `Rappel de tâche : ${taskTitle}` : `Task reminder: ${taskTitle}`);
  const lines = french
    ? [overdue ? `${taskTitle} est en retard.` : `${taskTitle} est prévue le ${formattedDueDate}.`, `Communauté : ${communityName}`, `Tableau : ${boardName}`, `Règle : ${ruleName}`]
    : [overdue ? `${taskTitle} is overdue.` : `${taskTitle} is due on ${formattedDueDate}.`, `Community: ${communityName}`, `Board: ${boardName}`, `Rule: ${ruleName}`];
  if (actionUrl) lines.push('', actionUrl);
  return { subject, title: subject, body: lines.join('\n'), buttonLabel: french ? 'Ouvrir la tâche' : 'Open task', ruleType };
}

function renderAutomationTemplate(template: { subjectEn: string | null; subjectFr: string | null; inAppTitleEn: string; inAppTitleFr: string; inAppBodyEn: string; inAppBodyFr: string; emailTitleEn: string | null; emailTitleFr: string | null; emailBodyEn: string | null; emailBodyFr: string | null; buttonLabelEn: string | null; buttonLabelFr: string | null }, language: string | null | undefined, variables: Record<string, string>) {
  const requested = automationTemplateVariant(template, language === 'fr' ? 'fr' : 'en');
  const english = automationTemplateVariant(template, 'en');
  const variant = completeAutomationVariant(requested) ? requested : completeAutomationVariant(english) ? english : null;
  if (!variant) throw new Error('Automation email template has no complete localized variant.');
  return {
    subject: renderTemplateText(variant.subject, variables),
    inAppTitle: renderTemplateText(variant.inAppTitle, variables),
    inAppBody: renderTemplateText(variant.inAppBody, variables),
    emailTitle: renderTemplateText(variant.emailTitle, variables),
    emailBody: renderTemplateText(variant.emailBody, variables),
    buttonLabel: renderTemplateText(variant.buttonLabel, variables),
  };
}

function automationTemplateVariant(
  template: Parameters<typeof renderAutomationTemplate>[0],
  locale: EmailLocale,
) {
  return locale === 'fr'
    ? { subject: template.subjectFr ?? '', inAppTitle: template.inAppTitleFr, inAppBody: template.inAppBodyFr, emailTitle: template.emailTitleFr ?? '', emailBody: template.emailBodyFr ?? '', buttonLabel: template.buttonLabelFr ?? '' }
    : { subject: template.subjectEn ?? '', inAppTitle: template.inAppTitleEn, inAppBody: template.inAppBodyEn, emailTitle: template.emailTitleEn ?? '', emailBody: template.emailBodyEn ?? '', buttonLabel: template.buttonLabelEn ?? '' };
}

function completeAutomationVariant(variant: ReturnType<typeof automationTemplateVariant>) {
  return Object.values(variant).every((value) => value.trim().length > 0);
}

function renderTemplateText(value: string, variables: Record<string, string>) {
  return value.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? '');
}

function formatAutomationDate(date: Date, language?: string | null, timeZone?: string | null) {
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timeZone || 'UTC' }).format(date);
}

function automationRuleName(type: string, language?: string | null) {
  const french = language === 'fr';
  if (type === 'OVERDUE') return french ? 'Notifier lorsqu’une tâche est en retard' : 'Notify when task is overdue';
  if (type === 'STALE_TASK_FOLLOW_UP') return french ? 'Relancer les tâches inactives' : 'Follow up on stale tasks';
  if (type === 'CHECKLIST_INCOMPLETE_BEFORE_DUE') return french ? 'Checklist incomplète avant échéance' : 'Checklist incomplete before due';
  if (type === 'OVERDUE_ESCALATION') return french ? 'Escalader les tâches en retard' : 'Escalate overdue tasks';
  return french ? 'Notifier avant la date limite' : 'Notify before due date';
}

function brandedAutomationEmailHtml(
  communityName: string,
  title: string,
  body: string,
  actionUrl?: string | null,
  buttonLabel?: string | null,
  locale: EmailLocale = 'en',
) {
  return renderBrandedEmail({
    subject: title,
    title,
    body,
    communityName,
    locale,
    action: actionUrl ? { label: buttonLabel || (locale === 'fr' ? 'Ouvrir le lien' : 'Open link'), url: actionUrl } : null,
    align: 'left',
    eyebrow: locale === 'fr' ? 'Automatisation' : 'Automation',
  }).html;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

function automationTaskUrl(boardId: string, taskId: string) {
  return `${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')}/admin/task-boards/${boardId}?section=board&taskId=${encodeURIComponent(taskId)}&tab=activity`;
}

function eventTaskReminderCopy(language: string | null | undefined, overdue: boolean, taskTitle: string, eventTitle: string) {
  if (language === 'fr') {
    return overdue
      ? { title: 'Tâche d’événement en retard', body: `« ${taskTitle} » est en retard pour « ${eventTitle} ».` }
      : { title: 'Tâche d’événement bientôt due', body: `« ${taskTitle} » arrive bientôt à échéance pour « ${eventTitle} ».` };
  }
  return overdue
    ? { title: 'Event task overdue', body: `“${taskTitle}” is overdue for “${eventTitle}”.` }
    : { title: 'Event task due soon', body: `“${taskTitle}” is due soon for “${eventTitle}”.` };
}

function dateKeyInTimeZone(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const value = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

type WorkerTemplateRecord = Prisma.CommunityMessageTemplateGetPayload<Record<string, never>>;

async function resolveWorkerEmailTemplate(
  communityId: string,
  key: RegistrationNotificationJob['category'],
  requestedLocale: EmailLocale,
): Promise<LocalizedEmailTemplate> {
  const records = await prisma.communityMessageTemplate.findMany({
    where: { communityId, key, locale: { in: [requestedLocale, 'en'] } },
  });
  const requested = records.find((record) => record.locale === requestedLocale);
  if (requested && completeWorkerTemplate(requested, key, requestedLocale)) return workerTemplateRecord(requested, key);
  const english = records.find((record) => record.locale === 'en');
  if (english && completeWorkerTemplate(english, key, 'en')) return workerTemplateRecord(english, key);
  console.warn(`[email:worker] complete template fallback key=${key} locale=${requestedLocale}`);
  return builtInEmailTemplate(key, 'en');
}

function completeWorkerTemplate(
  record: WorkerTemplateRecord,
  key: RegistrationNotificationJob['category'],
  locale: EmailLocale,
) {
  const required = builtInEmailTemplate(key, locale);
  return Boolean(
    record.subject.trim()
    && record.heading.trim()
    && record.body.trim()
    && (!required.greeting || record.greeting?.trim())
    && (!required.buttonLabel || record.buttonLabel?.trim())
    && (!required.fallbackLinkInstructions || record.fallbackLinkInstructions?.trim())
    && (!required.securityNotice || record.securityNotice?.trim())
    && (!required.footerExplanation || record.footerExplanation?.trim()),
  );
}

function workerTemplateRecord(
  record: WorkerTemplateRecord,
  key: RegistrationNotificationJob['category'],
): LocalizedEmailTemplate {
  const locale = normalizeEmailLocale(record.locale);
  const definition = builtInEmailTemplate(key, locale);
  return {
    templateKey: key as EmailTemplateKey,
    locale,
    subject: record.subject,
    previewText: record.previewText,
    heading: record.heading,
    greeting: record.greeting,
    body: record.body,
    buttonLabel: record.buttonLabel,
    fallbackLinkInstructions: record.fallbackLinkInstructions,
    expirationNotice: record.expirationNotice,
    securityNotice: record.securityNotice,
    footerExplanation: record.footerExplanation,
    variables: definition.variables,
    requiredVariables: definition.requiredVariables,
  };
}

function publicWebUrl(pathname: string) {
  return new URL(pathname, process.env.WEB_ORIGIN ?? 'http://localhost:3000').toString();
}

async function sendCampaignRecipient(campaignId: string, recipientId: string, queuedLocale: EmailLocale) {
  const recipient = await prisma.emailRecipient.findUnique({ where: { id: recipientId }, include: { campaign: true } });
  if (!recipient || recipient.campaignId !== campaignId) return;
  const storedLocale = campaignMetadataLocale(recipient.campaign.metadata);
  if (storedLocale && storedLocale !== queuedLocale) {
    throw new Error('Queued email locale does not match the stored campaign locale.');
  }
  if (recipient.campaign.status === 'CANCELED' || !['PENDING', 'QUEUED'].includes(recipient.status)) {
    console.log(`[email:worker] skipped delivery with status=${recipient.status}`);
    await updateCampaignStatus(campaignId);
    return;
  }
  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } });
  try {
    const config = await effectiveConfig(recipient.campaign.communityId);
    if (!isUsable(config)) throw new Error('SMTP email delivery is not configured.');
    const result = await sendSmtp(config, recipient.email, recipient.campaign.subject, recipient.campaign.textBody, recipient.campaign.htmlBody);
    await prisma.emailRecipient.update({ where: { id: recipient.id }, data: { status: 'SENT', sentAt: new Date(), errorMessage: null } });
    await prisma.emailDeliveryAttempt.create({ data: { campaignId, recipientId, status: 'SENT', providerMessageId: result.messageId } });
    console.log('[email:worker] delivery accepted');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed.';
    await prisma.emailRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED', errorMessage: message } });
    await prisma.emailDeliveryAttempt.create({ data: { campaignId, recipientId, status: 'FAILED', errorMessage: message } });
    console.error('[email:worker] delivery failed');
    throw error;
  } finally {
    await updateCampaignStatus(campaignId);
  }
}

function campaignMetadataLocale(metadata: Prisma.JsonValue): EmailLocale | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return metadata.locale === 'fr' || metadata.locale === 'en' ? metadata.locale : null;
}

async function effectiveConfig(communityId: string) {
  const settings = await prisma.communityEmailSettings.findUnique({ where: { communityId } });
  if (settings?.enabled) {
    return {
      enabled: true,
      host: settings.smtpHost ?? undefined,
      port: settings.smtpPort ?? undefined,
      username: settings.smtpUsername ?? undefined,
      password: settings.smtpPasswordEncrypted ? decryptSecret(settings.smtpPasswordEncrypted) : undefined,
      secure: settings.smtpSecure,
      fromEmail: settings.fromEmail ?? undefined,
      fromName: settings.fromName ?? undefined,
    };
  }
  const port = Number(process.env.SMTP_PORT ?? '587');
  return {
    enabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM_EMAIL),
    host: process.env.SMTP_HOST,
    port: Number.isFinite(port) ? port : 587,
    username: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    secure: process.env.SMTP_SECURE === 'true',
    fromEmail: process.env.SMTP_FROM_EMAIL,
    fromName: process.env.SMTP_FROM_NAME,
  };
}

function isUsable(config: Awaited<ReturnType<typeof effectiveConfig>>) {
  return Boolean(config.enabled && config.host && config.port && config.fromEmail && (!config.username || config.password) && (config.port !== 465 || config.secure));
}

async function sendSmtp(config: Awaited<ReturnType<typeof effectiveConfig>>, to: string, subject: string, text: string, html?: string | null) {
  if (process.env.NODE_ENV !== 'production' && process.env.EMAIL_DEV_LOG === 'true') {
    console.log('[email:dev] delivery suppressed');
    return { messageId: `dev-${Date.now()}` };
  }
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: config.password ?? '' } : undefined,
  });
  const from = config.fromName ? `"${config.fromName.replace(/"/g, '')}" <${config.fromEmail}>` : config.fromEmail;
  const result = await transport.sendMail({ from, to, subject, text, html: html ?? undefined });
  const accepted = (result.accepted ?? []).map(String);
  const rejected = (result.rejected ?? []).map(String);
  if (!accepted.includes(to) || rejected.includes(to)) {
    throw new Error(`SMTP provider did not accept recipient ${to}.`);
  }
  return { messageId: result.messageId };
}

async function updateCampaignStatus(campaignId: string) {
  const recipients = await prisma.emailRecipient.findMany({ where: { campaignId } });
  const sent = recipients.filter((recipient) => recipient.status === 'SENT').length;
  const failed = recipients.filter((recipient) => recipient.status === 'FAILED').length;
  const pending = recipients.filter((recipient) => recipient.status === 'PENDING' || recipient.status === 'QUEUED').length;
  const canceled = recipients.filter((recipient) => recipient.status === 'CANCELED').length;
  const status = pending > 0 ? 'SENDING' : failed > 0 && sent > 0 ? 'PARTIAL' : failed > 0 ? 'FAILED' : canceled > 0 && sent > 0 ? 'PARTIAL' : canceled > 0 ? 'CANCELED' : 'SENT';
  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status, sentAt: pending === 0 ? new Date() : undefined } });
}

function encryptionKey() {
  const secret = encryptionSecret();
  return createHash('sha256').update(secret).digest();
}

function encryptionSecret() {
  const configured = [process.env.EMAIL_ENCRYPTION_KEY, process.env.JWT_SECRET]
    .find((value) => value?.trim() && value !== '<generate-a-strong-independent-secret>');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('EMAIL_ENCRYPTION_KEY or JWT_SECRET is required in production.');
  }
  return 'local-development-secret-change-before-production';
}

function decryptSecret(value: string) {
  if (!value.startsWith('v1:')) return value;
  const [, ivRaw, tagRaw, encryptedRaw] = value.split(':');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
}
