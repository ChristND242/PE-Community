import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatDeviceType, ChatMediaCategory, MembershipStatus, Prisma } from '@prisma/client';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';
import { Queue } from 'bullmq';
import { RequestUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS } from '../rbac/permissions';
import { PermissionsService } from '../rbac/permissions.service';
import { chatAttachmentUploadDir } from '../uploads';

const maxEncryptedPayloadLength = 128_000;
const maxEncryptedFieldLength = 512;
const maxPublicKeyLength = 12_000;
const maxGroupTitleLength = 80;
const maxGroupInitialParticipants = 25;
const maxGroupAddedParticipants = 25;
const maxEncryptedAttachmentSize = 10 * 1024 * 1024;
const chatEncryptionAlgorithm = 'ECDH-P256-AES-GCM-v1';
const chatAttachmentEncryptionAlgorithm = 'AES-GCM-256-CHAT-ATTACHMENT-v1';
export const chatDeleteForEveryoneWindowMs = 15 * 60 * 1000;
export const chatEditWindowMs = 15 * 60 * 1000;
export const allowedChatReactionEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
const allowedChatReportReasons = ['spam', 'harassment', 'unsafe_content', 'other'] as const;
const forbiddenPlaintextFields = ['body', 'content', 'text', 'messageText', 'plainText', 'plaintext', 'message'];
const forbiddenPrivateKeyFields = ['privateKey', 'privateKeyJwk', 'secretKey', 'keyPair'];
const maxReportNoteLength = 1000;
const defaultMaxActiveChatDevices = 3;
const minActiveChatDevices = 1;
const maxActiveChatDevices = 8;
const chatMediaQueueName = 'pe-community-notifications';
const devicePageSizes = [10, 20, 50, 100] as const;
const maxDeviceMetadataLength = 64;
const maxDeviceDisplayNameLength = 80;
const maxGovernanceSearchLength = 100;

export type UploadedEncryptedChatAttachmentFile = {
  buffer: Buffer;
  size: number;
};

@Injectable()
export class ChatService {
  private readonly mediaQueue = new Queue(chatMediaQueueName, {
    connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async conversations(user: RequestUser) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const conversations = await this.conversationsForUser(user.communityId, user.id);
    return { conversations };
  }

  async unreadCount(user: RequestUser) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participants = await this.prisma.chatConversationParticipant.findMany({
      where: {
        userId: user.id,
        deletedAt: null,
        archivedAt: null,
        mutedAt: null,
        conversation: {
          communityId: user.communityId,
          archivedAt: null,
        },
      },
      select: {
        conversationId: true,
        lastReadAt: true,
        clearedAt: true,
      },
    });
    const counts = await Promise.all(participants.map((participant) => {
      const unreadAfter = visibleAfter(participant.lastReadAt, participant.clearedAt);
      return this.prisma.chatMessage.count({
        where: {
          conversationId: participant.conversationId,
          deletedAt: null,
          deletedForEveryoneAt: null,
          senderId: { not: user.id },
          hiddenForUsers: { none: { userId: user.id } },
          ...(unreadAfter ? { createdAt: { gt: unreadAfter } } : {}),
        },
      });
    }));
    return { count: counts.reduce((total, count) => total + count, 0) };
  }

