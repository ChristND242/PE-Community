import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AuthService, RequestUser } from '../auth/auth.service';
import { CommunitiesService } from '../communities/communities.service';
import { requireAdmin } from '../auth/require-user';
import { PERMISSIONS, Permission } from '../rbac/permissions';
import { PermissionsService } from '../rbac/permissions.service';
import { UploadedEventTaskAttachmentFile } from '../event-tasks-realtime/event-task-collaboration.service';
import { AdminService } from './admin.service';
import { ProfileLinksService } from '../profile-links/profile-links.service';
import { AuditLogService } from '../audit/audit-log.service';
import { randomUUID } from 'crypto';
import { maxEventImageUploadSize, maxPublicationCoverUploadSize, type EventImageUploadFile, type PublicationCoverUploadFile } from '../uploads';
import { StepUpService } from '../auth/step-up.service';
import { auditRequestContext } from '../auth/auth-http';
import { SecurityActivityService } from '../auth/security-activity.service';

@Controller('admin/:communityId')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly auth: AuthService,
    private readonly permissions: PermissionsService,
    private readonly communities: CommunitiesService,
    private readonly profileLinks: ProfileLinksService,
    private readonly auditLogs: AuditLogService,
    private readonly stepUp: StepUpService,
    private readonly securityActivity: SecurityActivityService,
  ) {}

  private async requireAdminPermission(req: Request, communityId: string, permission: Permission): Promise<RequestUser> {
    const user = await requireAdmin(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    await this.permissions.requirePermission(user, permission, communityId);
    return user;
  }

  @Get('overview')
  async overview(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.auditLogsRead);
    return this.admin.overview(communityId, user.id);
  }

  @Get('streaks')
  async streakAudit(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.auditLogsRead);
    return this.admin.streakAudit(communityId);
  }

  @Get('audit-logs')
  async auditLogList(@Param('communityId') communityId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.auditLogsRead);
    return this.auditLogs.list(communityId, query);
  }

  @Get('audit-logs/:auditLogId')
  async auditLogDetail(@Param('communityId') communityId: string, @Param('auditLogId') auditLogId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.auditLogsRead);
    const detail = await this.auditLogs.detail(communityId, auditLogId);
    const requestId = randomUUID();
    await this.auditLogs.recordBestEffort({
      communityId,
      actorUserId: user.id,
      actorRole: user.role,
      category: 'SECURITY',
      action: 'audit.log.viewed',
      targetType: 'AuditLog',
      targetId: auditLogId,
      requestContext: {
        requestId,
        correlationId: requestId,
        sourceIp: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') ?? undefined,
        route: req.originalUrl.split('?')[0],
        httpMethod: req.method,
        service: 'API',
      },
    });
    return detail;
  }

  @Get('notifications/unread-count')
  async unreadNotificationCount(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.notificationsAdminRead);
    const count = await this.admin.adminUnreadNotificationCount(communityId, user.id);
    return { count };
  }

  @Get('notifications')
  async adminNotifications(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.notificationsAdminRead);
    return this.admin.adminNotifications(communityId, user.id);
  }

  @Patch('notifications/:notificationId/read')
  async markAdminNotificationRead(@Param('communityId') communityId: string, @Param('notificationId') notificationId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.notificationsAdminRead);
    return this.admin.markAdminNotificationRead(communityId, user.id, notificationId);
  }

  @Get('members')
  async members(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.membersRead);
    return this.admin.members(communityId);
  }

  @Get('events')
  async events(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.events(communityId);
  }

  @Get('operations/calendar')
  async operationsCalendar(@Param('communityId') communityId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.operationsCalendar(communityId, query, {
      includeBirthdays: this.permissions.hasPermission(user, PERMISSIONS.membersViewPrivateFields),
      includeMembershipAnniversaries: this.permissions.hasPermission(user, PERMISSIONS.membersRead),
      includeDocumentExpirations: this.permissions.hasPermission(user, PERMISSIONS.passportExpirationReadAdmin),
    });
  }

  @Get('task-boards')
  async taskBoards(@Param('communityId') communityId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoards(communityId, query);
  }

  @Get('task-boards/automation-summary')
  async taskBoardAutomationSummary(@Param('communityId') communityId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationSummary(communityId, query.range);
  }

  @Get('task-boards/automation-issues')
  async taskBoardAutomationIssues(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationIssues(communityId);
  }

  @Get('task-boards/task-templates')
  async taskBoardTaskTemplates(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.eventTaskTemplates(communityId);
  }

  @Post('task-boards/task-templates')
  async createTaskBoardTaskTemplate(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.createEventTaskTemplate(communityId, user.id, body);
  }

  @Patch('task-boards/task-templates/:templateId')
  async updateTaskBoardTaskTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateEventTaskTemplate(communityId, templateId, user.id, body);
  }

  @Delete('task-boards/task-templates/:templateId')
  async archiveTaskBoardTaskTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.archiveEventTaskTemplate(communityId, templateId, user.id);
  }

  @Get('task-board-automation-presets')
  async taskBoardAutomationPresets(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationPresets(communityId);
  }

  @Post('task-board-automation-presets')
  async createTaskBoardAutomationPreset(@Param('communityId') communityId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.createTaskBoardAutomationPreset(communityId, user.id, body);
  }

  @Get('task-board-automation-presets/:presetId')
  async taskBoardAutomationPreset(@Param('communityId') communityId: string, @Param('presetId') presetId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationPreset(communityId, presetId);
  }

  @Patch('task-board-automation-presets/:presetId')
  async updateTaskBoardAutomationPreset(@Param('communityId') communityId: string, @Param('presetId') presetId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateTaskBoardAutomationPreset(communityId, presetId, user.id, body);
  }

  @Delete('task-board-automation-presets/:presetId')
  async archiveTaskBoardAutomationPreset(@Param('communityId') communityId: string, @Param('presetId') presetId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.archiveTaskBoardAutomationPreset(communityId, presetId, user.id);
  }

  @Post('task-boards')
  async createTaskBoard(@Param('communityId') communityId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.createTaskBoard(communityId, user.id, body);
  }

  @Get('task-boards/:boardId')
  async taskBoard(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    const board = await this.admin.taskBoard(communityId, boardId);
    return {
      ...board,
      canManageTasks: Boolean(board.linkedEvent) && user.permissions.includes(PERMISSIONS.eventsUpdate),
      canArchiveTasks: Boolean(board.linkedEvent) && user.permissions.includes(PERMISSIONS.eventsDelete),
      canArchiveBoard: !board.linkedEvent && user.permissions.includes(PERMISSIONS.eventsDelete),
      canEditBoard: user.permissions.includes(PERMISSIONS.eventsUpdate),
    };
  }

  @Patch('task-boards/:boardId')
  async updateTaskBoard(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateTaskBoard(communityId, boardId, user.id, body);
  }

  @Patch('task-boards/:boardId/status')
  async updateTaskBoardStatus(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateTaskBoardStatus(communityId, boardId, user.id, body);
  }

  @Delete('task-boards/:boardId')
  async archiveTaskBoard(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsDelete);
    return this.admin.archiveTaskBoard(communityId, boardId, user.id);
  }

  @Get('task-boards/:boardId/automation-rules')
  async taskBoardAutomationRules(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationRules(communityId, boardId);
  }

  @Get('task-boards/:boardId/automation-rules/archived')
  async archivedTaskBoardAutomationRules(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.archivedTaskBoardAutomationRules(communityId, boardId);
  }

  @Get('task-boards/:boardId/automation-delivery')
  async taskBoardAutomationDelivery(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationDelivery(communityId, boardId);
  }

  @Post('task-boards/:boardId/automation-rules/validate')
  async validateTaskBoardAutomationRule(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.validateTaskBoardAutomationRule(communityId, boardId, body);
  }

  @Post('task-boards/:boardId/automation-rules')
  async createTaskBoardAutomationRule(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.createTaskBoardAutomationRule(communityId, boardId, user.id, body);
  }

  @Post('task-boards/:boardId/automation-presets/save')
  async saveTaskBoardAutomationPreset(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.saveTaskBoardAutomationPreset(communityId, boardId, user.id, body);
  }

  @Post('task-boards/:boardId/automation-presets/:presetId/preview')
  async previewTaskBoardAutomationPreset(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('presetId') presetId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.previewTaskBoardAutomationPreset(communityId, boardId, presetId);
  }

  @Post('task-boards/:boardId/automation-presets/:presetId/apply')
  async applyTaskBoardAutomationPreset(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('presetId') presetId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.applyTaskBoardAutomationPreset(communityId, boardId, presetId, user.id, body);
  }

  @Patch('task-boards/:boardId/automation-rules/:ruleId')
  async updateTaskBoardAutomationRule(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateTaskBoardAutomationRule(communityId, boardId, ruleId, user.id, body);
  }

  @Delete('task-boards/:boardId/automation-rules/:ruleId')
  async archiveTaskBoardAutomationRule(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.archiveTaskBoardAutomationRule(communityId, boardId, ruleId, user.id, {});
  }

  @Post('task-boards/:boardId/automation-rules/:ruleId/archive')
  async archiveTaskBoardAutomationRuleLifecycle(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.archiveTaskBoardAutomationRule(communityId, boardId, ruleId, user.id, body);
  }

  @Post('task-boards/:boardId/automation-rules/:ruleId/restore')
  async restoreTaskBoardAutomationRule(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.restoreTaskBoardAutomationRule(communityId, boardId, ruleId, user.id);
  }

  @Get('task-boards/:boardId/automation-rules/:ruleId/draft')
  async taskBoardAutomationRuleDraft(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationRuleDraft(communityId, boardId, ruleId);
  }

  @Put('task-boards/:boardId/automation-rules/:ruleId/draft')
  async saveTaskBoardAutomationRuleDraft(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.saveTaskBoardAutomationRuleDraft(communityId, boardId, ruleId, user.id, body);
  }

  @Delete('task-boards/:boardId/automation-rules/:ruleId/draft')
  async discardTaskBoardAutomationRuleDraft(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.discardTaskBoardAutomationRuleDraft(communityId, boardId, ruleId, user.id);
  }

  @Post('task-boards/:boardId/automation-rules/:ruleId/draft/publish')
  async publishTaskBoardAutomationRuleDraft(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.publishTaskBoardAutomationRuleDraft(communityId, boardId, ruleId, user.id);
  }

  @Get('task-boards/:boardId/automation-rules/:ruleId/versions')
  async taskBoardAutomationRuleVersions(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationRuleVersions(communityId, boardId, ruleId);
  }

  @Get('task-boards/:boardId/automation-rules/:ruleId/schedule')
  async taskBoardAutomationRuleSchedule(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationRuleSchedule(communityId, boardId, ruleId);
  }

  @Post('task-boards/:boardId/automation-rules/:ruleId/versions/:versionId/rollback')
  async rollbackTaskBoardAutomationRuleVersion(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Param('versionId') versionId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.rollbackTaskBoardAutomationRuleVersion(communityId, boardId, ruleId, versionId, user.id);
  }

  @Get('task-boards/:boardId/automation-rules/:ruleId/runs')
  async taskBoardAutomationRuleRuns(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationRuns(communityId, boardId, query, ruleId);
  }

  @Get('task-boards/:boardId/automation-runs')
  async taskBoardAutomationRuns(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskBoardAutomationRuns(communityId, boardId, query);
  }

  @Post('task-boards/:boardId/automation-runs/:runId/retry')
  async retryTaskBoardAutomationRun(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('runId') runId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.retryTaskBoardAutomationRun(communityId, boardId, runId, user.id);
  }

  @Post('task-boards/:boardId/automation-rules/:ruleId/test')
  async testTaskBoardAutomationRule(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.testTaskBoardAutomationRule(communityId, boardId, ruleId);
  }

  @Post('task-boards/:boardId/automation-rules/:ruleId/test-notification')
  async testTaskBoardAutomationNotification(@Param('communityId') communityId: string, @Param('boardId') boardId: string, @Param('ruleId') ruleId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.testTaskBoardAutomationNotification(communityId, boardId, ruleId, user.id);
  }

  @Get('announcements')
  async announcements(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsRead);
    return this.admin.announcements(communityId);
  }

  @Post('announcements')
  @UseInterceptors(FileInterceptor('coverImage', { limits: { fileSize: maxPublicationCoverUploadSize } }))
  async createAnnouncement(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>, @UploadedFile() coverImage?: PublicationCoverUploadFile) {
    const user = await this.requireAdminPermission(req, communityId, body.publish ? PERMISSIONS.announcementsPublish : PERMISSIONS.announcementsCreate);
    return this.admin.createAnnouncement(communityId, user.id, body, coverImage);
  }

  @Get('announcements/:announcementId')
  async announcement(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsRead);
    return this.admin.announcement(communityId, announcementId);
  }

  @Patch('announcements/:announcementId')
  @UseInterceptors(FileInterceptor('coverImage', { limits: { fileSize: maxPublicationCoverUploadSize } }))
  async updateAnnouncement(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request, @Body() body: Record<string, unknown>, @UploadedFile() coverImage?: PublicationCoverUploadFile) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsCreate);
    return this.admin.updateAnnouncement(communityId, announcementId, user.id, body, coverImage);
  }

  @Post('announcements/:announcementId/publish')
  async publishAnnouncement(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsPublish);
    return this.admin.publishAnnouncement(communityId, announcementId, user.id, body);
  }

  @Post('announcements/:announcementId/unpublish')
  async unpublishAnnouncement(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsArchive);
    return this.admin.unpublishAnnouncement(communityId, announcementId, user.id);
  }

  @Post('announcements/:announcementId/archive')
  async archiveAnnouncement(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsArchive);
    return this.admin.archiveAnnouncement(communityId, announcementId, user.id);
  }

  @Delete('announcements/:announcementId')
  async deleteAnnouncement(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsDelete);
    return this.admin.deleteAnnouncement(communityId, announcementId, user.id);
  }

  @Get('announcements/:announcementId/notification-report')
  async announcementNotificationReport(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.notificationsAdminRead);
    return this.admin.announcementNotificationReport(communityId, announcementId);
  }

  @Get('announcements/:announcementId/comments')
  async announcementComments(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsRead);
    return this.communities.adminFeedComments(communityId, announcementId, user.id);
  }

  @Post('announcements/:announcementId/comments')
  async addAnnouncementComment(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Body() body: { body?: unknown; parentId?: unknown; authorMode?: unknown }, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsRead);
    return this.communities.addAdminFeedComment(communityId, announcementId, user.id, body.body, body.parentId, body.authorMode);
  }

  @Post('announcements/:announcementId/comments/:commentId/like')
  async toggleAnnouncementCommentLike(@Param('communityId') communityId: string, @Param('announcementId') announcementId: string, @Param('commentId') commentId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.announcementsRead);
    return this.communities.toggleAdminFeedCommentLike(communityId, announcementId, commentId, user.id);
  }

  @Get('reminder-settings')
  async reminderSettings(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsRemindersManage);
    return this.admin.reminderSettings(communityId);
  }

  @Patch('reminder-settings')
  async updateReminderSettings(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsRemindersManage);
    return this.admin.updateReminderSettings(communityId, body);
  }

  @Get('settings')
  async communitySettings(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsSecurityManage);
    const settings = await this.admin.communitySettings(communityId);
    return { twoFactorEnabled: settings.twoFactorEnabled };
  }

  @Patch('settings')
  async updateCommunitySettings(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsSecurityManage);
    return this.admin.updateCommunitySettings(communityId, user.id, body);
  }

  @Get('settings/general')
  async generalSettings(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsGeneralManage);
    return this.admin.generalSettings(communityId);
  }

  @Patch('settings/general')
  async updateGeneralSettings(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsGeneralManage);
    return this.admin.updateGeneralSettings(communityId, user.id, body);
  }

  @Get('settings/export/users')
  async exportUsersAudit(@Param('communityId') communityId: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsGeneralManage);
    const exportFile = await this.admin.exportUsersAudit(communityId, user.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
    return exportFile.csv;
  }

  @Get('settings/notifications')
  async notificationSettings(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsNotificationsManage);
    return this.admin.notificationSettings(communityId);
  }

  @Patch('settings/notifications')
  async updateNotificationSettings(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsNotificationsManage);
    return this.admin.updateNotificationSettings(communityId, user.id, body);
  }

  @Get('settings/templates')
  async messageTemplates(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.messageTemplates(communityId);
  }

  @Patch('settings/templates/:key')
  async updateMessageTemplate(@Param('communityId') communityId: string, @Param('key') key: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.updateMessageTemplate(communityId, key, user.id, body);
  }

  @Post('settings/templates/:key/preview')
  async previewMessageTemplate(@Param('communityId') communityId: string, @Param('key') key: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.previewMessageTemplate(communityId, key, body);
  }

  @Post('settings/templates/:key/test')
  async testMessageTemplate(@Param('communityId') communityId: string, @Param('key') key: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.testMessageTemplate(communityId, key, user.id, body);
  }

  @Get('settings/notification-templates')
  async notificationTemplates(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.notificationTemplates(communityId);
  }

  @Get('settings/notification-templates/:templateId')
  async notificationTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.notificationTemplate(communityId, templateId);
  }

  @Patch('settings/notification-templates/:templateId')
  async updateNotificationTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.updateNotificationTemplate(communityId, templateId, user.id, body);
  }

  @Post('settings/notification-templates/:templateId/preview')
  async previewNotificationTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.previewNotificationTemplate(communityId, templateId, body);
  }

  @Post('settings/notification-templates/:templateId/test')
  async testNotificationTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsTemplatesManage);
    return this.admin.testNotificationTemplate(communityId, templateId, user.id, body);
  }

  @Get('settings/invite-link')
  async inviteLink(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsGeneralManage);
    return this.admin.inviteLink(communityId);
  }

  @Post('settings/invite-link')
  async generateInviteLink(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsGeneralManage);
    return this.admin.generateInviteLink(communityId, user.id);
  }

  @Post('settings/invite-link/revoke')
  async revokeInviteLink(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsGeneralManage);
    return this.admin.revokeInviteLink(communityId, user.id);
  }

  @Post('settings/invite-link/send')
  async sendInviteLink(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsGeneralManage);
    return this.admin.sendInviteLink(communityId, user.id, body);
  }

  @Get('settings/email')
  async emailSettings(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsSmtpManage);
    return this.admin.emailSettings(communityId);
  }

  @Patch('settings/email')
  async updateEmailSettings(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsSmtpManage);
    return this.admin.updateEmailSettings(communityId, user.id, body);
  }

  @Post('settings/email/test')
  async testEmailSettings(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsSmtpManage);
    return this.admin.testEmailSettings(communityId, user.id, body);
  }

  @Get('settings/registration-protection')
  async registrationProtectionSettings(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsSecurityManage);
    return this.admin.registrationProtectionSettings(communityId);
  }

  @Patch('settings/registration-protection')
  async updateRegistrationProtectionSettings(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsSecurityManage);
    return this.admin.updateRegistrationProtectionSettings(communityId, user.id, body);
  }

  @Post('settings/registration-protection/test')
  async testRegistrationProtectionSettings(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsSecurityManage);
    return this.admin.testRegistrationProtectionSettings(communityId);
  }

  @Get('emails')
  async emailActivity(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.emailRead);
    return this.admin.recentEmailActivity(communityId);
  }

  @Get('emails/overview')
  async emailOverview(@Param('communityId') communityId: string, @Req() req: Request, @Query() query: Record<string, unknown>) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.emailRead);
    return this.admin.emailOverview(communityId, query);
  }

  @Get('emails/campaigns')
  async emailCampaigns(@Param('communityId') communityId: string, @Req() req: Request, @Query() query: Record<string, unknown>) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.emailRead);
    return this.admin.emailCampaigns(communityId, query);
  }

  @Get('emails/campaigns/:campaignId')
  async emailCampaign(@Param('communityId') communityId: string, @Param('campaignId') campaignId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.emailRead);
    return this.admin.emailCampaign(communityId, campaignId);
  }

  @Post('emails/campaigns/:campaignId/retry-failed')
  async retryFailedEmailRecipients(@Param('communityId') communityId: string, @Param('campaignId') campaignId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.emailRetry);
    return this.admin.retryFailedEmailRecipients(communityId, campaignId, user.id);
  }

  @Post('emails/campaigns/:campaignId/cancel')
  async cancelEmailCampaign(@Param('communityId') communityId: string, @Param('campaignId') campaignId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.emailCancel);
    return this.admin.cancelEmailCampaign(communityId, campaignId, user.id);
  }

  @Post('emails/campaigns/:campaignId/resend-test')
  async resendTestEmailCampaign(@Param('communityId') communityId: string, @Param('campaignId') campaignId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.emailSend);
    return this.admin.resendTestEmailCampaign(communityId, campaignId, user.id, body);
  }

  @Get('emails/campaigns/:campaignId/recipients.csv')
  async exportEmailCampaignRecipients(@Param('communityId') communityId: string, @Param('campaignId') campaignId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.emailExport);
    return this.admin.exportEmailCampaignRecipients(communityId, campaignId);
  }

  @Post('reminders/run-due')
  async runDueReminders(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.settingsRemindersManage);
    return this.admin.runDueReminders(communityId, user.id);
  }

  @Post('events')
  @UseInterceptors(FileInterceptor('eventImage', { limits: { fileSize: maxEventImageUploadSize } }))
  async createEvent(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>, @UploadedFile() eventImage?: EventImageUploadFile) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsCreate);
    return this.admin.createEvent(communityId, user.id, body, eventImage);
  }

  @Get('event-task-templates')
  async eventTaskTemplates(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.eventTaskTemplates(communityId);
  }

  @Get('event-task-templates/:templateId')
  async eventTaskTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.eventTaskTemplate(communityId, templateId);
  }

  @Post('event-task-templates')
  async createEventTaskTemplate(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.createEventTaskTemplate(communityId, user.id, body);
  }

  @Patch('event-task-templates/:templateId')
  async updateEventTaskTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateEventTaskTemplate(communityId, templateId, user.id, body);
  }

  @Delete('event-task-templates/:templateId')
  async archiveEventTaskTemplate(@Param('communityId') communityId: string, @Param('templateId') templateId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.archiveEventTaskTemplate(communityId, templateId, user.id);
  }

  @Post('events/:eventId/task-templates/:templateId/apply')
  async applyEventTaskTemplate(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('templateId') templateId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.applyEventTaskTemplate(communityId, eventId, templateId, user.id, body);
  }

  @Get('events/:eventId')
  async event(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.event(communityId, eventId);
  }

  @Patch('events/:eventId')
  @UseInterceptors(FileInterceptor('eventImage', { limits: { fileSize: maxEventImageUploadSize } }))
  async updateEvent(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request, @Body() body: Record<string, unknown>, @UploadedFile() eventImage?: EventImageUploadFile) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateEvent(communityId, eventId, user.id, body, eventImage);
  }

  @Delete('events/:eventId')
  async deleteEvent(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsDelete);
    return this.admin.deleteEvent(communityId, eventId, user.id);
  }

  @Get('events/:eventId/rsvps')
  async eventRsvps(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.eventRsvps(communityId, eventId);
  }

  @Post('events/:eventId/email-attendees')
  async emailEventAttendees(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsEmailAttendees);
    return this.admin.emailEventAttendees(communityId, eventId, user.id, body);
  }

  @Get('events/:eventId/tasks')
  async eventTasks(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.eventTasks(communityId, eventId);
  }

  @Get('events/:eventId/planning-overview')
  async eventPlanningOverview(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.eventPlanningOverview(communityId, eventId);
  }

  @Get('events/:eventId/tasks/:taskId/activity')
  async eventTaskActivity(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskActivity(communityId, eventId, taskId);
  }

  @Get('events/:eventId/tasks/:taskId/comments')
  async eventTaskComments(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskComments(communityId, eventId, taskId, user.id, user.permissions.includes(PERMISSIONS.eventsUpdate));
  }

  @Post('events/:eventId/tasks/:taskId/comments')
  async addEventTaskComment(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Body() body: { body?: unknown }, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.addTaskComment(communityId, eventId, taskId, user.id, body.body);
  }

  @Delete('events/:eventId/tasks/:taskId/comments/:commentId')
  async archiveEventTaskComment(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('commentId') commentId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.archiveTaskComment(communityId, eventId, taskId, commentId, user.id);
  }

  @Get('events/:eventId/tasks/:taskId/attachments')
  async eventTaskAttachments(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskAttachments(communityId, eventId, taskId, user.id, user.permissions.includes(PERMISSIONS.eventsUpdate));
  }

  @Post('events/:eventId/tasks/:taskId/attachments')
  @UseInterceptors(FilesInterceptor('files', 3, { limits: { fileSize: 10 * 1024 * 1024, files: 3 } }))
  async addEventTaskAttachments(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request, @UploadedFiles() files: UploadedEventTaskAttachmentFile[] = []) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.addTaskAttachments(communityId, eventId, taskId, user.id, files);
  }

  @Get('events/:eventId/tasks/:taskId/attachments/:attachmentId/download')
  async downloadEventTaskAttachment(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('attachmentId') attachmentId: string, @Req() req: Request, @Res() res: Response) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    const file = await this.admin.taskAttachmentDownload(communityId, eventId, taskId, attachmentId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  }

  @Delete('events/:eventId/tasks/:taskId/attachments/:attachmentId')
  async archiveEventTaskAttachment(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('attachmentId') attachmentId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.archiveTaskAttachment(communityId, eventId, taskId, attachmentId, user.id);
  }

  @Get('events/:eventId/tasks/:taskId/checklist')
  async eventTaskChecklist(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsRead);
    return this.admin.taskChecklist(communityId, eventId, taskId, user.id, user.permissions.includes(PERMISSIONS.eventsUpdate));
  }

  @Post('events/:eventId/tasks/:taskId/checklist')
  async addEventTaskChecklistItem(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Body() body: { title?: unknown }, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.addTaskChecklistItem(communityId, eventId, taskId, user.id, body.title);
  }

  @Patch('events/:eventId/tasks/:taskId/checklist/reorder')
  async reorderEventTaskChecklist(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Body() body: { itemIds?: unknown }, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.reorderTaskChecklist(communityId, eventId, taskId, user.id, body.itemIds);
  }

  @Patch('events/:eventId/tasks/:taskId/checklist/:itemId/toggle')
  async toggleEventTaskChecklistItem(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('itemId') itemId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.toggleTaskChecklistItem(communityId, eventId, taskId, itemId, user.id);
  }

  @Patch('events/:eventId/tasks/:taskId/checklist/:itemId')
  async updateEventTaskChecklistItem(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('itemId') itemId: string, @Body() body: { title?: unknown }, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateTaskChecklistItem(communityId, eventId, taskId, itemId, user.id, body.title);
  }

  @Delete('events/:eventId/tasks/:taskId/checklist/:itemId')
  async archiveEventTaskChecklistItem(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Param('itemId') itemId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.archiveTaskChecklistItem(communityId, eventId, taskId, itemId, user.id);
  }

  @Post('events/:eventId/tasks')
  async createEventTask(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.createEventTask(communityId, eventId, user.id, body);
  }

  @Patch('events/:eventId/tasks/reorder')
  async reorderEventTasks(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.reorderEventTasks(communityId, eventId, user.id, body);
  }

  @Patch('events/:eventId/tasks/:taskId/status')
  async updateEventTaskStatus(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateEventTaskStatus(communityId, eventId, taskId, user.id, body);
  }

  @Patch('events/:eventId/tasks/:taskId')
  async updateEventTask(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsUpdate);
    return this.admin.updateEventTask(communityId, eventId, taskId, user.id, body);
  }

  @Delete('events/:eventId/tasks/:taskId')
  async archiveEventTask(@Param('communityId') communityId: string, @Param('eventId') eventId: string, @Param('taskId') taskId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.eventsDelete);
    return this.admin.archiveEventTask(communityId, eventId, taskId, user.id);
  }

  @Get('members/:memberId')
  async member(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.membersRead);
    return this.admin.member(communityId, memberId);
  }

  @Patch('members/:memberId')
  async updateMember(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const permission = body.passportExpiresAt !== undefined ? PERMISSIONS.passportExpirationUpdateAdmin : PERMISSIONS.membersUpdate;
    const user = await this.requireAdminPermission(req, communityId, permission);
    return this.admin.updateMember(communityId, memberId, user.id, body);
  }

  @Get('members/:memberId/profile-links')
  async memberProfileLinks(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.membersRead);
    return this.profileLinks.listForAdmin(communityId, memberId);
  }

  @Post('members/:memberId/profile-links')
  async createMemberProfileLink(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.membersUpdate);
    return this.profileLinks.createForAdmin(communityId, memberId, user.id, body);
  }

  @Patch('members/:memberId/profile-links/:linkId')
  async updateMemberProfileLink(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Param('linkId') linkId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.membersUpdate);
    return this.profileLinks.updateForAdmin(communityId, memberId, linkId, user.id, body);
  }

  @Delete('members/:memberId/profile-links/:linkId')
  async deleteMemberProfileLink(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Param('linkId') linkId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.membersUpdate);
    return this.profileLinks.deleteForAdmin(communityId, memberId, linkId, user.id);
  }

  @Put('members/:memberId/profile-links/order')
  async reorderMemberProfileLinks(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request, @Body() body: { orderedIds?: unknown }) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.membersUpdate);
    return this.profileLinks.reorderForAdmin(communityId, memberId, user.id, body.orderedIds);
  }

  @Patch('members/:memberId/reset-password')
  async resetMemberPassword(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.membersUpdate);
    await this.stepUp.requireRecent(user);
    const target = await this.admin.member(communityId, memberId);
    const result = await this.admin.resetMemberPassword(communityId, memberId, user.id, body);
    await this.securityActivity.recordBestEffort({
      communityId,
      userId: target.user.id,
      eventType: 'ACCOUNT_PASSWORD_RESET',
      context: auditRequestContext(req),
      notify: true,
    });
    return result;
  }

  @Post('members/:memberId/2fa/reset')
  async resetMemberTwoFactor(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.membersUpdate);
    await this.stepUp.requireRecent(user);
    const result = await this.admin.resetMemberTwoFactor(communityId, memberId, user.id, body);
    await this.securityActivity.recordBestEffort({
      communityId,
      userId: result.user.id,
      eventType: 'ACCOUNT_TOTP_RESET',
      context: auditRequestContext(req),
      notify: true,
    });
    return result;
  }

  @Patch('members/:memberId/suspend')
  async suspendMember(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request, @Body() body: { status?: unknown }) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.membersSuspend);
    await this.stepUp.requireRecent(user);
    const result = await this.admin.suspendMember(communityId, memberId, user.id, body.status);
    await this.securityActivity.recordBestEffort({
      communityId,
      userId: result.user.id,
      eventType: 'ACCOUNT_STATUS_CHANGED',
      context: auditRequestContext(req),
      metadata: { status: result.status },
      notify: true,
    });
    return result;
  }

  @Patch('members/:memberId/remove')
  async removeMember(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.membersDelete);
    await this.stepUp.requireRecent(user);
    const target = await this.admin.member(communityId, memberId);
    const result = await this.admin.removeMember(communityId, memberId, user.id);
    await this.securityActivity.recordBestEffort({
      communityId,
      userId: target.user.id,
      eventType: 'ACCOUNT_STATUS_CHANGED',
      context: auditRequestContext(req),
      metadata: { status: 'REMOVED' },
      notify: true,
    });
    return result;
  }

  @Patch('members/:memberId/role')
  async changeRole(@Param('communityId') communityId: string, @Param('memberId') memberId: string, @Req() req: Request, @Body() body: { roleKey?: string }) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.rolesManage);
    await this.stepUp.requireRecent(user);
    const result = await this.admin.changeRole(communityId, memberId, user.id, body.roleKey);
    await this.securityActivity.recordBestEffort({
      communityId,
      userId: result.user.id,
      eventType: 'ACCOUNT_ROLE_CHANGED',
      context: auditRequestContext(req),
      metadata: { role: result.role.key },
      notify: true,
    });
    return result;
  }

  @Get('registrations')
  async registrations(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.registrationsRead);
    return this.admin.registrations(communityId);
  }

  @Post('registrations/:applicationId/approve')
  async approve(@Param('communityId') communityId: string, @Param('applicationId') applicationId: string, @Req() req: Request) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.registrationsApprove);
    return this.admin.review(communityId, applicationId, user.id, 'APPROVED');
  }

  @Post('registrations/:applicationId/reject')
  async reject(@Param('communityId') communityId: string, @Param('applicationId') applicationId: string, @Req() req: Request, @Body() body: { reason?: string }) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.registrationsReject);
    return this.admin.review(communityId, applicationId, user.id, 'REJECTED', body.reason);
  }

  @Get('roles')
  async roles(@Param('communityId') communityId: string, @Req() req: Request) {
    await this.requireAdminPermission(req, communityId, PERMISSIONS.rolesRead);
    return this.admin.roles(communityId);
  }

  @Patch('roles/permissions')
  async updateRolePermissions(@Param('communityId') communityId: string, @Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.requireAdminPermission(req, communityId, PERMISSIONS.rolesManage);
    await this.stepUp.requireRecent(user);
    return this.admin.updateRolePermissions(communityId, user.id, user.role, body);
  }
}
