import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireUser } from '../auth/require-user';
import { ChatService, UploadedEncryptedChatAttachmentFile } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly auth: AuthService,
    private readonly chat: ChatService,
  ) {}

  @Get('conversations')
  async conversations(@Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.conversations(user);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.unreadCount(user);
  }

  @Get('participants')
  async participants(@Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.participants(user);
  }

  @Get('keys/me')
  async myDeviceKey(@Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.myDeviceKey(user);
  }

  @Post('keys/me')
  async registerMyDeviceKey(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.registerMyDeviceKey(user, body);
  }

  @Post('keys/restore/verify')
  async verifyRestoredKey(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.verifyRestoredKey(user, body);
  }

  @Get('devices/me')
  async myDevices(@Req() req: Request, @Query() query: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.myDevices(user, query, requestDeviceIdentifier(req));
  }

  @Patch('devices/:deviceId')
  async renameMyDevice(@Req() req: Request, @Param('deviceId') deviceId: string, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.renameMyDevice(user, deviceId, body, requestDeviceIdentifier(req));
  }

  @Patch('devices/me/metadata')
  async enrichMyDeviceMetadata(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.enrichMyDeviceMetadata(user, body, requestDeviceIdentifier(req));
  }

  @Post('devices/:deviceId/revoke')
  async revokeMyDevice(@Req() req: Request, @Param('deviceId') deviceId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.revokeMyDevice(user, deviceId, requestDeviceIdentifier(req));
  }

  @Get('admin/devices')
  async communityDevices(@Req() req: Request, @Query() query: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.communityDevices(user, query);
  }

  @Post('admin/devices/:deviceId/revoke')
  async revokeCommunityDevice(@Req() req: Request, @Param('deviceId') deviceId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.revokeCommunityDevice(user, deviceId);
  }

  @Get('admin/settings')
  async chatGovernanceSettings(@Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.chatGovernanceSettings(user);
  }

  @Patch('admin/settings')
  async updateChatGovernanceSettings(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.updateChatGovernanceSettings(user, body);
  }

  @Get('admin/storage')
  async storageSummary(@Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.storageSummary(user);
  }

  @Get('admin/storage/attachments')
  async storageAttachments(@Req() req: Request, @Query() query: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.storageAttachments(user, query);
  }

  @Post('admin/storage/attachments/:attachmentId/delete')
  async requestMediaDeletion(
    @Req() req: Request,
    @Param('attachmentId') attachmentId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.requestMediaDeletion(user, attachmentId, body);
  }

  @Post('admin/storage/deletions/:operationId/retry')
  async retryMediaDeletion(@Req() req: Request, @Param('operationId') operationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.retryMediaDeletion(user, operationId);
  }

  @Post('admin/storage/reconcile')
  async reconcileStorage(@Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.reconcileStorage(user);
  }

  @Post('conversations/direct')
  async directConversation(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.directConversation(user, body);
  }

  @Post('conversations/group')
  async groupConversation(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.groupConversation(user, body);
  }

  @Get('conversations/:conversationId/participants')
  async conversationParticipants(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.conversationParticipants(user, conversationId);
  }

  @Patch('conversations/:conversationId/notification-settings')
  async updateConversationNotificationSettings(@Req() req: Request, @Param('conversationId') conversationId: string, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.updateNotificationSettings(user, conversationId, body);
  }

  @Patch('conversations/:conversationId')
  async updateConversation(@Req() req: Request, @Param('conversationId') conversationId: string, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.updateGroupConversation(user, conversationId, body);
  }

  @Post('conversations/:conversationId/transfer-ownership')
  async transferConversationOwnership(@Req() req: Request, @Param('conversationId') conversationId: string, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.transferGroupOwnership(user, conversationId, body);
  }

  @Post('conversations/:conversationId/participants')
  async addConversationParticipants(@Req() req: Request, @Param('conversationId') conversationId: string, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.addGroupParticipants(user, conversationId, body);
  }

  @Delete('conversations/:conversationId/participants/:userId')
  async removeConversationParticipant(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('userId') userId: string,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.removeGroupParticipant(user, conversationId, userId);
  }

  @Post('conversations/:conversationId/leave')
  async leaveConversation(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.leaveGroup(user, conversationId);
  }

  @Get('conversations/:conversationId/keys')
  async conversationDeviceKeys(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.conversationDeviceKeys(user, conversationId);
  }

  @Get('conversations/:conversationId/presence')
  async conversationPresence(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.conversationPresence(user, conversationId);
  }

  @Get('conversations/:conversationId/messages')
  async messages(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.messages(user, conversationId);
  }

  @Get('conversations/:conversationId/starred')
  async starredMessages(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.starredMessages(user, conversationId);
  }

  @Post('conversations/:conversationId/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadAttachment(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: UploadedEncryptedChatAttachmentFile | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.uploadAttachment(user, conversationId, file, body);
  }

  @Get('conversations/:conversationId/attachments/:attachmentId')
  async downloadAttachment(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    const { attachment, buffer } = await this.chat.downloadAttachment(user, conversationId, attachmentId);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.id}.bin"`);
    return res.send(buffer);
  }

  @Get('conversations/:conversationId/attachment-views')
  async attachmentViews(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.attachmentViews(user, conversationId);
  }

  @Post('conversations/:conversationId/attachments/:attachmentId/open')
  async openAttachment(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    const { attachment, buffer } = await this.chat.openAttachment(user, conversationId, attachmentId);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.id}.bin"`);
    return res.send(buffer);
  }

  @Patch('conversations/:conversationId/clear')
  async clearConversation(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.clearConversationForMe(user, conversationId);
  }

  @Patch('conversations/:conversationId/delete-for-me')
  async deleteConversationForMe(@Req() req: Request, @Param('conversationId') conversationId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.deleteConversationForMe(user, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  async createMessage(@Req() req: Request, @Param('conversationId') conversationId: string, @Body() body: Record<string, unknown>) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.createMessage(user, conversationId, body);
  }

  @Patch('conversations/:conversationId/messages/:messageId/delete-for-me')
  async deleteMessageForMe(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.hideMessageForMe(user, conversationId, messageId);
  }

  @Post('conversations/:conversationId/messages/:messageId/report')
  async reportMessage(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.reportMessage(user, conversationId, messageId, body);
  }

  @Patch('conversations/:conversationId/messages/:messageId')
  async editMessage(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.editMessage(user, conversationId, messageId, body);
  }

  @Post('conversations/:conversationId/messages/:messageId/reaction')
  async setMessageReaction(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.setMessageReaction(user, conversationId, messageId, body);
  }

  @Post('conversations/:conversationId/messages/:messageId/star')
  async toggleMessageStar(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.toggleMessageStar(user, conversationId, messageId);
  }

  @Patch('conversations/:conversationId/messages/:messageId/delete-for-everyone')
  async deleteMessageForEveryone(
    @Req() req: Request,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
  ) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.deleteMessageForEveryone(user, conversationId, messageId);
  }

  @Post('blocks/:userId')
  async blockUser(@Req() req: Request, @Param('userId') userId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.blockUser(user, userId);
  }

  @Delete('blocks/:userId')
  async unblockUser(@Req() req: Request, @Param('userId') userId: string) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName]);
    return this.chat.unblockUser(user, userId);
  }
}

function requestDeviceIdentifier(req: Request) {
  const value = req.header('x-chat-device-id');
  return typeof value === 'string' && value.length <= 128 ? value : undefined;
}