  async participants(user: RequestUser) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const [memberships, deviceKeys] = await Promise.all([
      this.prisma.membership.findMany({
        where: {
          communityId: user.communityId,
          status: MembershipStatus.ACTIVE,
          userId: { not: user.id },
        },
        orderBy: [{ user: { name: 'asc' } }, { joinedAt: 'desc' }],
        include: {
          user: { select: { id: true, name: true, email: true } },
          role: { select: { key: true, name: true } },
          profile: { select: { title: true, avatarUrl: true, dicebearStyle: true, dicebearSeed: true } },
        },
      }),
      this.prisma.chatDeviceKey.findMany({
        where: {
          communityId: user.communityId,
          revokedAt: null,
          algorithm: chatEncryptionAlgorithm,
          userId: { not: user.id },
        },
        select: { userId: true },
      }),
    ]);
    const keyedUserIds = new Set(deviceKeys.map((key) => key.userId));
    return {
      participants: memberships.map((membership) => ({
        membershipId: membership.id,
        userId: membership.userId,
        name: membership.user.name,
        email: membership.user.email,
        role: membership.role.key,
        roleName: membership.role.name,
        status: membership.status,
        title: membership.profile?.title ?? null,
        avatarUrl: membership.profile?.avatarUrl ?? null,
        dicebearStyle: membership.profile?.dicebearStyle ?? null,
        dicebearSeed: membership.profile?.dicebearSeed ?? null,
        hasChatKey: keyedUserIds.has(membership.userId),
      })),
    };
  }

  async directConversation(user: RequestUser, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectCreate, user.communityId);
    const targetUserId = stringValue(body.targetUserId);
    if (!targetUserId) throw new BadRequestException('Target user is required.');
    if (targetUserId === user.id) throw new BadRequestException('Choose another community member.');

    const targetMembership = await this.prisma.membership.findUnique({
      where: { userId_communityId: { userId: targetUserId, communityId: user.communityId } },
      include: { user: true },
    });
    if (!targetMembership || targetMembership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Target member is not available.');
    }
    await this.assertNoDirectBlock(user.communityId, user.id, targetUserId);

    const existing = await this.findDirectConversation(user.communityId, user.id, targetUserId);
    if (existing) {
      await this.prisma.chatConversationParticipant.updateMany({
        where: {
          conversationId: existing.id,
          userId: user.id,
          archivedAt: null,
          deletedAt: { not: null },
        },
        data: { deletedAt: null },
      });
      return {
        conversation: await this.findDirectConversation(user.communityId, user.id, targetUserId) ?? existing,
        created: false,
      };
    }

    const result = await this.createDirectConversation(user.communityId, user.id, targetUserId);
    return result;
  }

  async groupConversation(user: RequestUser, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectCreate, user.communityId);
    const title = boundedString(body.title, 'Group title is required.', maxGroupTitleLength);
    const participantIds = stringArrayValue(body.participantIds);
    const uniqueParticipantIds = Array.from(new Set(participantIds)).filter((participantId) => participantId !== user.id);
    if (uniqueParticipantIds.length < 2) throw new BadRequestException('Choose at least two group members.');
    if (uniqueParticipantIds.length > maxGroupInitialParticipants) throw new BadRequestException('Group has too many initial members.');

    const memberships = await this.prisma.membership.findMany({
      where: {
        communityId: user.communityId,
        status: MembershipStatus.ACTIVE,
        userId: { in: uniqueParticipantIds },
      },
      select: { userId: true },
    });
    const activeUserIds = new Set(memberships.map((membership) => membership.userId));
    if (uniqueParticipantIds.some((participantId) => !activeUserIds.has(participantId))) {
      throw new BadRequestException('Group members must be active community participants.');
    }

    const participantCreates = [
      { userId: user.id, role: 'OWNER' },
      ...uniqueParticipantIds.map((participantId) => ({ userId: participantId, role: 'MEMBER' })),
    ];
    const conversation = await this.prisma.chatConversation.create({
      data: {
        communityId: user.communityId,
        type: 'GROUP',
        title,
        createdById: user.id,
        participants: { create: participantCreates },
      },
      include: conversationInclude(user.communityId),
    });
    return { conversation: serializeConversation(conversation), created: true };
  }

  async conversationParticipants(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    await this.requireParticipant(user, conversationId);
    return { participants: await groupParticipantList(this.prisma, user.communityId, conversationId) };
  }

  async updateGroupConversation(user: RequestUser, conversationId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectCreate, user.communityId);
    await this.requireGroupOwner(user, conversationId);
    const title = boundedString(body.title, 'Group title is required.', maxGroupTitleLength);
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { title, updatedAt: new Date() },
    });
    return {
      conversation: await this.conversationById(user.communityId, conversationId),
      participants: await groupParticipantList(this.prisma, user.communityId, conversationId),
    };
  }

  async updateNotificationSettings(user: RequestUser, conversationId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participant = await this.requireParticipant(user, conversationId);
    if (![true, false, 'true', 'false'].includes(body.muted as boolean | string)) {
      throw new BadRequestException('Muted must be a boolean.');
    }
    const muted = booleanValue(body.muted);
    const mutedAt = muted ? new Date() : null;
    await this.prisma.chatConversationParticipant.update({
      where: { id: participant.id },
      data: { mutedAt },
    });
    return { conversationId, muted, mutedAt };
  }

  async transferGroupOwnership(user: RequestUser, conversationId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectCreate, user.communityId);
    const newOwnerUserId = stringValue(body.newOwnerUserId);
    if (!newOwnerUserId) throw new BadRequestException('New owner is required.');
    if (newOwnerUserId === user.id) throw new BadRequestException('Choose another group member.');

    await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.chatConversation.findFirst({
        where: {
          id: conversationId,
          communityId: user.communityId,
          type: 'GROUP',
          archivedAt: null,
        },
        select: { id: true },
      });
      if (!conversation) throw new NotFoundException('Group conversation not found.');

      const currentParticipant = await tx.chatConversationParticipant.findFirst({
        where: {
          conversationId,
          userId: user.id,
          archivedAt: null,
          deletedAt: null,
        },
        select: { id: true, role: true },
      });
      if (!currentParticipant) throw new NotFoundException('Group conversation not found.');
      if (currentParticipant.role !== 'OWNER') throw new ForbiddenException('Only the group owner can transfer ownership.');

      const newOwnerParticipant = await tx.chatConversationParticipant.findFirst({
        where: {
          conversationId,
          userId: newOwnerUserId,
          archivedAt: null,
          deletedAt: null,
          conversation: {
            communityId: user.communityId,
            type: 'GROUP',
            archivedAt: null,
          },
        },
        select: { id: true },
      });
      if (!newOwnerParticipant) throw new NotFoundException('New owner must be an active group participant.');

      await tx.chatConversationParticipant.updateMany({
        where: { conversationId, archivedAt: null, deletedAt: null, role: 'OWNER' },
        data: { role: 'MEMBER' },
      });
      await tx.chatConversationParticipant.update({
        where: { id: newOwnerParticipant.id },
        data: { role: 'OWNER' },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    });

    return {
      conversation: await this.conversationById(user.communityId, conversationId),
      participants: await groupParticipantList(this.prisma, user.communityId, conversationId),
    };
  }

  async addGroupParticipants(user: RequestUser, conversationId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectCreate, user.communityId);
    await this.requireGroupOwner(user, conversationId);
    const requestedUserIds = stringArrayValue(body.userIds);
    const uniqueUserIds = Array.from(new Set(requestedUserIds)).filter((userId) => userId !== user.id);
    if (uniqueUserIds.length === 0) throw new BadRequestException('Choose at least one member to add.');
    if (uniqueUserIds.length > maxGroupAddedParticipants) throw new BadRequestException('Too many members selected.');

    const memberships = await this.prisma.membership.findMany({
      where: {
        communityId: user.communityId,
        status: MembershipStatus.ACTIVE,
        userId: { in: uniqueUserIds },
      },
      select: { userId: true },
    });
    const activeUserIds = new Set(memberships.map((membership) => membership.userId));
    if (uniqueUserIds.some((userId) => !activeUserIds.has(userId))) {
      throw new BadRequestException('Group members must be active community participants.');
    }

    const existingParticipants = await this.prisma.chatConversationParticipant.findMany({
      where: { conversationId, userId: { in: uniqueUserIds }, archivedAt: null },
      select: { userId: true, deletedAt: true },
    });
    const activeExisting = new Set(existingParticipants.filter((participant) => !participant.deletedAt).map((participant) => participant.userId));
    const removedExisting = new Set(existingParticipants.filter((participant) => participant.deletedAt).map((participant) => participant.userId));
    if (removedExisting.size > 0) {
      throw new BadRequestException('Previously removed group members cannot be re-added in this phase.');
    }
    const userIdsToAdd = uniqueUserIds.filter((userId) => !activeExisting.has(userId));
    if (userIdsToAdd.length > 0) {
      await this.prisma.chatConversationParticipant.createMany({
        data: userIdsToAdd.map((userId) => ({ conversationId, userId, role: 'MEMBER' })),
        skipDuplicates: true,
      });
      await this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    }
    return {
      conversation: await this.conversationById(user.communityId, conversationId),
      participants: await groupParticipantList(this.prisma, user.communityId, conversationId),
      added: userIdsToAdd.length,
    };
  }

  async removeGroupParticipant(user: RequestUser, conversationId: string, targetUserId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectCreate, user.communityId);
    await this.requireGroupOwner(user, conversationId);
    if (!targetUserId) throw new BadRequestException('Member is required.');
    if (targetUserId === user.id) throw new BadRequestException('Use leave group instead.');
    const target = await this.prisma.chatConversationParticipant.findFirst({
      where: {
        conversationId,
        userId: targetUserId,
        deletedAt: null,
        archivedAt: null,
        conversation: { communityId: user.communityId, type: 'GROUP', archivedAt: null },
      },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('Group member not found.');
    if (target.role === 'OWNER') throw new ConflictException('Group owners cannot be removed in this phase.');
    await this.prisma.chatConversationParticipant.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    });
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    return {
      conversation: await this.conversationById(user.communityId, conversationId),
      participants: await groupParticipantList(this.prisma, user.communityId, conversationId),
      removedUserId: targetUserId,
    };
  }

  async leaveGroup(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participant = await this.requireGroupParticipant(user, conversationId);
    if (participant.role === 'OWNER') {
      throw new ConflictException('Transfer ownership before leaving the group.');
    }
    const leftAt = new Date();
    await this.prisma.chatConversationParticipant.update({
      where: { id: participant.id },
      data: { clearedAt: leftAt, deletedAt: leftAt },
    });
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: leftAt },
    });
    return { conversationId, leftAt };
  }

  async messages(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participant = await this.requireParticipant(user, conversationId);
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        hiddenForUsers: { none: { userId: user.id } },
        conversation: { communityId: user.communityId },
        ...(participant.clearedAt ? { createdAt: { gt: participant.clearedAt } } : {}),
      },
      include: { reactions: true, stars: { where: { userId: user.id }, select: { id: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return {
      messages: messages.map((message) => publicMessage(message, user.id)),
    };
  }

  async starredMessages(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participant = await this.requireParticipant(user, conversationId);
    const stars = await this.prisma.chatMessageStar.findMany({
      where: {
        userId: user.id,
        message: {
          conversationId,
          deletedAt: null,
          deletedForEveryoneAt: null,
          hiddenForUsers: { none: { userId: user.id } },
          conversation: { communityId: user.communityId, archivedAt: null },
          ...(participant.clearedAt ? { createdAt: { gt: participant.clearedAt } } : {}),
        },
      },
      include: {
        message: {
          include: { reactions: true, stars: { where: { userId: user.id }, select: { id: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      messages: stars.map((star) => publicMessage(star.message, user.id)),
    };
  }

  async createMessage(user: RequestUser, conversationId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectSend, user.communityId);
    await this.requireParticipant(user, conversationId);
    await this.assertConversationSendAllowed(user, conversationId);
    const payload = encryptedMessagePayload(body);
    const keyReferences = await this.resolveMessageKeyReferences(user, conversationId, payload);
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          conversationId,
          senderId: user.id,
          encryptedPayload: payload.encryptedPayload,
          encryptionNonce: payload.encryptionNonce,
          encryptionAlgorithmVersion: payload.encryptionAlgorithmVersion,
          encryptionKeyVersion: payload.encryptionKeyVersion,
          senderKeyVersionId: keyReferences.senderKeyVersionId,
          recipientKeyVersionId: keyReferences.recipientKeyVersionId,
        },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      await tx.chatConversationParticipant.updateMany({
        where: {
          conversationId,
          userId: { not: user.id },
          deletedAt: { not: null },
        },
        data: { deletedAt: null },
      });
      return created;
    });
    return {
      message: publicMessage(message, user.id),
    };
  }

  async hideMessageForMe(user: RequestUser, conversationId: string, messageId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    await this.requireParticipant(user, conversationId);
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        conversation: { communityId: user.communityId, archivedAt: null },
      },
      select: { id: true, conversationId: true },
    });
    if (!message) throw new NotFoundException('Message not found.');
    const hidden = await this.prisma.chatMessageHidden.upsert({
      where: { messageId_userId: { messageId, userId: user.id } },
      update: { hiddenAt: new Date() },
      create: { messageId, conversationId, userId: user.id },
    });
    return { messageId, conversationId, hiddenAt: hidden.hiddenAt };
  }

  async reportMessage(user: RequestUser, conversationId: string, messageId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participant = await this.requireParticipant(user, conversationId);
    const reason = reportReasonValue(body.reason);
    const note = reportNoteValue(body.note);
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        deletedForEveryoneAt: null,
        hiddenForUsers: { none: { userId: user.id } },
        conversation: { communityId: user.communityId, archivedAt: null },
        ...(participant.clearedAt ? { createdAt: { gt: participant.clearedAt } } : {}),
      },
      select: { id: true, senderId: true },
    });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.senderId === user.id) throw new ForbiddenException('You cannot report your own message.');

    const existing = await this.prisma.chatMessageReport.findUnique({
      where: { messageId_reporterId: { messageId, reporterId: user.id } },
      select: { id: true, status: true, createdAt: true },
    });
    if (existing) return { report: { id: existing.id, status: existing.status, createdAt: existing.createdAt }, duplicate: true };

    const report = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessageReport.create({
        data: {
          messageId,
          conversationId,
          communityId: user.communityId,
          reporterId: user.id,
          reportedUserId: message.senderId,
          reason,
          note,
        },
        select: { id: true, status: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'chat.message.reported',
          targetType: 'ChatMessageReport',
          targetId: created.id,
          metadata: { conversationId, messageId, reporterId: user.id, reportedUserId: message.senderId, reason },
        },
      });
      return created;
    });
    return { report, duplicate: false };
  }

  async deleteMessageForEveryone(user: RequestUser, conversationId: string, messageId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectSend, user.communityId);
    await this.requireParticipant(user, conversationId);
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        conversation: { communityId: user.communityId, archivedAt: null },
      },
    });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.senderId !== user.id) throw new ForbiddenException('Only the sender can delete this message for everyone.');
    if (message.deletedForEveryoneAt) return { message: publicMessage(message, user.id) };
    if (Date.now() - message.createdAt.getTime() > chatDeleteForEveryoneWindowMs) {
      throw new ConflictException('This message can no longer be deleted for everyone.');
    }
    const deleted = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.chatMessage.update({
        where: { id: message.id },
        data: {
          encryptedPayload: '',
          encryptionNonce: '',
          deletedForEveryoneAt: new Date(),
          deletedById: user.id,
        },
      });
      await tx.chatMessageStar.deleteMany({ where: { messageId: message.id } });
      return updated;
    });
    return { message: publicMessage(deleted, user.id) };
  }

  async editMessage(user: RequestUser, conversationId: string, messageId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectSend, user.communityId);
    await this.requireParticipant(user, conversationId);
    const payload = encryptedMessagePayload(body);
    const keyReferences = await this.resolveMessageKeyReferences(user, conversationId, payload);
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        conversation: { communityId: user.communityId, archivedAt: null },
      },
    });
    if (!message) throw new NotFoundException('Message not found.');
    if (message.senderId !== user.id) throw new ForbiddenException('Only the sender can edit this message.');
    if (message.deletedForEveryoneAt) throw new ConflictException('Deleted messages cannot be edited.');
    if (Date.now() - message.createdAt.getTime() > chatEditWindowMs) {
      throw new ConflictException('This message can no longer be edited.');
    }
    const edited = await this.prisma.chatMessage.update({
      where: { id: message.id },
      data: {
        encryptedPayload: payload.encryptedPayload,
        encryptionNonce: payload.encryptionNonce,
        encryptionAlgorithmVersion: payload.encryptionAlgorithmVersion,
        encryptionKeyVersion: payload.encryptionKeyVersion,
        senderKeyVersionId: keyReferences.senderKeyVersionId,
        recipientKeyVersionId: keyReferences.recipientKeyVersionId,
        editedAt: new Date(),
      },
      include: { reactions: true, stars: { where: { userId: user.id }, select: { id: true } } },
    });
    return { message: publicMessage(edited, user.id) };
  }

  async setMessageReaction(user: RequestUser, conversationId: string, messageId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    await this.requireParticipant(user, conversationId);
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        deletedForEveryoneAt: null,
        hiddenForUsers: { none: { userId: user.id } },
        conversation: { communityId: user.communityId, archivedAt: null },
      },
      select: { id: true, conversationId: true },
    });
    if (!message) throw new NotFoundException('Message not found.');
    const nextEmoji = reactionEmojiValue(body.emoji);
    const existing = await this.prisma.chatMessageReaction.findUnique({
      where: { messageId_userId: { messageId, userId: user.id } },
    });
    if (!nextEmoji || existing?.emoji === nextEmoji) {
      if (existing) {
        await this.prisma.chatMessageReaction.delete({
          where: { messageId_userId: { messageId, userId: user.id } },
        });
      }
    } else {
      await this.prisma.chatMessageReaction.upsert({
        where: { messageId_userId: { messageId, userId: user.id } },
        update: { emoji: nextEmoji },
        create: { messageId, userId: user.id, emoji: nextEmoji },
      });
    }
    return {
      conversationId,
      messageId,
      reactions: await this.messageReactionSummary(messageId, user.id),
    };
  }

  async toggleMessageStar(user: RequestUser, conversationId: string, messageId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    await this.requireParticipant(user, conversationId);
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        deletedForEveryoneAt: null,
        hiddenForUsers: { none: { userId: user.id } },
        conversation: { communityId: user.communityId, archivedAt: null },
      },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Message not found.');
    const existing = await this.prisma.chatMessageStar.findUnique({
      where: { messageId_userId: { messageId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.chatMessageStar.delete({
        where: { messageId_userId: { messageId, userId: user.id } },
      });
      return { messageId, starred: false };
    }
    await this.prisma.chatMessageStar.create({
      data: { messageId, userId: user.id },
    });
    return { messageId, starred: true };
  }

  async uploadAttachment(user: RequestUser, conversationId: string, file: UploadedEncryptedChatAttachmentFile | undefined, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDirectSend, user.communityId);
    await this.requireParticipant(user, conversationId);
    await this.assertConversationSendAllowed(user, conversationId);
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, communityId: user.communityId, archivedAt: null },
      select: { type: true },
    });
    if (!file) throw new BadRequestException('Encrypted attachment is required.');
    if (file.size <= 0) throw new BadRequestException('Encrypted attachment is empty.');
    const attachmentSettings = await this.prisma.communitySettings.findUnique({
      where: { communityId: user.communityId },
      select: { chatAttachmentMaxBytes: true },
    });
    if (file.size > (attachmentSettings?.chatAttachmentMaxBytes ?? maxEncryptedAttachmentSize)) {
      throw new BadRequestException('Encrypted attachment is too large.');
    }
    const encryptionNonce = boundedString(body.encryptionNonce, 'Attachment encryption nonce is required.', maxEncryptedFieldLength);
    const encryptionAlgorithmVersion = boundedString(body.encryptionAlgorithmVersion, 'Attachment encryption algorithm is required.', maxEncryptedFieldLength);
    const mediaCategory = chatMediaCategory(body.mediaCategory);
    const viewOnce = booleanValue(body.viewOnce);
    if (!conversation || (conversation.type !== 'DIRECT' && conversation.type !== 'GROUP')) throw new BadRequestException('Unsupported conversation type.');
    if (conversation.type === 'GROUP' && viewOnce) throw new BadRequestException('Group view-once media is not available yet.');
    if (encryptionAlgorithmVersion !== chatAttachmentEncryptionAlgorithm) throw new BadRequestException('Unsupported attachment encryption algorithm.');

    const storageKey = `${conversationId}-${randomUUID()}.bin`;
    const uploadDir = chatAttachmentUploadDir();
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, storageKey), file.buffer);

    let attachment;
    try {
      attachment = await this.prisma.$transaction(async (tx) => {
        await lockChatStorage(tx, user.communityId);
        const [settings, usage] = await Promise.all([
          tx.communitySettings.findUnique({
            where: { communityId: user.communityId },
            select: { chatMediaQuotaBytes: true },
          }),
          tx.communityChatStorageUsage.upsert({
            where: { communityId: user.communityId },
            update: {},
            create: { communityId: user.communityId },
          }),
        ]);
        const encryptedBytes = BigInt(file.size);
        if (settings?.chatMediaQuotaBytes !== null && settings?.chatMediaQuotaBytes !== undefined
          && usage.totalBytes + encryptedBytes > settings.chatMediaQuotaBytes) {
          throw new ConflictException('CHAT_MEDIA_QUOTA_REACHED');
        }
        const created = await tx.chatAttachment.create({
          data: {
            communityId: user.communityId,
            conversationId,
            senderId: user.id,
            storageKey,
            encryptedSize: file.size,
            mediaCategory,
            viewOnce,
            encryptionNonce,
            encryptionAlgorithmVersion,
          },
        });
        await tx.communityChatStorageUsage.update({
          where: { communityId: user.communityId },
          data: storageIncrement(mediaCategory, encryptedBytes),
        });
        return created;
      });
    } catch (error) {
      await unlink(join(uploadDir, storageKey)).catch(() => undefined);
      throw error;
    }
    return { attachment: publicAttachment(attachment) };
  }

  async downloadAttachment(user: RequestUser, conversationId: string, attachmentId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    await this.requireParticipant(user, conversationId);
    const attachment = await this.prisma.chatAttachment.findFirst({
      where: {
        id: attachmentId,
        conversationId,
        lifecycleStatus: 'ACTIVE',
        deletedAt: null,
        conversation: { communityId: user.communityId, archivedAt: null },
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    if (attachment.viewOnce) throw new ForbiddenException('View-once attachment must be opened through the view-once endpoint.');
    const buffer = await readFile(join(chatAttachmentUploadDir(), attachment.storageKey));
    return { attachment: publicAttachment(attachment), buffer };
  }

  async attachmentViews(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    await this.requireParticipant(user, conversationId);
    const views = await this.prisma.chatAttachmentView.findMany({
      where: {
        conversationId,
        userId: user.id,
        conversation: { communityId: user.communityId, archivedAt: null },
      },
      select: { attachmentId: true, openedAt: true },
    });
    return { views };
  }

  async openAttachment(user: RequestUser, conversationId: string, attachmentId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    await this.requireParticipant(user, conversationId);
    const attachment = await this.prisma.chatAttachment.findFirst({
      where: {
        id: attachmentId,
        conversationId,
        lifecycleStatus: 'ACTIVE',
        deletedAt: null,
        conversation: { communityId: user.communityId, archivedAt: null },
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found.');
    if (!attachment.viewOnce) throw new BadRequestException('Attachment is not view-once.');
    if (attachment.senderId === user.id) throw new ForbiddenException('View-once attachment cannot be opened by the sender.');

    const existingView = await this.prisma.chatAttachmentView.findUnique({
      where: { attachmentId_userId: { attachmentId, userId: user.id } },
    });
    if (existingView) throw new ConflictException('Attachment already opened.');

    const buffer = await readFile(join(chatAttachmentUploadDir(), attachment.storageKey));
    try {
      await this.prisma.chatAttachmentView.create({
        data: {
          attachmentId,
          conversationId,
          userId: user.id,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Attachment already opened.');
      }
      throw error;
    }
    return { attachment: publicAttachment(attachment), buffer };
  }

  async blockUser(user: RequestUser, blockedUserId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    if (!blockedUserId || blockedUserId === user.id) throw new BadRequestException('Choose another community member.');
    await this.requireActiveCommunityMember(user.communityId, blockedUserId);
    const block = await this.prisma.chatUserBlock.upsert({
      where: { blockerId_blockedUserId: { blockerId: user.id, blockedUserId } },
      update: {},
      create: { blockerId: user.id, blockedUserId },
    });
    await this.prisma.auditLog.create({
      data: {
        communityId: user.communityId,
        actorUserId: user.id,
        action: 'chat.user.blocked',
        targetType: 'ChatUserBlock',
        targetId: block.id,
        metadata: { blockerId: user.id, blockedUserId },
      },
    });
    return { blockedUserId, blocked: true, blockState: await this.directBlockState(user.id, blockedUserId) };
  }

  async unblockUser(user: RequestUser, blockedUserId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    if (!blockedUserId || blockedUserId === user.id) throw new BadRequestException('Choose another community member.');
    await this.requireActiveCommunityMember(user.communityId, blockedUserId);
    const existing = await this.prisma.chatUserBlock.findUnique({
      where: { blockerId_blockedUserId: { blockerId: user.id, blockedUserId } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.chatUserBlock.delete({
        where: { blockerId_blockedUserId: { blockerId: user.id, blockedUserId } },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        communityId: user.communityId,
        actorUserId: user.id,
        action: 'chat.user.unblocked',
        targetType: 'ChatUserBlock',
        targetId: existing?.id ?? `${user.id}:${blockedUserId}`,
        metadata: { blockerId: user.id, blockedUserId },
      },
    });
    return { blockedUserId, blocked: false, blockState: await this.directBlockState(user.id, blockedUserId) };
  }

  async myDeviceKey(user: RequestUser) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const key = await this.prisma.chatDeviceKey.findFirst({
      where: {
        userId: user.id,
        communityId: user.communityId,
        status: 'ACTIVE',
        revokedAt: null,
        devices: { some: { status: 'ACTIVE', revokedAt: null } },
      },
      orderBy: { version: 'desc' },
    });
    const identityExists = Boolean(await this.prisma.chatDeviceKey.findFirst({
      where: { userId: user.id, communityId: user.communityId },
      select: { id: true },
    }));
    return { key: key ? publicDeviceKey(key) : null, identityExists };
  }

  async registerMyDeviceKey(user: RequestUser, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const forbiddenField = forbiddenPrivateKeyFields.find((field) => body[field] !== undefined);
    if (forbiddenField) throw new BadRequestException(`Private key field "${forbiddenField}" is not accepted.`);
    const publicKey = boundedString(body.publicKey, 'Public key is required.', maxPublicKeyLength);
    const algorithm = boundedString(body.algorithm, 'Key algorithm is required.', maxEncryptedFieldLength);
    if (algorithm !== chatEncryptionAlgorithm) throw new BadRequestException('Unsupported chat key algorithm.');
    const deviceIdentifier = boundedString(body.deviceIdentifier, 'Device identifier is required.', 128);
    const displayName = deviceDisplayName(body.displayName, 'Device name is required.');
    const metadata = chatDeviceMetadata(body, displayName);
    const fingerprint = chatPublicKeyFingerprint(publicKey);
    const requestedMode = stringValue(body.mode);
    if (!['initial', 'restore', 'rotate'].includes(requestedMode)) {
      throw new BadRequestException('A valid device authorization mode is required.');
    }

    return this.prisma.$transaction(async (tx) => {
      await lockChatDeviceEnrollment(tx, user.communityId, user.id);
      const settings = await tx.communitySettings.findUnique({
        where: { communityId: user.communityId },
        select: { maxActiveChatDevices: true },
      });
      const limit = settings?.maxActiveChatDevices ?? defaultMaxActiveChatDevices;
      assertChatDeviceLimit(limit);
      let existingDevice = await tx.chatDevice.findUnique({
        where: { communityId_userId_deviceIdentifier: { communityId: user.communityId, userId: user.id, deviceIdentifier } },
      });
      if (existingDevice?.status === 'ACTIVE') {
        const key = await tx.chatDeviceKey.findUniqueOrThrow({ where: { id: existingDevice.keyId } });
        if (key.fingerprint !== fingerprint) throw new ConflictException('This device is already linked to another chat identity.');
        const updatedDevice = await tx.chatDevice.update({
          where: { id: existingDevice.id },
          data: {
            ...metadata,
            displayName: existingDevice.customDisplayName ?? metadata.generatedLabel,
            lastSeenAt: new Date(),
          },
        });
        return { key: publicDeviceKey(key), device: publicChatDevice(updatedDevice, deviceIdentifier) };
      }

      let retainedKey = await tx.chatDeviceKey.findFirst({
        where: {
          userId: user.id,
          communityId: user.communityId,
          OR: [{ fingerprint }, { fingerprint: null, publicKey }],
        },
        orderBy: { version: 'desc' },
      });
      if (retainedKey?.fingerprint === null) {
        retainedKey = await tx.chatDeviceKey.update({
          where: { id: retainedKey.id },
          data: { fingerprint },
        });
      }
      const anyExistingKey = await tx.chatDeviceKey.findFirst({
        where: { userId: user.id, communityId: user.communityId },
        orderBy: { version: 'desc' },
      });
      if (requestedMode === 'restore' && retainedKey && !existingDevice) {
        existingDevice = await tx.chatDevice.findFirst({
          where: {
            communityId: user.communityId,
            userId: user.id,
            keyId: retainedKey.id,
            status: 'ACTIVE',
            deviceIdentifier: { startsWith: 'legacy-' },
          },
        });
      }
      if (!existingDevice) {
        const activeDeviceCount = await tx.chatDevice.count({
          where: { communityId: user.communityId, userId: user.id, status: 'ACTIVE', revokedAt: null },
        });
        if (activeDeviceCount >= limit) throw new ConflictException('CHAT_DEVICE_LIMIT_REACHED');
      }

      let key = retainedKey;
      if (requestedMode === 'initial') {
        if (anyExistingKey && !retainedKey) throw new ConflictException('CHAT_RESTORE_OR_ROTATION_REQUIRED');
        if (!key) {
          key = await tx.chatDeviceKey.create({
            data: {
              userId: user.id,
              communityId: user.communityId,
              publicKey,
              fingerprint,
              algorithm,
              version: 1,
              status: 'ACTIVE',
              activatedAt: new Date(),
            },
          });
        }
      } else if (requestedMode === 'restore') {
        if (!retainedKey || retainedKey.publicKey !== publicKey) throw new ConflictException('CHAT_BACKUP_KEY_MISMATCH');
        if (retainedKey.status === 'REVOKED') throw new ConflictException('CHAT_KEY_REVOKED');
      } else {
        if (retainedKey) throw new ConflictException('CHAT_KEY_ALREADY_REGISTERED');
        const latestVersion = anyExistingKey?.version ?? 0;
        key = await tx.chatDeviceKey.create({
          data: {
            userId: user.id,
            communityId: user.communityId,
            publicKey,
            fingerprint,
            algorithm,
            version: latestVersion + 1,
            status: 'ACTIVE',
            activatedAt: new Date(),
          },
        });
        await tx.chatDeviceKey.updateMany({
          where: { userId: user.id, communityId: user.communityId, id: { not: key.id }, status: 'ACTIVE' },
          data: { status: 'RETIRED', retiredAt: new Date(), rotatedAt: new Date() },
        });
      }
      if (!key) throw new ConflictException('CHAT_KEY_AUTHORIZATION_FAILED');

      const device = existingDevice
        ? await tx.chatDevice.update({
            where: { id: existingDevice.id },
            data: {
              keyId: key.id,
              deviceIdentifier,
              displayName: existingDevice.customDisplayName ?? metadata.generatedLabel,
              ...metadata,
              status: 'ACTIVE',
              revokedAt: null,
              revokedById: null,
              lastSeenAt: new Date(),
            },
          })
        : await tx.chatDevice.create({
            data: {
              communityId: user.communityId,
              userId: user.id,
              keyId: key.id,
              deviceIdentifier,
              displayName: metadata.generatedLabel,
              ...metadata,
              lastSeenAt: new Date(),
            },
          });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: requestedMode === 'rotate' ? 'chat.key.rotation.completed' : 'chat.device.authorized',
          targetType: 'ChatDevice',
          targetId: device.id,
          metadata: { mode: requestedMode, keyVersion: key.version },
        },
      });
      return { key: publicDeviceKey(key), device: publicChatDevice(device, deviceIdentifier) };
    });
  }

  async verifyRestoredKey(user: RequestUser, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const publicKey = boundedString(body.publicKey, 'Public key is required.', maxPublicKeyLength);
    const fingerprint = chatPublicKeyFingerprint(publicKey);
    const retained = await this.prisma.chatDeviceKey.findFirst({
      where: {
        userId: user.id,
        communityId: user.communityId,
        OR: [{ fingerprint }, { fingerprint: null, publicKey }],
        status: { not: 'REVOKED' },
      },
      select: { id: true, publicKey: true, version: true },
      orderBy: { version: 'desc' },
    });
    if (!retained || retained.publicKey !== publicKey) {
      await this.prisma.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'chat.backup.restore.verification_failed',
          targetType: 'User',
          targetId: user.id,
          metadata: { category: 'KEY_MISMATCH' },
        },
      });
      throw new ConflictException('CHAT_BACKUP_KEY_MISMATCH');
    }
    await this.prisma.auditLog.create({
      data: {
        communityId: user.communityId,
        actorUserId: user.id,
        action: 'chat.backup.restore.verified',
        targetType: 'ChatDeviceKey',
        targetId: retained.id,
        metadata: { version: retained.version },
      },
    });
    return { verified: true, keyVersionId: retained.id, version: retained.version };
  }

  async myDevices(user: RequestUser, input: Record<string, unknown>, currentDeviceIdentifier?: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const query = parseDeviceListQuery(input, false);
    const where: Prisma.ChatDeviceWhereInput = {
      communityId: user.communityId,
      userId: user.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? {
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { generatedLabel: { contains: query.search, mode: 'insensitive' } },
          { customDisplayName: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
    };
    const [devices, total, activeCount, settings] = await Promise.all([
      this.prisma.chatDevice.findMany({
        where,
        include: { key: { select: { version: true, fingerprint: true, status: true } } },
        orderBy: chatDeviceOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.chatDevice.count({ where }),
      this.prisma.chatDevice.count({
        where: { communityId: user.communityId, userId: user.id, status: 'ACTIVE', revokedAt: null },
      }),
      this.prisma.communitySettings.findUnique({
        where: { communityId: user.communityId },
        select: { maxActiveChatDevices: true, timezone: true },
      }),
    ]);
    const limit = settings?.maxActiveChatDevices ?? defaultMaxActiveChatDevices;
    return {
      activeCount,
      limit,
      overLimit: activeCount > limit,
      devices: devices.map((device) => publicChatDevice(device, currentDeviceIdentifier)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
      timezone: settings?.timezone ?? 'UTC',
    };
  }

  async renameMyDevice(user: RequestUser, deviceId: string, body: Record<string, unknown>, currentDeviceIdentifier?: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const displayName = deviceDisplayName(body.displayName, 'Device name is required.');
    const device = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.chatDevice.findFirst({
        where: { id: deviceId, communityId: user.communityId, userId: user.id, status: 'ACTIVE' },
        include: { key: { select: { version: true, fingerprint: true, status: true } } },
      });
      if (!existing) throw new NotFoundException('Active device not found.');
      const updated = await tx.chatDevice.update({
        where: { id: existing.id },
        data: { displayName, customDisplayName: displayName },
        include: { key: { select: { version: true, fingerprint: true, status: true } } },
      });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'chat.device.renamed',
          targetType: 'ChatDevice',
          targetId: existing.id,
          metadata: { currentDevice: existing.deviceIdentifier === currentDeviceIdentifier },
        },
      });
      return updated;
    });
    return { device: publicChatDevice(device, currentDeviceIdentifier) };
  }

  async enrichMyDeviceMetadata(
    user: RequestUser,
    body: Record<string, unknown>,
    currentDeviceIdentifier?: string,
  ) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const publicKey = boundedString(body.publicKey, 'Public key is required.', maxPublicKeyLength);
    const fingerprint = chatPublicKeyFingerprint(publicKey);
    const metadata = chatDeviceMetadata(body, 'Migrated device');
    return this.prisma.$transaction(async (tx) => {
      const key = await tx.chatDeviceKey.findFirst({
        where: {
          userId: user.id,
          communityId: user.communityId,
          publicKey,
          fingerprint,
          status: { not: 'REVOKED' },
        },
        select: { id: true },
      });
      if (!key) throw new NotFoundException('Current chat device key not found.');

      const exactDevice = currentDeviceIdentifier
        ? await tx.chatDevice.findFirst({
            where: {
              communityId: user.communityId,
              userId: user.id,
              keyId: key.id,
              deviceIdentifier: currentDeviceIdentifier,
              status: 'ACTIVE',
              revokedAt: null,
            },
            include: { key: { select: { version: true, fingerprint: true, status: true } } },
          })
        : null;
      const compatibilityDevices = exactDevice ? [] : await tx.chatDevice.findMany({
        where: {
          communityId: user.communityId,
          userId: user.id,
          keyId: key.id,
          deviceIdentifier: { startsWith: 'legacy-' },
          status: 'ACTIVE',
          revokedAt: null,
        },
        include: { key: { select: { version: true, fingerprint: true, status: true } } },
        take: 2,
      });
      const device = exactDevice ?? (compatibilityDevices.length === 1 ? compatibilityDevices[0] : null);
      if (!device) throw new NotFoundException('Current chat device not found.');

      const changed = device.generatedLabel !== metadata.generatedLabel
        || device.deviceType !== metadata.deviceType
        || device.operatingSystemName !== metadata.operatingSystemName
        || device.operatingSystemVersion !== metadata.operatingSystemVersion
        || device.browserName !== metadata.browserName
        || device.browserVersion !== metadata.browserVersion;
      if (!changed) {
        return { changed: false, device: publicChatDevice(device, currentDeviceIdentifier) };
      }

      const updated = await tx.chatDevice.update({
        where: { id: device.id },
        data: metadata,
        include: { key: { select: { version: true, fingerprint: true, status: true } } },
      });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'chat.device.metadata.enriched',
          targetType: 'ChatDevice',
          targetId: device.id,
          metadata: { source: 'authenticated-browser', compatibilityDevice: device.deviceIdentifier.startsWith('legacy-') },
        },
      });
      return { changed: true, device: publicChatDevice(updated, currentDeviceIdentifier) };
    });
  }

  async revokeMyDevice(user: RequestUser, deviceId: string, currentDeviceIdentifier?: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    return this.revokeDevice(user, deviceId, {
      targetUserId: user.id,
      currentDeviceIdentifier,
      action: 'chat.device.revoked.self',
    });
  }

  async conversationDeviceKeys(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    await this.requireParticipant(user, conversationId);
    const participants = await this.prisma.chatConversationParticipant.findMany({
      where: {
        conversationId,
        archivedAt: null,
        deletedAt: null,
        conversation: { communityId: user.communityId, archivedAt: null },
      },
      select: { userId: true },
    });
    const userIds = participants.map((participant) => participant.userId);
    const keys = await this.prisma.chatDeviceKey.findMany({
      where: {
        communityId: user.communityId,
        userId: { in: userIds },
      },
      orderBy: [{ userId: 'asc' }, { version: 'desc' }],
    });
    return { keys: keys.map(publicDeviceKey) };
  }

  async communityDevices(user: RequestUser, input: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDevicesView, user.communityId);
    const query = parseDeviceListQuery(input, true);
    const where: Prisma.ChatDeviceWhereInput = {
      communityId: user.communityId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.deviceType ? { deviceType: query.deviceType } : {}),
      ...(query.operatingSystem ? { operatingSystemName: query.operatingSystem } : {}),
      ...(query.browser ? { browserName: query.browser } : {}),
      ...(query.search ? {
        OR: [
          { displayName: { contains: query.search, mode: 'insensitive' } },
          { generatedLabel: { contains: query.search, mode: 'insensitive' } },
          { customDisplayName: { contains: query.search, mode: 'insensitive' } },
          { operatingSystemName: { contains: query.search, mode: 'insensitive' } },
          { browserName: { contains: query.search, mode: 'insensitive' } },
          { user: { name: { contains: query.search, mode: 'insensitive' } } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [devices, total] = await Promise.all([
      this.prisma.chatDevice.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          key: { select: { version: true, fingerprint: true, status: true } },
        },
        orderBy: chatDeviceOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.chatDevice.count({ where }),
    ]);
    return {
      devices: devices.map((device) => ({
        ...publicChatDevice(device),
        member: device.user,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async revokeCommunityDevice(user: RequestUser, deviceId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatDevicesRevoke, user.communityId);
    return this.revokeDevice(user, deviceId, { action: 'chat.device.revoked.admin' });
  }

  async chatGovernanceSettings(user: RequestUser) {
    if (!user.permissions.includes(PERMISSIONS.chatDeviceLimitManage)
      && !user.permissions.includes(PERMISSIONS.chatStorageManage)
      && !user.permissions.includes(PERMISSIONS.chatStorageView)) {
      throw new ForbiddenException('Insufficient permission.');
    }
    const settings = await this.prisma.communitySettings.findUnique({
      where: { communityId: user.communityId },
      select: {
        maxActiveChatDevices: true,
        chatMediaQuotaBytes: true,
        chatMediaWarningPercent: true,
        chatAttachmentMaxBytes: true,
        timezone: true,
      },
    });
    return {
      maxActiveChatDevices: settings?.maxActiveChatDevices ?? defaultMaxActiveChatDevices,
      chatMediaQuotaBytes: settings?.chatMediaQuotaBytes?.toString() ?? null,
      chatMediaWarningPercent: settings?.chatMediaWarningPercent ?? 80,
      chatAttachmentMaxBytes: settings?.chatAttachmentMaxBytes ?? maxEncryptedAttachmentSize,
      timezone: settings?.timezone ?? 'UTC',
    };
  }

  async updateChatGovernanceSettings(user: RequestUser, body: Record<string, unknown>) {
    const updates: Prisma.CommunitySettingsUpdateInput = {};
    if (body.maxActiveChatDevices !== undefined) {
      await this.permissions.requirePermission(user, PERMISSIONS.chatDeviceLimitManage, user.communityId);
      const limit = Number(body.maxActiveChatDevices);
      if (!Number.isInteger(limit) || limit < minActiveChatDevices || limit > maxActiveChatDevices) {
        throw new BadRequestException('Maximum active chat devices must be between 1 and 8.');
      }
      updates.maxActiveChatDevices = limit;
    }
    if (body.chatMediaQuotaBytes !== undefined || body.chatMediaWarningPercent !== undefined || body.chatAttachmentMaxBytes !== undefined) {
      await this.permissions.requirePermission(user, PERMISSIONS.chatStorageManage, user.communityId);
      if (body.chatMediaQuotaBytes !== undefined) updates.chatMediaQuotaBytes = nullableBigInt(body.chatMediaQuotaBytes, 'Chat media quota');
      if (body.chatMediaWarningPercent !== undefined) {
        const warning = Number(body.chatMediaWarningPercent);
        if (!Number.isInteger(warning) || warning < 1 || warning > 100) throw new BadRequestException('Storage warning threshold must be between 1 and 100.');
        updates.chatMediaWarningPercent = warning;
      }
      if (body.chatAttachmentMaxBytes !== undefined) {
        const maximum = Number(body.chatAttachmentMaxBytes);
        if (!Number.isInteger(maximum) || maximum < 1 || maximum > maxEncryptedAttachmentSize) {
          throw new BadRequestException('Attachment size limit is invalid.');
        }
        updates.chatAttachmentMaxBytes = maximum;
      }
    }
    if (!Object.keys(updates).length) throw new BadRequestException('No chat governance setting was provided.');
    const previous = await this.chatGovernanceSettings(user);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.communitySettings.upsert({
        where: { communityId: user.communityId },
        update: {},
        create: { communityId: user.communityId },
      });
      const settings = await tx.communitySettings.update({
        where: { communityId: user.communityId },
        data: updates,
      });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'chat.governance.settings.updated',
          targetType: 'CommunitySettings',
          targetId: settings.id,
          metadata: {
            maxActiveChatDevices: settings.maxActiveChatDevices,
            chatMediaQuotaBytes: settings.chatMediaQuotaBytes?.toString() ?? null,
            chatMediaWarningPercent: settings.chatMediaWarningPercent,
            chatAttachmentMaxBytes: settings.chatAttachmentMaxBytes,
            previous,
          },
        },
      });
      return settings;
    });
    return {
      maxActiveChatDevices: updated.maxActiveChatDevices,
      chatMediaQuotaBytes: updated.chatMediaQuotaBytes?.toString() ?? null,
      chatMediaWarningPercent: updated.chatMediaWarningPercent,
      chatAttachmentMaxBytes: updated.chatAttachmentMaxBytes,
      timezone: updated.timezone,
    };
  }

  async storageSummary(user: RequestUser) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatStorageView, user.communityId);
    const [usage, settings, largestConversations, largestAttachments, recentOperations] = await Promise.all([
      this.prisma.communityChatStorageUsage.upsert({
        where: { communityId: user.communityId },
        update: {},
        create: { communityId: user.communityId },
      }),
      this.prisma.communitySettings.findUnique({
        where: { communityId: user.communityId },
        select: { chatMediaQuotaBytes: true, chatMediaWarningPercent: true, chatAttachmentMaxBytes: true },
      }),
      this.prisma.chatAttachment.groupBy({
        by: ['conversationId'],
        where: { communityId: user.communityId, lifecycleStatus: 'ACTIVE', deletedAt: null },
        _sum: { encryptedSize: true },
        _count: { id: true },
        orderBy: { _sum: { encryptedSize: 'desc' } },
        take: 5,
      }),
      this.prisma.chatAttachment.findMany({
        where: { communityId: user.communityId, lifecycleStatus: 'ACTIVE', deletedAt: null },
        select: { id: true, conversationId: true, encryptedSize: true, mediaCategory: true, createdAt: true },
        orderBy: { encryptedSize: 'desc' },
        take: 10,
      }),
      this.prisma.chatMediaDeletionOperation.findMany({
        where: { communityId: user.communityId },
        select: { id: true, attachmentId: true, status: true, attempts: true, errorCode: true, requestedAt: true, completedAt: true },
        orderBy: { requestedAt: 'desc' },
        take: 10,
      }),
    ]);
    return {
      usage: serializeStorageUsage(usage),
      quotaBytes: settings?.chatMediaQuotaBytes?.toString() ?? null,
      warningPercent: settings?.chatMediaWarningPercent ?? 80,
      attachmentMaxBytes: settings?.chatAttachmentMaxBytes ?? maxEncryptedAttachmentSize,
      largestConversations: largestConversations.map((item) => ({
        conversationId: item.conversationId,
        encryptedBytes: String(item._sum.encryptedSize ?? 0),
        attachmentCount: item._count.id,
      })),
      largestAttachments: largestAttachments.map(serializeAttachmentAudit),
      recentOperations,
    };
  }

  async storageAttachments(user: RequestUser, input: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatStorageView, user.communityId);
    const query = parseMediaListQuery(input);
    const where: Prisma.ChatAttachmentWhereInput = {
      communityId: user.communityId,
      ...(query.category ? { mediaCategory: query.category } : {}),
      ...(query.lifecycleStatus ? { lifecycleStatus: query.lifecycleStatus } : {}),
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.uploaderId ? { senderId: query.uploaderId } : {}),
      ...(query.minimumSizeBytes !== null ? { encryptedSize: { gte: query.minimumSizeBytes } } : {}),
      ...(query.search ? {
        OR: [
          { id: { contains: query.search, mode: 'insensitive' } },
          { conversationId: { contains: query.search, mode: 'insensitive' } },
          { conversation: { title: { contains: query.search, mode: 'insensitive' } } },
          { sender: { name: { contains: query.search, mode: 'insensitive' } } },
          { sender: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [attachments, total] = await Promise.all([
      this.prisma.chatAttachment.findMany({
        where,
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          encryptedSize: true,
          mediaCategory: true,
          lifecycleStatus: true,
          viewOnce: true,
          createdAt: true,
          retentionExpiresAt: true,
          deletionRequestedAt: true,
          deletionCompletedAt: true,
          deletionAttempts: true,
          deletionError: true,
          sender: { select: { id: true, name: true, email: true } },
          conversation: { select: { id: true, title: true, type: true } },
          deletionOperations: {
            select: { id: true, status: true, attempts: true, errorCode: true, requestedAt: true, completedAt: true },
            orderBy: { requestedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: chatMediaOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.chatAttachment.count({ where }),
    ]);
    return {
      attachments: attachments.map((attachment) => ({
        ...serializeAttachmentAudit(attachment),
        uploader: attachment.sender,
        conversation: {
          id: attachment.conversation.id,
          label: attachment.conversation.title || `…${attachment.conversation.id.slice(-6)}`,
          type: attachment.conversation.type,
        },
        deletionAttempts: attachment.deletionAttempts,
        deletionErrorCategory: attachment.deletionError,
        latestDeletionOperation: attachment.deletionOperations[0] ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async requestMediaDeletion(user: RequestUser, attachmentId: string, body: Record<string, unknown>) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatMediaDelete, user.communityId);
    const reason = optionalBoundedString(body.reason, 500) ?? null;
    const idempotencyKey = optionalBoundedString(body.idempotencyKey, 128) ?? randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const attachment = await tx.chatAttachment.findFirst({
        where: { id: attachmentId, communityId: user.communityId },
      });
      if (!attachment) throw new NotFoundException('Attachment not found.');
      const existing = await tx.chatMediaDeletionOperation.findUnique({ where: { idempotencyKey } });
      if (existing) return { operation: existing, enqueue: existing.status === 'PENDING' || existing.status === 'FAILED' };
      if (attachment.lifecycleStatus === 'DELETED') {
        throw new ConflictException('Attachment is already deleted.');
      }
      const operation = await tx.chatMediaDeletionOperation.create({
        data: {
          communityId: user.communityId,
          attachmentId,
          requestedById: user.id,
          reason,
          idempotencyKey,
        },
      });
      await tx.chatAttachment.update({
        where: { id: attachment.id },
        data: { lifecycleStatus: 'PENDING_DELETION', deletionRequestedAt: new Date(), deletionError: null },
      });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'chat.media.deletion.requested',
          targetType: 'ChatAttachment',
          targetId: attachment.id,
          metadata: { operationId: operation.id, mediaCategory: attachment.mediaCategory, encryptedSize: attachment.encryptedSize },
        },
      });
      return { operation, enqueue: true };
    });
    if (result.enqueue) {
      await this.mediaQueue.add('chat-media-delete', { operationId: result.operation.id }, {
        jobId: `chat-media-delete:${result.operation.id}:${result.operation.attempts}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    }
    return { operation: result.operation };
  }

  async retryMediaDeletion(user: RequestUser, operationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatMediaDelete, user.communityId);
    const operation = await this.prisma.chatMediaDeletionOperation.findFirst({
      where: { id: operationId, communityId: user.communityId },
    });
    if (!operation) throw new NotFoundException('Deletion operation not found.');
    if (operation.status === 'COMPLETED') return { operation };
    if (operation.status === 'PROCESSING') throw new ConflictException('Deletion is already in progress.');
    const pending = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.chatMediaDeletionOperation.update({
        where: { id: operation.id },
        data: { status: 'PENDING', errorCode: null },
      });
      await tx.chatAttachment.updateMany({
        where: { id: operation.attachmentId, lifecycleStatus: { not: 'DELETED' } },
        data: { lifecycleStatus: 'PENDING_DELETION', deletionError: null },
      });
      return updated;
    });
    await this.mediaQueue.add('chat-media-delete', { operationId: pending.id }, {
      jobId: `chat-media-delete:${pending.id}:${pending.attempts}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
    return { operation: pending };
  }

  async reconcileStorage(user: RequestUser) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatStorageManage, user.communityId);
    const aggregate = await this.prisma.chatAttachment.groupBy({
      by: ['mediaCategory'],
      where: { communityId: user.communityId, lifecycleStatus: 'ACTIVE', deletedAt: null },
      _sum: { encryptedSize: true },
      _count: { id: true },
    });
    const totals = storageTotalsFromAggregate(aggregate);
    const usage = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.communityChatStorageUsage.upsert({
        where: { communityId: user.communityId },
        update: totals,
        create: { communityId: user.communityId, ...totals },
      });
      await tx.auditLog.create({
        data: {
          communityId: user.communityId,
          actorUserId: user.id,
          action: 'chat.storage.reconciled',
          targetType: 'CommunityChatStorageUsage',
          targetId: user.communityId,
          metadata: { attachmentCount: totals.attachmentCount.toString(), totalBytes: totals.totalBytes.toString() },
        },
      });
      return updated;
    });
    return { usage: serializeStorageUsage(usage) };
  }

  async conversationPresence(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participants = await this.conversationPresenceSnapshot(user, conversationId);
    return { presence: participants };
  }

  async ensureParticipant(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    return this.requireParticipant(user, conversationId);
  }

  async conversationParticipantUserIds(user: RequestUser, conversationId: string) {
    await this.requireParticipant(user, conversationId);
    const participants = await this.prisma.chatConversationParticipant.findMany({
      where: {
        conversationId,
        archivedAt: null,
        deletedAt: null,
        conversation: { communityId: user.communityId, archivedAt: null },
      },
      select: { userId: true },
    });
    return participants.map((participant) => participant.userId);
  }

  async conversationPresenceSnapshot(user: RequestUser, conversationId: string) {
    const participantUserIds = await this.conversationParticipantUserIds(user, conversationId);
    const presence = await this.prisma.chatPresence.findMany({
      where: {
        communityId: user.communityId,
        userId: { in: participantUserIds },
      },
      select: { userId: true, lastSeenAt: true },
    });
    const presenceByUser = new Map(presence.map((item) => [item.userId, item.lastSeenAt]));
    return participantUserIds.map((userId) => ({
      userId,
      lastSeenAt: presenceByUser.get(userId) ?? null,
    }));
  }

  async markPresenceSeen(user: RequestUser, seenAt = new Date()) {
    await this.prisma.chatPresence.upsert({
      where: { userId_communityId: { userId: user.id, communityId: user.communityId } },
      update: { lastSeenAt: seenAt },
      create: { userId: user.id, communityId: user.communityId, lastSeenAt: seenAt },
    });
    return { userId: user.id, communityId: user.communityId, lastSeenAt: seenAt };
  }

  async markDelivered(user: RequestUser, conversationId: string, messageId: string) {
    await this.requireParticipant(user, conversationId);
    const existing = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        conversationId,
        conversation: { communityId: user.communityId },
      },
      select: { id: true },
    });
    if (!existing) throw new ForbiddenException('Conversation access denied.');
    const message = await this.prisma.chatMessage.update({
      where: { id: existing.id },
      data: { deliveredAt: new Date() },
    });
    return {
      messageId: message.id,
      conversationId: message.conversationId,
      deliveredAt: message.deliveredAt,
    };
  }

  async markSeen(user: RequestUser, conversationId: string) {
    const participant = await this.requireParticipant(user, conversationId);
    const seenAt = new Date();
    await this.prisma.chatConversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: seenAt },
    });
    return { conversationId, userId: user.id, seenAt };
  }

  async clearConversationForMe(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participant = await this.requireParticipant(user, conversationId);
    const clearedAt = new Date();
    await this.prisma.chatConversationParticipant.update({
      where: { id: participant.id },
      data: { clearedAt },
    });
    return { conversationId, clearedAt };
  }

  async deleteConversationForMe(user: RequestUser, conversationId: string) {
    await this.permissions.requirePermission(user, PERMISSIONS.chatView, user.communityId);
    const participant = await this.requireParticipant(user, conversationId);
    const deletedAt = new Date();
    await this.prisma.chatConversationParticipant.update({
      where: { id: participant.id },
      data: {
        clearedAt: deletedAt,
        deletedAt,
      },
    });
    return { conversationId, deletedAt };
  }

  private async messageReactionSummary(messageId: string, currentUserId: string) {
    const reactions = await this.prisma.chatMessageReaction.findMany({
      where: { messageId },
      select: { emoji: true, userId: true },
      orderBy: { updatedAt: 'asc' },
    });
    return reactionSummary(reactions, currentUserId);
  }

  private async resolveMessageKeyReferences(
    user: RequestUser,
    conversationId: string,
    payload: ReturnType<typeof encryptedMessagePayload>,
  ) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, communityId: user.communityId, archivedAt: null },
      select: {
        type: true,
        participants: {
          where: { archivedAt: null, deletedAt: null },
          select: { userId: true },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');

    const senderKeyVersionId = payload.senderKeyVersionId ?? await this.activeKeyId(user.communityId, user.id);
    if (!senderKeyVersionId) throw new ConflictException('CHAT_SENDER_KEY_REQUIRED');
    await this.requireUsableKey(user.communityId, user.id, senderKeyVersionId);

    if (conversation.type === 'GROUP') {
      const groupPayload = parseGroupMessageEnvelope(payload.encryptedPayload);
      for (const participant of conversation.participants) {
        const keyId = groupPayload.recipients[participant.userId]?.encryptionKeyVersion;
        if (!keyId) throw new BadRequestException('Encrypted group recipient key reference is required.');
        await this.requireUsableKey(user.communityId, participant.userId, keyId);
      }
      return { senderKeyVersionId, recipientKeyVersionId: null };
    }

    const recipient = conversation.participants.find((participant) => participant.userId !== user.id);
    if (!recipient) throw new BadRequestException('Direct conversation recipient is missing.');
    const recipientKeyVersionId = payload.recipientKeyVersionId ?? payload.encryptionKeyVersion;
    if (!recipientKeyVersionId) throw new BadRequestException('Recipient key version is required.');
    await this.requireUsableKey(user.communityId, recipient.userId, recipientKeyVersionId);
    return { senderKeyVersionId, recipientKeyVersionId };
  }

  private async activeKeyId(communityId: string, userId: string) {
    const key = await this.prisma.chatDeviceKey.findFirst({
      where: {
        communityId,
        userId,
        status: 'ACTIVE',
        revokedAt: null,
        devices: { some: { status: 'ACTIVE', revokedAt: null } },
      },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    return key?.id ?? null;
  }

  private async requireUsableKey(communityId: string, userId: string, keyId: string) {
    const key = await this.prisma.chatDeviceKey.findFirst({
      where: {
        id: keyId,
        communityId,
        userId,
        status: 'ACTIVE',
        revokedAt: null,
        devices: { some: { status: 'ACTIVE', revokedAt: null } },
      },
      select: { id: true },
    });
    if (!key) throw new ConflictException('CHAT_KEY_VERSION_UNAVAILABLE');
    return key;
  }

  private async revokeDevice(
    actor: RequestUser,
    deviceId: string,
    options: { targetUserId?: string; currentDeviceIdentifier?: string; action: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockChatDeviceEnrollment(tx, actor.communityId, options.targetUserId ?? deviceId);
      const device = await tx.chatDevice.findFirst({
        where: {
          id: deviceId,
          communityId: actor.communityId,
          ...(options.targetUserId ? { userId: options.targetUserId } : {}),
        },
      });
      if (!device) throw new NotFoundException('Device not found.');
      if (device.status === 'REVOKED') return { device: publicChatDevice(device, options.currentDeviceIdentifier), alreadyRevoked: true };
      const revokedAt = new Date();
      const revoked = await tx.chatDevice.update({
        where: { id: device.id },
        data: { status: 'REVOKED', revokedAt, revokedById: actor.id },
      });
      const remainingForKey = await tx.chatDevice.count({
        where: { keyId: device.keyId, status: 'ACTIVE', revokedAt: null },
      });
      if (remainingForKey === 0) {
        await tx.chatDeviceKey.update({
          where: { id: device.keyId },
          data: { status: 'REVOKED', revokedAt },
        });
      }
      await tx.auditLog.create({
        data: {
          communityId: actor.communityId,
          actorUserId: actor.id,
          action: options.action,
          targetType: 'ChatDevice',
          targetId: device.id,
          metadata: { targetUserId: device.userId, keyId: device.keyId },
        },
      });
      return {
        device: publicChatDevice(revoked, options.currentDeviceIdentifier),
        alreadyRevoked: false,
        currentDevice: device.deviceIdentifier === options.currentDeviceIdentifier,
      };
    });
  }

  private async requireParticipant(user: RequestUser, conversationId: string) {
    const participant = await this.prisma.chatConversationParticipant.findFirst({
      where: {
        userId: user.id,
        conversationId,
        archivedAt: null,
        deletedAt: null,
        conversation: {
          communityId: user.communityId,
          archivedAt: null,
        },
      },
      select: { id: true, role: true, clearedAt: true, deletedAt: true, mutedAt: true },
    });
    if (!participant) throw new ForbiddenException('Conversation access denied.');
    return participant;
  }

  private async requireGroupParticipant(user: RequestUser, conversationId: string) {
    const participant = await this.prisma.chatConversationParticipant.findFirst({
      where: {
        userId: user.id,
        conversationId,
        archivedAt: null,
        deletedAt: null,
        conversation: {
          communityId: user.communityId,
          type: 'GROUP',
          archivedAt: null,
        },
      },
      select: { id: true, role: true, clearedAt: true },
    });
    if (!participant) throw new ForbiddenException('Group access denied.');
    return participant;
  }

  private async requireGroupOwner(user: RequestUser, conversationId: string) {
    const participant = await this.requireGroupParticipant(user, conversationId);
    if (participant.role !== 'OWNER') throw new ForbiddenException('Only the group owner can manage members.');
    return participant;
  }

  private async conversationById(communityId: string, conversationId: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, communityId, archivedAt: null },
      include: conversationInclude(communityId),
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    return serializeConversation(conversation);
  }

  private async findDirectConversation(communityId: string, currentUserId: string, targetUserId: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        communityId,
        type: 'DIRECT',
        archivedAt: null,
        AND: [
          { participants: { some: { userId: currentUserId, archivedAt: null } } },
          { participants: { some: { userId: targetUserId, archivedAt: null } } },
        ],
      },
      include: conversationInclude(communityId),
      orderBy: { updatedAt: 'desc' },
    });
    return conversation ? serializeConversation(conversation) : null;
  }

  private async conversationsForUser(communityId: string, userId: string) {
    const conversations = await this.prisma.chatConversation.findMany({
      where: {
        communityId,
        archivedAt: null,
        participants: { some: { userId, archivedAt: null, deletedAt: null } },
      },
      include: conversationInclude(communityId),
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    });
    const conversationMetadata = await Promise.all(conversations.map(async (conversation) => {
      const participant = conversation.participants.find((item) => item.userId === userId);
      const unreadAfter = visibleAfter(participant?.lastReadAt ?? null, participant?.clearedAt ?? null);
      const [unreadCount, latestMessage] = await Promise.all([
        this.prisma.chatMessage.count({
          where: {
            conversationId: conversation.id,
            deletedAt: null,
            deletedForEveryoneAt: null,
            senderId: { not: userId },
            hiddenForUsers: { none: { userId } },
            ...(unreadAfter ? { createdAt: { gt: unreadAfter } } : {}),
          },
        }),
        this.prisma.chatMessage.findFirst({
          where: {
            conversationId: conversation.id,
            deletedAt: null,
            hiddenForUsers: { none: { userId } },
            ...(participant?.clearedAt ? { createdAt: { gt: participant.clearedAt } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          select: { senderId: true },
        }),
      ]);
      return [conversation.id, { unreadCount, lastMessageSenderId: latestMessage?.senderId ?? null }] as const;
    }));
    const metadataByConversation = new Map(conversationMetadata);
    return Promise.all(conversations.map(async (conversation) => {
      const otherDirectParticipant = conversation.type === 'DIRECT'
        ? conversation.participants.find((item) => item.userId !== userId)
        : null;
      return {
        ...serializeConversation(conversation),
        unreadCount: metadataByConversation.get(conversation.id)?.unreadCount ?? 0,
        lastMessageSenderId: metadataByConversation.get(conversation.id)?.lastMessageSenderId ?? null,
        blockState: otherDirectParticipant ? await this.directBlockState(userId, otherDirectParticipant.userId) : null,
      };
    }));
  }

  private async requireActiveCommunityMember(communityId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_communityId: { userId, communityId } },
      select: { userId: true, status: true },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) throw new NotFoundException('Target member is not available.');
    return membership;
  }

  private async assertNoDirectBlock(communityId: string, userId: string, targetUserId: string) {
    await this.requireActiveCommunityMember(communityId, targetUserId);
    const blocked = await this.prisma.chatUserBlock.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedUserId: targetUserId },
          { blockerId: targetUserId, blockedUserId: userId },
        ],
      },
      select: { id: true },
    });
    if (blocked) throw new ForbiddenException('Direct chat is blocked.');
  }

  private async assertConversationSendAllowed(user: RequestUser, conversationId: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id: conversationId, communityId: user.communityId, archivedAt: null },
      select: {
        type: true,
        participants: {
          where: { archivedAt: null, deletedAt: null },
          select: { userId: true },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    if (conversation.type !== 'DIRECT') return;
    const otherParticipant = conversation.participants.find((participant) => participant.userId !== user.id);
    if (!otherParticipant) throw new BadRequestException('Direct conversation participant is missing.');
    await this.assertNoDirectBlock(user.communityId, user.id, otherParticipant.userId);
  }

  private async directBlockState(currentUserId: string, otherUserId: string) {
    const blocks = await this.prisma.chatUserBlock.findMany({
      where: {
        OR: [
          { blockerId: currentUserId, blockedUserId: otherUserId },
          { blockerId: otherUserId, blockedUserId: currentUserId },
        ],
      },
      select: { blockerId: true, blockedUserId: true },
    });
    return {
      blockedUserId: otherUserId,
      blockedByMe: blocks.some((block) => block.blockerId === currentUserId && block.blockedUserId === otherUserId),
      blockedMe: blocks.some((block) => block.blockerId === otherUserId && block.blockedUserId === currentUserId),
    };
  }

  private async createDirectConversation(communityId: string, currentUserId: string, targetUserId: string) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingInsideTransaction = await findDirectConversationWithClient(tx, communityId, currentUserId, targetUserId);
        if (existingInsideTransaction) {
          await tx.chatConversationParticipant.updateMany({
            where: {
              conversationId: existingInsideTransaction.id,
              userId: currentUserId,
              archivedAt: null,
              deletedAt: { not: null },
            },
            data: { deletedAt: null },
          });
          return {
            conversation: await findDirectConversationWithClient(tx, communityId, currentUserId, targetUserId) ?? existingInsideTransaction,
            created: false,
          };
        }
        const created = await tx.chatConversation.create({
          data: {
            communityId,
            type: 'DIRECT',
            createdById: currentUserId,
            participants: {
              create: [
                { userId: currentUserId, role: 'MEMBER' },
                { userId: targetUserId, role: 'MEMBER' },
              ],
            },
          },
          include: conversationInclude(communityId),
        });
        return { conversation: serializeConversation(created), created: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        const existing = await this.findDirectConversation(communityId, currentUserId, targetUserId);
        if (existing) {
          await this.prisma.chatConversationParticipant.updateMany({
            where: {
              conversationId: existing.id,
              userId: currentUserId,
              archivedAt: null,
              deletedAt: { not: null },
            },
            data: { deletedAt: null },
          });
          return {
            conversation: await this.findDirectConversation(communityId, currentUserId, targetUserId) ?? existing,
            created: false,
          };
        }
      }
      throw error;
    }
  }
}

