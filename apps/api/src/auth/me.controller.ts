import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { maxAvatarUploadSize, type AvatarUploadFile } from '../uploads';
import { AuthService } from './auth.service';
import { ProfileLinksService } from '../profile-links/profile-links.service';
import { StepUpService } from './step-up.service';
import { auditRequestContext } from './auth-http';

@Controller()
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly profileLinks: ProfileLinksService,
    private readonly stepUp: StepUpService,
  ) {}

  @Get('me')
  async me(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.memberProfile(user.id, user.communityId);
  }

  @Patch('me/profile')
  async updateProfile(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.updateMemberProfile(user.id, user.communityId, body);
  }

  @Post('me/profile/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxAvatarUploadSize } }))
  async uploadAvatar(@Req() req: Request, @UploadedFile() file?: AvatarUploadFile) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.uploadMemberAvatar(user.id, user.communityId, file);
  }

  @Get('me/profile/links')
  async links(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.profileLinks.listOwn(user.id, user.communityId);
  }

  @Post('me/profile/links')
  async createLink(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.profileLinks.createOwn(user.id, user.communityId, body);
  }

  @Patch('me/profile/links/:linkId')
  async updateLink(@Req() req: Request, @Param('linkId') linkId: string, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.profileLinks.updateOwn(user.id, user.communityId, linkId, body);
  }

  @Delete('me/profile/links/:linkId')
  async deleteLink(@Req() req: Request, @Param('linkId') linkId: string) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.profileLinks.deleteOwn(user.id, user.communityId, linkId);
  }

  @Put('me/profile/links/order')
  async reorderLinks(@Req() req: Request, @Body() body: { orderedIds?: unknown }) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.profileLinks.reorderOwn(user.id, user.communityId, body.orderedIds);
  }

  @Get('me/notifications')
  async notifications(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.notifications(user.id, user.communityId);
  }

  @Get('me/sidebar-counts')
  async sidebarCounts(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.sidebarCounts(user.id, user.communityId);
  }

  @Patch('me/notifications/:id/read')
  async markNotificationRead(@Req() req: Request, @Param('id') id: string) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.markNotificationRead(user.id, user.communityId, id);
  }

  @Get('me/notification-preferences')
  async notificationPreferences(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.notificationPreferences(user.id, user.communityId);
  }

  @Patch('me/notification-preferences')
  async updateNotificationPreferences(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.updateNotificationPreferences(user.id, user.communityId, body);
  }

  @Get('me/2fa/status')
  async twoFactorStatus(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.twoFactorStatus(user.id, user.communityId);
  }

  @Post('me/2fa/setup')
  async setupTwoFactor(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    await this.stepUp.requireRecent(user);
    return this.auth.setupTwoFactor(user.id, user.communityId);
  }

  @Post('me/2fa/verify')
  async verifyTwoFactor(@Req() req: Request, @Body() body: { code?: string }) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    await this.stepUp.requireRecent(user);
    return this.auth.verifyTwoFactorSetup(user.id, body.code, user.communityId, auditRequestContext(req));
  }

  @Post('me/2fa/disable')
  async disableTwoFactor(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    await this.stepUp.requireRecent(user);
    return this.auth.disableTwoFactor(user.id, body, user.communityId, auditRequestContext(req));
  }

  @Post('me/2fa/backup-codes/regenerate')
  async regenerateBackupCodes(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    await this.stepUp.requireRecent(user);
    return this.auth.regenerateBackupCodes(user.id, user.communityId, body, auditRequestContext(req));
  }
}
