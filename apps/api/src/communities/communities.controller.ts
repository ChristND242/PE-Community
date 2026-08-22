import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { requireUser } from '../auth/require-user';
import { CommunitiesService } from './communities.service';
import { UploadedEventTaskAttachmentFile } from '../event-tasks-realtime/event-task-collaboration.service';

@Controller('communities/:communityId')
export class CommunitiesController {
  constructor(
    private readonly communities: CommunitiesService,
    private readonly auth: AuthService,
  ) {}

  @Get('feed')
  async feed(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.feed(communityId, user.id);
  }

  @Post('feed/:announcementId/like')
  async toggleFeedLike(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.toggleFeedLike(communityId, announcementId, user.id);
  }

  @Get('feed/:announcementId/comments')
  async feedComments(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.feedComments(communityId, announcementId, user.id);
  }

  @Post('feed/:announcementId/comments')
  async addFeedComment(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Body() body: { body?: unknown; parentId?: unknown; authorMode?: unknown }, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.addFeedComment(communityId, announcementId, user.id, body.body, body.parentId, body.authorMode);
  }

  @Post('feed/:announcementId/comments/:commentId/like')
  async toggleFeedCommentLike(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Param('commentId') commentId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.toggleFeedCommentLike(communityId, announcementId, commentId, user.id);
  }

  @Get('events')
  async events(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.events(communityId, user.id);
  }

  @Get('schedule')
  async schedule(@Param('communityId') communityId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.schedule(communityId, user.id, query);
  }

  @Get('events/tasks/assigned')
  async assignedEventTasks(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.assignedEventTasks(communityId, user.id);
  }

  @Get('task-boards')
  async taskBoards(@Param('communityId') communityId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.taskBoards(communityId, user.id, query);
  }

  @Get('task-boards/:boardId')
  async taskBoard(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.taskBoard(communityId, boardId, user.id);
  }

  @Get('events/:eventId')
  async event(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.event(communityId, eventId, user.id);
  }

  @Get('events/:eventId/tasks')
  async eventTasks(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.eventTasks(communityId, eventId, user.id);
  }

  @Get('events/:eventId/tasks/:taskId/activity')
  async eventTaskActivity(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.eventTaskActivity(communityId, eventId, taskId);
  }

  @Get('events/:eventId/tasks/:taskId/comments')
  async eventTaskComments(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.eventTaskComments(communityId, eventId, taskId, user.id);
  }

  @Post('events/:eventId/tasks/:taskId/comments')
  async addEventTaskComment(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Body() body: { body?: unknown }, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.addEventTaskComment(communityId, eventId, taskId, user.id, body.body);
  }

  @Delete('events/:eventId/tasks/:taskId/comments/:commentId')
  async archiveEventTaskComment(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('commentId') commentId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.archiveEventTaskComment(communityId, eventId, taskId, commentId, user.id);
  }

  @Get('events/:eventId/tasks/:taskId/attachments')
  async eventTaskAttachments(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.eventTaskAttachments(communityId, eventId, taskId, user.id);
  }

  @Post('events/:eventId/tasks/:taskId/attachments')
  @UseInterceptors(FilesInterceptor('files', 3, { limits: { fileSize: 10 * 1024 * 1024, files: 3 } }))
  async addEventTaskAttachments(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request, @UploadedFiles() files: UploadedEventTaskAttachmentFile[] = []) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.addEventTaskAttachments(communityId, eventId, taskId, user.id, files);
  }

  @Get('events/:eventId/tasks/:taskId/attachments/:attachmentId/download')
  async downloadEventTaskAttachment(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('attachmentId') attachmentId: string, @Req() req: Request, @Res() res: Response) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    const file = await this.communities.eventTaskAttachmentDownload(communityId, eventId, taskId, attachmentId, user.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  }

  @Delete('events/:eventId/tasks/:taskId/attachments/:attachmentId')
  async archiveEventTaskAttachment(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('attachmentId') attachmentId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.archiveEventTaskAttachment(communityId, eventId, taskId, attachmentId, user.id);
  }

  @Get('events/:eventId/tasks/:taskId/checklist')
  async eventTaskChecklist(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.eventTaskChecklist(communityId, eventId, taskId, user.id);
  }

  @Post('events/:eventId/tasks/:taskId/checklist')
  async addEventTaskChecklistItem(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Body() body: { title?: unknown }, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.addEventTaskChecklistItem(communityId, eventId, taskId, user.id, body.title);
  }

  @Patch('events/:eventId/tasks/:taskId/checklist/:itemId/toggle')
  async toggleEventTaskChecklistItem(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('itemId') itemId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.toggleEventTaskChecklistItem(communityId, eventId, taskId, itemId, user.id);
  }

  @Patch('events/:eventId/tasks/:taskId/checklist/:itemId')
  async updateEventTaskChecklistItem(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('itemId') itemId: string, @Body() body: { title?: unknown }, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.updateEventTaskChecklistItem(communityId, eventId, taskId, itemId, user.id, body.title);
  }

  @Delete('events/:eventId/tasks/:taskId/checklist/:itemId')
  async archiveEventTaskChecklistItem(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('itemId') itemId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.archiveEventTaskChecklistItem(communityId, eventId, taskId, itemId, user.id);
  }

  @Patch('events/:eventId/tasks/:taskId/status')
  async updateEventTaskStatus(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Body() body: { status?: unknown }, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.updateEventTaskStatus(communityId, eventId, taskId, user.id, body.status);
  }

  @Get('settings')
  async settings(@Param('communityId') communityId: string, @Req() req: Request) {
    await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.settings(communityId);
  }

  @Get('members')
  async members(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.members(communityId, user.id);
  }

  @Get('members/:memberId')
  async member(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.member(communityId, memberId, user.id);
  }

  @Post('events/:eventId/rsvp')
  async rsvp(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Body() body: { status: 'GOING' | 'MAYBE' | 'DECLINED' }, @Req() req: Request) {
    const user = await requireUser(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    return this.communities.rsvp(communityId, eventId, user.id, body.status ?? 'GOING');
  }
}