function encryptedMessagePayload(body: Record<string, unknown>) {
  const forbiddenField = forbiddenPlaintextFields.find((field) => body[field] !== undefined);
  if (forbiddenField) throw new BadRequestException(`Plaintext chat field "${forbiddenField}" is not accepted.`);
  const encryptedPayload = boundedString(body.encryptedPayload, 'Encrypted payload is required.', maxEncryptedPayloadLength);
  const encryptionNonce = boundedString(body.encryptionNonce, 'Encryption nonce is required.', maxEncryptedFieldLength);
  const encryptionAlgorithmVersion = boundedString(body.encryptionAlgorithmVersion, 'Encryption algorithm version is required.', maxEncryptedFieldLength);
  const encryptionKeyVersion = optionalBoundedString(body.encryptionKeyVersion, maxEncryptedFieldLength);
  const senderKeyVersionId = optionalBoundedString(body.senderKeyVersionId, maxEncryptedFieldLength);
  const recipientKeyVersionId = optionalBoundedString(body.recipientKeyVersionId, maxEncryptedFieldLength);
  return { encryptedPayload, encryptionNonce, encryptionAlgorithmVersion, encryptionKeyVersion, senderKeyVersionId, recipientKeyVersionId };
}

function boundedString(value: unknown, message: string, maxLength: number) {
  const next = stringValue(value);
  if (!next) throw new BadRequestException(message);
  if (next.length > maxLength) throw new BadRequestException('Encrypted message field is too large.');
  return next;
}

