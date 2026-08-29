import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { evaluateAutomationExecution } from '@pe/shared';
import { EventTaskActivityType, EventTaskStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { eventTaskAttachmentUploadDir } from '../uploads';
import { EventTasksRealtimeGateway } from './event-tasks-realtime.gateway';

const collaborationUserSelect = (communityId: string) => Prisma.validator<Prisma.UserSelect>()({
  id: true,
  name: true,
  memberships: {
    where: { communityId },
    select: {
      role: { select: { key: true } },
      profile: { select: { avatarUrl: true, dicebearStyle: true, dicebearSeed: true } },
    },
    take: 1,
  },
});

type ActivityInput = {
  type: EventTaskActivityType;
  metadata?: Prisma.InputJsonObject;
};

export type UploadedEventTaskAttachmentFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

const maxAttachmentSize = 10 * 1024 * 1024;
const allowedAttachmentTypes = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed',
]);

@Injectable()
export class EventTaskCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: EventTasksRealtimeGateway,
  ) {}

  async activity(communityId: string, eventId: string, taskId: string) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const activity = await this.prisma.eventTaskActivity.findMany({
      where: { communityId, eventId, taskId },
      include: { actor: { select: collaborationUserSelect(communityId) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { activity: activity.map(eventTaskActivityShape) };
  }

  async comments(communityId: string, eventId: string, taskId: string, currentUserId: string, canArchiveAny: boolean) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const comments = await this.prisma.eventTaskComment.findMany({
      where: { communityId, eventId, taskId, archivedAt: null },
      include: { author: { select: collaborationUserSelect(communityId) } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return { comments: comments.map((comment) => eventTaskCommentShape(comment, currentUserId, canArchiveAny)) };
  }

  async addComment(communityId: string, eventId: string, taskId: string, authorId: string, rawBody: unknown) {
    const body = commentBody(rawBody);
    const comment = await this.prisma.$transaction(async (tx) => {
      const task = await tx.eventTask.findFirst({
        where: { id: taskId, communityId, eventId, archivedAt: null },
        select: { id: true, eventId: true, title: true, taskBoardId: true, taskBoard: { select: { name: true } }, assignees: { where: { archivedAt: null }, select: { userId: true } }, event: { select: { title: true } } },
      });
      if (!task) throw new NotFoundException('Event task not found.');
      const created = await tx.eventTaskComment.create({
        data: { communityId, eventId, taskId, authorId, body },
        include: { author: { select: collaborationUserSelect(communityId) } },
      });
      await this.recordActivity(tx, communityId, eventId, taskId, authorId, [{ type: EventTaskActivityType.COMMENT_ADDED, metadata: { commentId: created.id } }]);
      await this.createCommentNotifications(tx, communityId, task, created.id, authorId, created.author.name);
      return created;
    });
    this.emitCollaborationChanged(communityId, eventId, taskId, 'comment-added');
    return eventTaskCommentShape(comment, authorId, false);
  }

  async archiveComment(communityId: string, eventId: string, taskId: string, commentId: string, actorId: string, canArchiveAny: boolean) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const comment = await this.prisma.eventTaskComment.findFirst({ where: { id: commentId, communityId, eventId, taskId, archivedAt: null } });
    if (!comment) throw new NotFoundException('Event task comment not found.');
    if (!canArchiveAny && comment.authorId !== actorId) throw new ForbiddenException('Only the comment author can archive this comment.');
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventTaskComment.update({ where: { id: comment.id }, data: { archivedAt } });
      await this.recordActivity(tx, communityId, eventId, taskId, actorId, [{ type: EventTaskActivityType.COMMENT_ARCHIVED, metadata: { commentId: comment.id } }]);
    });
    this.emitCollaborationChanged(communityId, eventId, taskId, 'comment-archived');
    return { id: comment.id, archivedAt };
  }

  async recordActivity(tx: Prisma.TransactionClient, communityId: string, eventId: string, taskId: string, actorId: string | null, entries: ActivityInput[]) {
    if (!entries.length) return;
    await tx.eventTaskActivity.createMany({
      data: entries.map((entry) => ({ communityId, eventId, taskId, actorId, type: entry.type, metadata: entry.metadata })),
    });
  }

  async attachments(communityId: string, eventId: string, taskId: string, currentUserId: string, canRemoveAny: boolean) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const attachments = await this.prisma.eventTaskAttachment.findMany({
      where: { communityId, eventId, taskId, archivedAt: null },
      include: { uploader: { select: collaborationUserSelect(communityId) } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { attachments: attachments.map((attachment) => eventTaskAttachmentShape(attachment, currentUserId, canRemoveAny)) };
  }

  async addAttachments(communityId: string, eventId: string, taskId: string, uploaderId: string, files: UploadedEventTaskAttachmentFile[]) {
    const task = await this.requireActiveTask(communityId, eventId, taskId);
    if (!files.length) throw new BadRequestException('At least one attachment is required.');
    if (files.length > 3) throw new BadRequestException('A maximum of 3 attachments can be uploaded at once.');
    const prepared = files.map(validateAttachmentFile);
    const uploadDir = eventTaskAttachmentUploadDir();
    await mkdir(uploadDir, { recursive: true });
    const writtenKeys: string[] = [];
    try {
      for (const file of prepared) {
        await writeFile(join(uploadDir, file.storageKey), file.buffer);
        writtenKeys.push(file.storageKey);
      }
      const attachments = await this.prisma.$transaction(async (tx) => {
        const created = [];
        for (const file of prepared) {
          created.push(await tx.eventTaskAttachment.create({
            data: { communityId, eventId, taskId, uploaderId, originalName: file.originalName, storageKey: file.storageKey, mimeType: file.mimeType, sizeBytes: file.sizeBytes },
            include: { uploader: { select: collaborationUserSelect(communityId) } },
          }));
        }
        await this.recordActivity(tx, communityId, eventId, taskId, uploaderId, [{
          type: EventTaskActivityType.ATTACHMENT_ADDED,
          metadata: { count: created.length, files: created.map((attachment) => ({ attachmentId: attachment.id, fileName: attachment.originalName, sizeBytes: attachment.sizeBytes, mimeType: attachment.mimeType })) },
        }]);
        await this.createAttachmentNotifications(tx, communityId, task, created, uploaderId, 'EVENT_TASK_ATTACHMENT_ADDED');
        return created;
      });
      this.emitCollaborationChanged(communityId, eventId, taskId, 'attachment-added');
      return { attachments: attachments.map((attachment) => eventTaskAttachmentShape(attachment, uploaderId, false)) };
    } catch (error) {
      await Promise.all(writtenKeys.map((storageKey) => unlink(join(uploadDir, storageKey)).catch(() => undefined)));
      throw error;
    }
  }

  async attachmentDownload(communityId: string, eventId: string, taskId: string, attachmentId: string) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const attachment = await this.prisma.eventTaskAttachment.findFirst({ where: { id: attachmentId, communityId, eventId, taskId, archivedAt: null } });
    if (!attachment) throw new NotFoundException('Event task attachment not found.');
    const buffer = await readFile(join(eventTaskAttachmentUploadDir(), attachment.storageKey)).catch(() => { throw new NotFoundException('Attachment file not found.'); });
    return { buffer, originalName: attachment.originalName, mimeType: attachment.mimeType };
  }

  async archiveAttachment(communityId: string, eventId: string, taskId: string, attachmentId: string, actorId: string, canRemoveAny: boolean) {
    const task = await this.requireActiveTask(communityId, eventId, taskId);
    const attachment = await this.prisma.eventTaskAttachment.findFirst({ where: { id: attachmentId, communityId, eventId, taskId, archivedAt: null } });
    if (!attachment) throw new NotFoundException('Event task attachment not found.');
    if (!canRemoveAny && attachment.uploaderId !== actorId) throw new ForbiddenException('Only the attachment uploader can remove this attachment.');
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventTaskAttachment.update({ where: { id: attachment.id }, data: { archivedAt } });
      await this.recordActivity(tx, communityId, eventId, taskId, actorId, [{
        type: EventTaskActivityType.ATTACHMENT_ARCHIVED,
        metadata: { attachmentId: attachment.id, fileName: attachment.originalName, sizeBytes: attachment.sizeBytes, mimeType: attachment.mimeType },
      }]);
      await this.createAttachmentNotifications(tx, communityId, task, [attachment], actorId, 'EVENT_TASK_ATTACHMENT_REMOVED');
    });
    this.emitCollaborationChanged(communityId, eventId, taskId, 'attachment-archived');
    return { id: attachment.id, archivedAt };
  }

  async checklist(communityId: string, eventId: string, taskId: string, currentUserId: string, canManageAny: boolean, canMutateTask: boolean) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const items = await this.prisma.eventTaskChecklistItem.findMany({
      where: { communityId, eventId, taskId, archivedAt: null },
      include: {
        createdBy: { select: collaborationUserSelect(communityId) },
        completedBy: { select: collaborationUserSelect(communityId) },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return { checklist: items.map((item) => eventTaskChecklistItemShape(item, currentUserId, canManageAny, canMutateTask)), canReorder: canManageAny };
  }

  async addChecklistItem(communityId: string, eventId: string, taskId: string, actorId: string, rawTitle: unknown, canManageAny: boolean) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const title = checklistItemTitle(rawTitle);
    const item = await this.prisma.$transaction(async (tx) => {
      const highestOrder = await tx.eventTaskChecklistItem.aggregate({ where: { communityId, eventId, taskId, archivedAt: null }, _max: { sortOrder: true } });
      const created = await tx.eventTaskChecklistItem.create({
        data: { communityId, eventId, taskId, title, createdById: actorId, sortOrder: (highestOrder._max.sortOrder ?? -1) + 1 },
        include: { createdBy: { select: collaborationUserSelect(communityId) }, completedBy: { select: collaborationUserSelect(communityId) } },
      });
      await this.recordActivity(tx, communityId, eventId, taskId, actorId, [{ type: EventTaskActivityType.CHECKLIST_ITEM_ADDED, metadata: { checklistItemId: created.id, title } }]);
      return created;
    });
    this.emitCollaborationChanged(communityId, eventId, taskId, 'checklist-added');
    return eventTaskChecklistItemShape(item, actorId, canManageAny, true);
  }

  async updateChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, actorId: string, rawTitle: unknown, canManageAny: boolean) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const title = checklistItemTitle(rawTitle);
    const existing = await this.requireChecklistItem(communityId, eventId, taskId, itemId);
    if (!canManageAny && existing.createdById !== actorId) throw new ForbiddenException('Only the checklist item creator can edit this item.');
    if (existing.title === title) return this.checklistItemById(communityId, itemId, actorId, canManageAny, true);
    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventTaskChecklistItem.update({
        where: { id: existing.id }, data: { title },
        include: { createdBy: { select: collaborationUserSelect(communityId) }, completedBy: { select: collaborationUserSelect(communityId) } },
      });
      await this.recordActivity(tx, communityId, eventId, taskId, actorId, [{ type: EventTaskActivityType.CHECKLIST_ITEM_UPDATED, metadata: { checklistItemId: existing.id, title } }]);
      return updated;
    });
    this.emitCollaborationChanged(communityId, eventId, taskId, 'checklist-updated');
    return eventTaskChecklistItemShape(item, actorId, canManageAny, true);
  }

  async toggleChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, actorId: string, canManageAny: boolean) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const existing = await this.requireChecklistItem(communityId, eventId, taskId, itemId);
    const isCompleted = !existing.isCompleted;
    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.eventTaskChecklistItem.update({
        where: { id: existing.id },
        data: { isCompleted, completedAt: isCompleted ? new Date() : null, completedById: isCompleted ? actorId : null },
        include: { createdBy: { select: collaborationUserSelect(communityId) }, completedBy: { select: collaborationUserSelect(communityId) } },
      });
      await this.recordActivity(tx, communityId, eventId, taskId, actorId, [{
        type: isCompleted ? EventTaskActivityType.CHECKLIST_ITEM_COMPLETED : EventTaskActivityType.CHECKLIST_ITEM_REOPENED,
        metadata: { checklistItemId: existing.id, title: existing.title, from: existing.isCompleted, to: isCompleted },
      }]);
      if (isCompleted) {
        const task = await tx.eventTask.findFirst({
          where: { id: taskId, communityId, eventId, archivedAt: null, status: { not: EventTaskStatus.DONE } },
          select: { status: true, archivedAt: true, taskBoardId: true, title: true, event: { select: { startsAt: true } }, taskBoard: { select: { status: true, archivedAt: true, automationRules: { where: { type: 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', enabled: true, archivedAt: null }, select: { id: true, config: true, enabled: true, archivedAt: true } } } } },
        });
        const rule = task?.taskBoard?.automationRules[0];
        if (task && rule) {
          const lifecycle = evaluateAutomationExecution({
            boardStatus: task.taskBoard?.status ?? 'ACTIVE',
            boardArchivedAt: task.taskBoard?.archivedAt,
            eventStartsAt: task.event.startsAt,
            ruleEnabled: rule.enabled,
            ruleArchivedAt: rule.archivedAt,
            taskStatus: task.status,
            taskArchivedAt: task.archivedAt,
          });
          if (!lifecycle.eligible) {
            const finishedAt = new Date();
            if (task.taskBoardId) await tx.taskBoardAutomationRun.create({ data: { communityId, boardId: task.taskBoardId, ruleId: rule.id, taskId, status: 'SKIPPED', mode: 'LIVE', finishedAt, summary: 'lifecycle_suppressed', details: { ruleType: 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', taskTitle: task.title, skipReason: lifecycle.reason } } });
            await tx.taskBoardAutomationRule.update({ where: { id: rule.id }, data: { lastRunAt: finishedAt, lastRunStatus: 'SKIPPED', lastRunMode: 'LIVE', lastRunSummary: 'lifecycle_suppressed' } });
            return updated;
          }
          const checklist = await tx.eventTaskChecklistItem.findMany({ where: { communityId, eventId, taskId, archivedAt: null }, select: { isCompleted: true } });
          const config = rule.config as Record<string, unknown>;
          const hasRequiredItems = config.requireAtLeastOneChecklistItem === false || checklist.length > 0;
          if (hasRequiredItems && checklist.length > 0 && checklist.every((entry) => entry.isCompleted)) {
            await tx.eventTask.update({ where: { id: taskId }, data: { status: EventTaskStatus.DONE } });
            await this.recordActivity(tx, communityId, eventId, taskId, actorId, [{ type: EventTaskActivityType.STATUS_CHANGED, metadata: { ruleId: rule.id, ruleType: 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', from: task.status, to: EventTaskStatus.DONE, automation: true } }]);
            const finishedAt = new Date();
            if (task.taskBoardId) await tx.taskBoardAutomationRun.create({ data: { communityId, boardId: task.taskBoardId, ruleId: rule.id, taskId, status: 'SUCCESS', mode: 'LIVE', finishedAt, summary: 'task_auto_completed', details: { ruleType: 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', taskTitle: task.title, fromStatus: task.status, toStatus: EventTaskStatus.DONE, checklistCompleted: checklist.length, checklistTotal: checklist.length } } });
            await tx.taskBoardAutomationRule.update({ where: { id: rule.id }, data: { lastRunAt: finishedAt, lastRunStatus: 'SUCCESS', lastRunMode: 'LIVE', lastRunSummary: 'task_auto_completed' } });
          } else if (task.taskBoardId) {
            const finishedAt = new Date();
            await tx.taskBoardAutomationRun.create({ data: { communityId, boardId: task.taskBoardId, ruleId: rule.id, taskId, status: 'SKIPPED', mode: 'LIVE', finishedAt, summary: 'checklist_incomplete', details: { ruleType: 'AUTO_COMPLETE_WHEN_CHECKLIST_DONE', taskTitle: task.title, checklistCompleted: checklist.filter((entry) => entry.isCompleted).length, checklistTotal: checklist.length } } });
            await tx.taskBoardAutomationRule.update({ where: { id: rule.id }, data: { lastRunAt: finishedAt, lastRunStatus: 'SKIPPED', lastRunMode: 'LIVE', lastRunSummary: 'checklist_incomplete' } });
          }
        }
      }
      return updated;
    });
    this.emitCollaborationChanged(communityId, eventId, taskId, 'checklist-toggled');
    return eventTaskChecklistItemShape(item, actorId, canManageAny, true);
  }

  async reorderChecklist(communityId: string, eventId: string, taskId: string, actorId: string, rawItemIds: unknown) {
    await this.requireActiveTask(communityId, eventId, taskId);
    if (!Array.isArray(rawItemIds) || rawItemIds.some((id) => typeof id !== 'string')) throw new BadRequestException('Checklist order is invalid.');
    const itemIds = rawItemIds as string[];
    if (new Set(itemIds).size !== itemIds.length) throw new BadRequestException('Checklist order contains duplicate items.');
    const existing = await this.prisma.eventTaskChecklistItem.findMany({ where: { communityId, eventId, taskId, archivedAt: null }, select: { id: true, sortOrder: true } });
    if (existing.length !== itemIds.length || existing.some((item) => !itemIds.includes(item.id))) throw new BadRequestException('Checklist order must include every active item.');
    const changed = existing.some((item) => itemIds.indexOf(item.id) !== item.sortOrder);
    if (!changed) return { checklist: itemIds };
    await this.prisma.$transaction(async (tx) => {
      await Promise.all(itemIds.map((id, sortOrder) => tx.eventTaskChecklistItem.update({ where: { id }, data: { sortOrder } })));
      await this.recordActivity(tx, communityId, eventId, taskId, actorId, [{ type: EventTaskActivityType.CHECKLIST_REORDERED, metadata: { count: itemIds.length } }]);
    });
    this.emitCollaborationChanged(communityId, eventId, taskId, 'checklist-reordered');
    return { checklist: itemIds };
  }

  async archiveChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string, actorId: string, canManageAny: boolean) {
    await this.requireActiveTask(communityId, eventId, taskId);
    const existing = await this.requireChecklistItem(communityId, eventId, taskId, itemId);
    if (!canManageAny && existing.createdById !== actorId) throw new ForbiddenException('Only the checklist item creator can remove this item.');
    const archivedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.eventTaskChecklistItem.update({ where: { id: existing.id }, data: { archivedAt } });
      await this.recordActivity(tx, communityId, eventId, taskId, actorId, [{ type: EventTaskActivityType.CHECKLIST_ITEM_ARCHIVED, metadata: { checklistItemId: existing.id, title: existing.title } }]);
    });
    this.emitCollaborationChanged(communityId, eventId, taskId, 'checklist-archived');
    return { id: existing.id, archivedAt };
  }

  private requireChecklistItem(communityId: string, eventId: string, taskId: string, itemId: string) {
    return this.prisma.eventTaskChecklistItem.findFirst({ where: { id: itemId, communityId, eventId, taskId, archivedAt: null } }).then((item) => {
      if (!item) throw new NotFoundException('Checklist item not found.');
      return item;
    });
  }

  private async checklistItemById(communityId: string, itemId: string, currentUserId: string, canManageAny: boolean, canMutateTask: boolean) {
    const item = await this.prisma.eventTaskChecklistItem.findUniqueOrThrow({ where: { id: itemId }, include: { createdBy: { select: collaborationUserSelect(communityId) }, completedBy: { select: collaborationUserSelect(communityId) } } });
    return eventTaskChecklistItemShape(item, currentUserId, canManageAny, canMutateTask);
  }

  private async createCommentNotifications(
    tx: Prisma.TransactionClient,
    communityId: string,
    task: { id: string; eventId: string; title: string; taskBoardId: string | null; taskBoard: { name: string } | null; assignees: Array<{ userId: string }>; event: { title: string } },
    commentId: string,
    authorId: string,
    authorName: string,
  ) {
    const [settings, administrators] = await Promise.all([
      tx.communitySettings.findUnique({ where: { communityId }, select: { defaultLanguage: true } }),
      tx.membership.findMany({
        where: {
          communityId,
          status: 'ACTIVE',
          role: {
            key: { in: ['owner', 'admin'] },
            permissions: { some: { permission: { key: 'events.read' } } },
          },
        },
        select: { userId: true },
      }),
    ]);
    const recipientIds = new Set(administrators.map((membership) => membership.userId));
    const activeAssignees = await tx.membership.findMany({
      where: { communityId, userId: { in: task.assignees.map((assignment) => assignment.userId) }, status: 'ACTIVE' },
      select: { userId: true },
    });
    activeAssignees.forEach((membership) => recipientIds.add(membership.userId));
    recipientIds.delete(authorId);
    if (!recipientIds.size) return;
    const copy = eventTaskCommentNotificationCopy(settings?.defaultLanguage, authorName, task.title);
    await tx.notification.createMany({
      data: Array.from(recipientIds).map((userId) => ({
        communityId,
        userId,
        type: 'EVENT_TASK_COMMENTED',
        title: copy.title,
        body: copy.body,
        metadata: {
          kind: 'EVENT_TASK_COMMENTED',
          eventId: task.eventId,
          boardId: task.taskBoardId,
          taskId: task.id,
          commentId,
          eventTitle: task.event.title,
          boardName: task.taskBoard?.name ?? null,
          taskTitle: task.title,
          tab: 'comments',
          commenterId: authorId,
          commenterName: authorName,
        } as Prisma.InputJsonObject,
        dedupeKey: `EVENT_TASK_COMMENTED:${commentId}:${userId}`,
      })),
      skipDuplicates: true,
    });
  }

  private async createAttachmentNotifications(
    tx: Prisma.TransactionClient,
    communityId: string,
    task: { id: string; eventId: string; title: string; taskBoardId: string | null; taskBoard: { name: string } | null; assignees: Array<{ userId: string }>; createdById: string; event: { title: string } },
    attachments: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number }>,
    actorId: string,
    kind: 'EVENT_TASK_ATTACHMENT_ADDED' | 'EVENT_TASK_ATTACHMENT_REMOVED',
  ) {
    const directRecipientIds = [...task.assignees.map((assignment) => assignment.userId), task.createdById];
    const [settings, actor, memberships] = await Promise.all([
      tx.communitySettings.findUnique({ where: { communityId }, select: { defaultLanguage: true } }),
      tx.user.findUnique({ where: { id: actorId }, select: { name: true } }),
      tx.membership.findMany({
        where: {
          communityId,
          status: 'ACTIVE',
          OR: [
            { userId: { in: directRecipientIds } },
            { role: { key: { in: ['owner', 'admin'] }, permissions: { some: { permission: { key: 'events.read' } } } } },
          ],
        },
        select: { userId: true },
      }),
    ]);
    const actorName = actor?.name ?? '';
    const recipientIds = new Set(memberships.map((membership) => membership.userId));
    recipientIds.delete(actorId);
    if (!recipientIds.size) return;
    const copy = eventTaskAttachmentNotificationCopy(settings?.defaultLanguage, kind, actorName, task.title, attachments.length);
    const attachmentIds = attachments.map((attachment) => attachment.id);
    const fileNames = attachments.map((attachment) => attachment.originalName);
    const dedupeSubject = [...attachmentIds].sort().join(',');
    await tx.notification.createMany({
      data: Array.from(recipientIds).map((userId) => ({
        communityId,
        userId,
        type: kind,
        title: copy.title,
        body: copy.body,
        metadata: {
          kind,
          eventId: task.eventId,
          boardId: task.taskBoardId,
          taskId: task.id,
          attachmentIds,
          fileNames,
          eventTitle: task.event.title,
          boardName: task.taskBoard?.name ?? null,
          taskTitle: task.title,
          tab: 'attachments',
          actorId,
          actorName,
        } as Prisma.InputJsonObject,
        dedupeKey: `${kind}:${dedupeSubject}:${userId}`,
      })),
      skipDuplicates: true,
    });
  }

  private async requireActiveTask(communityId: string, eventId: string, taskId: string) {
    const task = await this.prisma.eventTask.findFirst({ where: { id: taskId, communityId, eventId, archivedAt: null }, select: { id: true, eventId: true, title: true, taskBoardId: true, taskBoard: { select: { name: true } }, assignees: { where: { archivedAt: null }, select: { userId: true } }, createdById: true, event: { select: { title: true } } } });
    if (!task) throw new NotFoundException('Event task not found.');
    return task;
  }

  private emitCollaborationChanged(communityId: string, eventId: string, taskId: string, reason: 'comment-added' | 'comment-archived' | 'attachment-added' | 'attachment-archived' | 'checklist-added' | 'checklist-updated' | 'checklist-toggled' | 'checklist-archived' | 'checklist-reordered') {
    this.realtime.emitTaskChanged({ communityId, eventId, taskId, reason, changedAt: new Date().toISOString() });
  }
}

function validateAttachmentFile(file: UploadedEventTaskAttachmentFile) {
  if (!file?.buffer || file.size <= 0) throw new BadRequestException('Attachment file is empty.');
  if (file.size > maxAttachmentSize) throw new BadRequestException('Attachment files must be 10 MB or smaller.');
  if (!allowedAttachmentTypes.has(file.mimetype)) throw new BadRequestException('Attachment file type is not supported.');
  const originalName = basename(file.originalname || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 255);
  if (!originalName) throw new BadRequestException('Attachment filename is invalid.');
  return { originalName, mimeType: file.mimetype, sizeBytes: file.size, storageKey: randomUUID(), buffer: file.buffer };
}

function eventTaskCommentNotificationCopy(language: string | null | undefined, commenterName: string, taskTitle: string) {
  if (language === 'fr') {
    return {
      title: 'Nouveau commentaire de tâche',
      body: `${commenterName} a commenté « ${taskTitle} ».`,
    };
  }
  return {
    title: 'New task comment',
    body: `${commenterName} commented on “${taskTitle}”.`,
  };
}

function eventTaskAttachmentNotificationCopy(language: string | null | undefined, kind: 'EVENT_TASK_ATTACHMENT_ADDED' | 'EVENT_TASK_ATTACHMENT_REMOVED', actorName: string, taskTitle: string, count: number) {
  if (language === 'fr') {
    return kind === 'EVENT_TASK_ATTACHMENT_REMOVED'
      ? { title: 'Pièce jointe de tâche supprimée', body: `${actorName} a supprimé un fichier de « ${taskTitle} ».` }
      : { title: 'Nouvelle pièce jointe de tâche', body: count === 1 ? `${actorName} a joint un fichier à « ${taskTitle} ».` : `${actorName} a joint ${count} fichiers à « ${taskTitle} ».` };
  }
  return kind === 'EVENT_TASK_ATTACHMENT_REMOVED'
    ? { title: 'Task attachment removed', body: `${actorName} removed a file from “${taskTitle}”.` }
    : { title: 'New task attachment', body: count === 1 ? `${actorName} attached a file to “${taskTitle}”.` : `${actorName} attached ${count} files to “${taskTitle}”.` };
}

function commentBody(rawBody: unknown) {
  if (typeof rawBody !== 'string' || !rawBody.trim()) throw new BadRequestException('Comment body is required.');
  const body = rawBody.trim();
  if (body.length > 1000) throw new BadRequestException('Comment body must be 1000 characters or fewer.');
  return body;
}

function eventTaskActivityShape(activity: any) {
  return {
    id: activity.id,
    type: activity.type,
    message: activity.message,
    metadata: activity.metadata,
    createdAt: activity.createdAt,
    actor: activity.actor ? collaborationUserShape(activity.actor) : null,
  };
}

function eventTaskCommentShape(comment: any, currentUserId: string, canArchiveAny: boolean) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    author: collaborationUserShape(comment.author),
    canArchive: canArchiveAny || comment.authorId === currentUserId,
  };
}

function eventTaskAttachmentShape(attachment: any, currentUserId: string, canRemoveAny: boolean) {
  return {
    id: attachment.id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
    uploader: collaborationUserShape(attachment.uploader),
    canRemove: canRemoveAny || attachment.uploaderId === currentUserId,
  };
}

function eventTaskChecklistItemShape(item: any, currentUserId: string, canManageAny: boolean, canMutateTask: boolean) {
  return {
    id: item.id,
    title: item.title,
    isCompleted: item.isCompleted,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    completedAt: item.completedAt,
    createdBy: collaborationUserShape(item.createdBy),
    completedBy: item.completedBy ? collaborationUserShape(item.completedBy) : null,
    canEdit: canMutateTask && (canManageAny || item.createdById === currentUserId),
    canToggle: canMutateTask,
    canRemove: canMutateTask && (canManageAny || item.createdById === currentUserId),
  };
}

function checklistItemTitle(rawTitle: unknown) {
  if (typeof rawTitle !== 'string' || !rawTitle.trim()) throw new BadRequestException('Checklist item title is required.');
  const title = rawTitle.trim();
  if (title.length > 200) throw new BadRequestException('Checklist item title must be 200 characters or fewer.');
  return title;
}

function collaborationUserShape(user: any) {
  const membership = user.memberships?.[0];
  const profile = membership?.profile;
  return {
    id: user.id,
    name: user.name,
    role: membership?.role?.key ?? 'member',
    avatarUrl: profile?.avatarUrl ?? null,
    dicebearStyle: profile?.dicebearStyle ?? null,
    dicebearSeed: profile?.dicebearSeed ?? null,
  };
}