function optionalBoundedString(value: unknown, maxLength: number) {
  const next = stringValue(value);
  if (!next) return undefined;
  if (next.length > maxLength) throw new BadRequestException('Encrypted message field is too large.');
  return next;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter(Boolean);
}

function booleanValue(value: unknown) {
  return value === true || value === 'true';
}

function reactionEmojiValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const emoji = stringValue(value);
  if (!allowedChatReactionEmojis.includes(emoji as typeof allowedChatReactionEmojis[number])) {
    throw new BadRequestException('Unsupported reaction emoji.');
  }
  return emoji;
}

function reportReasonValue(value: unknown) {
  const reason = stringValue(value);
  if (!allowedChatReportReasons.includes(reason as typeof allowedChatReportReasons[number])) {
    throw new BadRequestException('Unsupported report reason.');
  }
  return reason;
}

function reportNoteValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const note = stringValue(value).trim();
  if (!note) return null;
  if (note.length > maxReportNoteLength) throw new BadRequestException('Report note is too long.');
  return note;
}

function visibleAfter(first: Date | null | undefined, second: Date | null | undefined) {
  if (first && second) return first > second ? first : second;
  return first ?? second ?? null;
}

function publicDeviceKey(key: { id: string; userId: string; communityId: string; publicKey: string; fingerprint: string | null; algorithm: string; version: number; status: string; createdAt: Date; activatedAt: Date | null; retiredAt: Date | null; rotatedAt: Date | null; revokedAt: Date | null }) {
  return {
    id: key.id,
    userId: key.userId,
    communityId: key.communityId,
    publicKey: key.publicKey,
    fingerprint: key.fingerprint,
    algorithm: key.algorithm,
    version: key.version,
    status: key.status,
    createdAt: key.createdAt,
    activatedAt: key.activatedAt,
    retiredAt: key.retiredAt,
    rotatedAt: key.rotatedAt,
    revokedAt: key.revokedAt,
  };
}

function publicMessage(message: {
  id: string;
  conversationId: string;
  senderId: string;
  encryptedPayload: string;
  encryptionNonce: string;
  encryptionAlgorithmVersion: string;
  encryptionKeyVersion: string | null;
  senderKeyVersionId?: string | null;
  recipientKeyVersionId?: string | null;
  createdAt: Date;
  editedAt?: Date | null;
  deliveredAt: Date | null;
  deletedForEveryoneAt?: Date | null;
  deletedById?: string | null;
  reactions?: { emoji: string; userId: string }[];
  stars?: { id: string }[];
}, currentUserId?: string) {
  const deletedForEveryone = Boolean(message.deletedForEveryoneAt);
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    encryptedPayload: deletedForEveryone ? undefined : message.encryptedPayload,
    encryptionNonce: deletedForEveryone ? undefined : message.encryptionNonce,
    encryptionAlgorithmVersion: message.encryptionAlgorithmVersion,
    encryptionKeyVersion: deletedForEveryone ? null : message.encryptionKeyVersion,
    senderKeyVersionId: deletedForEveryone ? null : message.senderKeyVersionId ?? null,
    recipientKeyVersionId: deletedForEveryone ? null : message.recipientKeyVersionId ?? null,
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    deliveredAt: message.deliveredAt,
    deletedForEveryoneAt: message.deletedForEveryoneAt ?? null,
    deletedById: message.deletedById ?? null,
    reactions: reactionSummary(message.reactions ?? [], currentUserId),
    starred: !deletedForEveryone && Boolean(message.stars?.length),
  };
}

function reactionSummary(reactions: { emoji: string; userId: string }[], currentUserId?: string) {
  const byEmoji = new Map<string, { emoji: string; count: number; reactedByCurrentUser: boolean; userIds: string[] }>();
  for (const reaction of reactions) {
    if (!allowedChatReactionEmojis.includes(reaction.emoji as typeof allowedChatReactionEmojis[number])) continue;
    const existing = byEmoji.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, reactedByCurrentUser: false, userIds: [] };
    existing.count += 1;
    existing.userIds.push(reaction.userId);
    if (currentUserId && reaction.userId === currentUserId) existing.reactedByCurrentUser = true;
    byEmoji.set(reaction.emoji, existing);
  }
  return allowedChatReactionEmojis
    .map((emoji) => byEmoji.get(emoji))
    .filter((reaction): reaction is { emoji: string; count: number; reactedByCurrentUser: boolean; userIds: string[] } => Boolean(reaction));
}

function publicAttachment(attachment: { id: string; conversationId: string; senderId: string; encryptedSize: number; mediaCategory?: string; lifecycleStatus?: string; viewOnce: boolean; encryptionNonce: string; encryptionAlgorithmVersion: string; createdAt: Date }) {
  return {
    id: attachment.id,
    conversationId: attachment.conversationId,
    senderId: attachment.senderId,
    encryptedSize: attachment.encryptedSize,
    mediaCategory: attachment.mediaCategory,
    lifecycleStatus: attachment.lifecycleStatus,
    viewOnce: attachment.viewOnce,
    encryptionNonce: attachment.encryptionNonce,
    encryptionAlgorithmVersion: attachment.encryptionAlgorithmVersion,
    createdAt: attachment.createdAt,
  };
}

async function groupParticipantList(prisma: PrismaService, communityId: string, conversationId: string) {
  const participants = await prisma.chatConversationParticipant.findMany({
    where: {
      conversationId,
      archivedAt: null,
      deletedAt: null,
      conversation: { communityId, archivedAt: null },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          memberships: {
            where: { communityId },
            include: { profile: true },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ role: 'desc' }, { joinedAt: 'asc' }],
  });
  return participants.map((participant) => {
    const membership = participant.user.memberships[0];
    return {
      id: participant.id,
      userId: participant.userId,
      name: participant.user.name,
      email: participant.user.email,
      role: participant.role,
      title: membership?.profile?.title ?? null,
      avatarUrl: membership?.profile?.avatarUrl ?? null,
      dicebearStyle: membership?.profile?.dicebearStyle ?? null,
      dicebearSeed: membership?.profile?.dicebearSeed ?? null,
      joinedAt: participant.joinedAt,
    };
  });
}

async function findDirectConversationWithClient(client: Prisma.TransactionClient, communityId: string, currentUserId: string, targetUserId: string) {
  const conversation = await client.chatConversation.findFirst({
    where: {
      communityId,
      type: 'DIRECT',
      archivedAt: null,
      AND: [
        { participants: { some: { userId: currentUserId, archivedAt: null } } },
        { participants: { some: { userId: targetUserId, archivedAt: null } } },
      ],
    },
    include: conversationInclude(communityId),
    orderBy: { updatedAt: 'desc' },
  });
  return conversation ? serializeConversation(conversation) : null;
}

function conversationInclude(communityId: string) {
  return {
    participants: {
      where: { archivedAt: null, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            memberships: {
              where: { communityId },
              include: { role: true, profile: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' as const },
    },
  };
}

type ConversationWithParticipants = Prisma.ChatConversationGetPayload<{
  include: ReturnType<typeof conversationInclude>;
}>;

function serializeConversation(conversation: ConversationWithParticipants) {
  return {
    id: conversation.id,
    type: conversation.type,
    title: conversation.title ?? null,
    avatarUrl: conversation.avatarUrl ?? null,
    createdById: conversation.createdById,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessageAt: conversation.lastMessageAt,
    participants: conversation.participants.map((participant) => {
      const membership = participant.user.memberships[0];
      return {
        id: participant.id,
        userId: participant.userId,
        name: participant.user.name,
        role: membership?.role.key ?? 'member',
        title: membership?.profile?.title ?? null,
        avatarUrl: membership?.profile?.avatarUrl ?? null,
        dicebearStyle: membership?.profile?.dicebearStyle ?? null,
        dicebearSeed: membership?.profile?.dicebearSeed ?? null,
        joinedAt: participant.joinedAt,
        lastReadAt: participant.lastReadAt,
        mutedAt: participant.mutedAt,
      };
    }),
  };
}

export function chatPublicKeyFingerprint(publicKey: string) {
  let parsed: JsonWebKey;
  try {
    parsed = JSON.parse(publicKey) as JsonWebKey;
  } catch {
    throw new BadRequestException('Public key is not valid JSON.');
  }
  if (parsed.kty !== 'EC' || parsed.crv !== 'P-256' || !parsed.x || !parsed.y) {
    throw new BadRequestException('Public key is not a supported P-256 key.');
  }
  const canonical = JSON.stringify({ crv: parsed.crv, kty: parsed.kty, x: parsed.x, y: parsed.y });
  return createHash('sha256').update(canonical).digest('base64url');
}

function publicChatDevice(
  device: {
    id: string;
    userId: string;
    keyId: string;
    deviceIdentifier: string;
    displayName: string;
    generatedLabel: string | null;
    customDisplayName: string | null;
    deviceType: ChatDeviceType;
    operatingSystemName: string | null;
    operatingSystemVersion: string | null;
    browserName: string | null;
    browserVersion: string | null;
    status: string;
    createdAt: Date;
    lastSeenAt: Date | null;
    revokedAt: Date | null;
    key?: { version: number; fingerprint: string | null; status: string };
  },
  currentDeviceIdentifier?: string,
) {
  return {
    id: device.id,
    userId: device.userId,
    displayName: device.displayName,
    generatedLabel: device.generatedLabel,
    customDisplayName: device.customDisplayName,
    deviceType: device.deviceType,
    operatingSystemName: device.operatingSystemName,
    operatingSystemVersion: device.operatingSystemVersion,
    browserName: device.browserName,
    browserVersion: device.browserVersion,
    status: device.status,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt,
    current: Boolean(currentDeviceIdentifier && device.deviceIdentifier === currentDeviceIdentifier),
    keyVersion: device.key?.version ?? null,
    keyStatus: device.key?.status ?? null,
    fingerprintSummary: device.key?.fingerprint ? device.key.fingerprint.slice(0, 12) : null,
  };
}

export async function lockChatDeviceEnrollment(tx: Prisma.TransactionClient, communityId: string, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-device:${communityId}:${userId}`}))`;
}

async function lockChatStorage(tx: Prisma.TransactionClient, communityId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chat-storage:${communityId}`}))`;
}

export function assertChatDeviceLimit(value: number) {
  if (!Number.isInteger(value) || value < minActiveChatDevices || value > maxActiveChatDevices) {
    throw new ConflictException('Chat device limit is not configured safely.');
  }
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

type DeviceListQuery = {
  page: number;
  pageSize: number;
  search: string;
  status?: 'ACTIVE' | 'REVOKED';
  deviceType?: ChatDeviceType;
  operatingSystem?: string;
  browser?: string;
  sortBy: 'lastSeenAt' | 'createdAt' | 'displayName' | 'memberName' | 'status' | 'operatingSystemName' | 'browserName';
  sortOrder: Prisma.SortOrder;
};

function parseDeviceListQuery(input: Record<string, unknown>, admin: boolean): DeviceListQuery {
  const allowedSorts = admin
    ? ['lastSeenAt', 'createdAt', 'displayName', 'memberName', 'status', 'operatingSystemName', 'browserName'] as const
    : ['lastSeenAt', 'createdAt', 'displayName', 'status', 'operatingSystemName', 'browserName'] as const;
  return {
    page: positiveInteger(input.page, 1),
    pageSize: allowedPageSize(input.pageSize),
    search: governanceSearch(input.search),
    status: strictOptionalEnum(input.status, ['ACTIVE', 'REVOKED'] as const, 'device status'),
    deviceType: strictOptionalEnum(input.deviceType, ['DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN'] as const, 'device type') as ChatDeviceType | undefined,
    operatingSystem: optionalMetadataFilter(input.operatingSystem),
    browser: optionalMetadataFilter(input.browser),
    sortBy: strictOptionalEnum(input.sortBy, allowedSorts, 'device sort field') ?? 'lastSeenAt',
    sortOrder: strictOptionalEnum(input.sortOrder, ['asc', 'desc'] as const, 'sort order') ?? 'desc',
  };
}

function chatDeviceOrderBy(query: DeviceListQuery): Prisma.ChatDeviceOrderByWithRelationInput[] {
  const primary: Prisma.ChatDeviceOrderByWithRelationInput = query.sortBy === 'memberName'
    ? { user: { name: query.sortOrder } }
    : { [query.sortBy]: query.sortOrder };
  return [primary, { createdAt: 'desc' }, { id: 'asc' }];
}

type MediaListQuery = {
  page: number;
  pageSize: number;
  search: string;
  category?: ChatMediaCategory;
  lifecycleStatus?: 'ACTIVE' | 'PENDING_DELETION' | 'DELETING' | 'DELETED' | 'DELETE_FAILED';
  conversationId?: string;
  uploaderId?: string;
  minimumSizeBytes: number | null;
  sortBy: 'encryptedSize' | 'createdAt' | 'mediaCategory' | 'lifecycleStatus' | 'uploaderName' | 'conversationLabel';
  sortOrder: Prisma.SortOrder;
};

function parseMediaListQuery(input: Record<string, unknown>): MediaListQuery {
  const minimumSize = stringValue(input.minimumSizeBytes);
  const minimumSizeBytes = minimumSize ? Number(minimumSize) : null;
  if (minimumSizeBytes !== null && (!Number.isSafeInteger(minimumSizeBytes) || minimumSizeBytes < 0)) {
    throw new BadRequestException('Minimum encrypted size is invalid.');
  }
  return {
    page: positiveInteger(input.page, 1),
    pageSize: allowedPageSize(input.pageSize),
    search: governanceSearch(input.search),
    category: strictOptionalEnum(input.category, ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'OTHER'] as const, 'media category') as ChatMediaCategory | undefined,
    lifecycleStatus: strictOptionalEnum(input.status, ['ACTIVE', 'PENDING_DELETION', 'DELETING', 'DELETED', 'DELETE_FAILED'] as const, 'media status'),
    conversationId: optionalIdentifier(input.conversationId),
    uploaderId: optionalIdentifier(input.uploaderId),
    minimumSizeBytes,
    sortBy: strictOptionalEnum(input.sortBy, ['encryptedSize', 'createdAt', 'mediaCategory', 'lifecycleStatus', 'uploaderName', 'conversationLabel'] as const, 'media sort field') ?? 'encryptedSize',
    sortOrder: strictOptionalEnum(input.sortOrder, ['asc', 'desc'] as const, 'sort order') ?? 'desc',
  };
}

function chatMediaOrderBy(query: MediaListQuery): Prisma.ChatAttachmentOrderByWithRelationInput[] {
  const primary: Prisma.ChatAttachmentOrderByWithRelationInput = query.sortBy === 'uploaderName'
    ? { sender: { name: query.sortOrder } }
    : query.sortBy === 'conversationLabel'
      ? { conversation: { title: query.sortOrder } }
      : { [query.sortBy]: query.sortOrder };
  return [primary, { createdAt: 'desc' }, { id: 'asc' }];
}

function allowedPageSize(value: unknown) {
  const parsed = Number(value ?? 20);
  return devicePageSizes.includes(parsed as typeof devicePageSizes[number]) ? parsed : 20;
}

function governanceSearch(value: unknown) {
  const search = stringValue(value);
  if (search.length > maxGovernanceSearchLength) throw new BadRequestException('Search is too long.');
  return controlCharacterFree(search, 'Search');
}

function optionalMetadataFilter(value: unknown) {
  const parsed = stringValue(value);
  if (!parsed) return undefined;
  if (parsed.length > maxDeviceMetadataLength) throw new BadRequestException('Device filter is too long.');
  return controlCharacterFree(parsed, 'Device filter');
}

function optionalIdentifier(value: unknown) {
  const parsed = stringValue(value);
  if (!parsed) return undefined;
  if (parsed.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(parsed)) throw new BadRequestException('Identifier filter is invalid.');
  return parsed;
}

function strictOptionalEnum<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] | undefined {
  const parsed = stringValue(value);
  if (!parsed) return undefined;
  if (!values.includes(parsed as T[number])) throw new BadRequestException(`Invalid ${label}.`);
  return parsed as T[number];
}

function deviceDisplayName(value: unknown, message: string) {
  const name = stringValue(value);
  if (!name) throw new BadRequestException(message);
  if (name.length > maxDeviceDisplayNameLength) throw new BadRequestException('Device name is too long.');
  return controlCharacterFree(name, 'Device name');
}

function chatDeviceMetadata(body: Record<string, unknown>, fallbackLabel: string) {
  const generatedLabel = deviceDisplayName(body.generatedLabel ?? fallbackLabel, 'Device label is required.');
  return {
    generatedLabel,
    deviceType: strictOptionalEnum(body.deviceType, ['DESKTOP', 'MOBILE', 'TABLET', 'UNKNOWN'] as const, 'device type') ?? 'UNKNOWN',
    operatingSystemName: normalizedMetadata(body.operatingSystemName),
    operatingSystemVersion: normalizedMetadata(body.operatingSystemVersion, 32),
    browserName: normalizedMetadata(body.browserName),
    browserVersion: normalizedMetadata(body.browserVersion, 32),
  };
}

function normalizedMetadata(value: unknown, maximum = maxDeviceMetadataLength) {
  const parsed = stringValue(value);
  if (!parsed || parsed === 'Unknown') return null;
  if (parsed.length > maximum) throw new BadRequestException('Device metadata is too long.');
  return controlCharacterFree(parsed, 'Device metadata');
}

function controlCharacterFree(value: string, label: string) {
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new BadRequestException(`${label} contains invalid characters.`);
  return value;
}

function nullableBigInt(value: unknown, label: string) {
  if (value === null || value === '') return null;
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) {
    throw new BadRequestException(`${label} must be a positive whole number or empty.`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new BadRequestException(`${label} must be greater than zero.`);
  return parsed;
}

function optionalEnumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  const parsed = stringValue(value);
  return values.includes(parsed as T[number]) ? parsed as T[number] : undefined;
}

function chatMediaCategory(value: unknown): ChatMediaCategory {
  const category = stringValue(value).toUpperCase();
  if (category === 'PHOTO' || category === 'IMAGE') return ChatMediaCategory.IMAGE;
  if (category === 'VIDEO') return ChatMediaCategory.VIDEO;
  if (category === 'AUDIO') return ChatMediaCategory.AUDIO;
  if (category === 'DOCUMENT') return ChatMediaCategory.DOCUMENT;
  return ChatMediaCategory.OTHER;
}

function storageIncrement(category: ChatMediaCategory, encryptedBytes: bigint): Prisma.CommunityChatStorageUsageUpdateInput {
  const field = storageCategoryField(category);
  return {
    totalBytes: { increment: encryptedBytes },
    attachmentCount: { increment: 1n },
    [field]: { increment: encryptedBytes },
  };
}

function storageCategoryField(category: ChatMediaCategory) {
  if (category === ChatMediaCategory.IMAGE) return 'imageBytes';
  if (category === ChatMediaCategory.VIDEO) return 'videoBytes';
  if (category === ChatMediaCategory.AUDIO) return 'audioBytes';
  if (category === ChatMediaCategory.DOCUMENT) return 'documentBytes';
  return 'otherBytes';
}

function serializeStorageUsage(usage: {
  totalBytes: bigint;
  imageBytes: bigint;
  videoBytes: bigint;
  audioBytes: bigint;
  documentBytes: bigint;
  otherBytes: bigint;
  attachmentCount: bigint;
  updatedAt: Date;
}) {
  return {
    totalBytes: usage.totalBytes.toString(),
    imageBytes: usage.imageBytes.toString(),
    videoBytes: usage.videoBytes.toString(),
    audioBytes: usage.audioBytes.toString(),
    documentBytes: usage.documentBytes.toString(),
    otherBytes: usage.otherBytes.toString(),
    attachmentCount: usage.attachmentCount.toString(),
    updatedAt: usage.updatedAt,
  };
}

function serializeAttachmentAudit(attachment: {
  id: string;
  conversationId: string;
  senderId?: string;
  encryptedSize: number;
  mediaCategory: ChatMediaCategory;
  lifecycleStatus?: string;
  viewOnce?: boolean;
  createdAt: Date;
  retentionExpiresAt?: Date | null;
  deletionRequestedAt?: Date | null;
  deletionCompletedAt?: Date | null;
}) {
  return {
    id: attachment.id,
    conversationId: attachment.conversationId,
    senderId: attachment.senderId,
    encryptedBytes: String(attachment.encryptedSize),
    mediaCategory: attachment.mediaCategory,
    lifecycleStatus: attachment.lifecycleStatus,
    viewOnce: attachment.viewOnce,
    createdAt: attachment.createdAt,
    retentionExpiresAt: attachment.retentionExpiresAt,
    deletionRequestedAt: attachment.deletionRequestedAt,
    deletionCompletedAt: attachment.deletionCompletedAt,
  };
}

function storageTotalsFromAggregate(
  aggregate: Array<{ mediaCategory: ChatMediaCategory; _sum: { encryptedSize: number | null }; _count: { id: number } }>,
) {
  const totals = {
    totalBytes: 0n,
    imageBytes: 0n,
    videoBytes: 0n,
    audioBytes: 0n,
    documentBytes: 0n,
    otherBytes: 0n,
    attachmentCount: 0n,
  };
  for (const item of aggregate) {
    const bytes = BigInt(item._sum.encryptedSize ?? 0);
    totals.totalBytes += bytes;
    totals.attachmentCount += BigInt(item._count.id);
    totals[storageCategoryField(item.mediaCategory)] += bytes;
  }
  return totals;
}

function parseGroupMessageEnvelope(value: string) {
  try {
    const parsed = JSON.parse(value) as {
      kind?: string;
      version?: number;
      recipients?: Record<string, { encryptionKeyVersion?: string }>;
    };
    if (parsed.kind !== 'group-message' || parsed.version !== 1 || !parsed.recipients) throw new Error();
    return { recipients: parsed.recipients };
  } catch {
    throw new BadRequestException('Encrypted group payload metadata is invalid.');
  }
}
