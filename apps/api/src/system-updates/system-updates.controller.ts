import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type RequestUser } from '../auth/auth.service';
import { auditRequestContext } from '../auth/auth-http';
import { requireOwner } from '../auth/require-user';
import { StepUpService } from '../auth/step-up.service';
import { PasskeyChallengeService } from '../auth/passkey-challenge.service';
import { PERMISSIONS, type Permission } from '../rbac/permissions';
import { PermissionsService } from '../rbac/permissions.service';
import { SystemUpdatesService } from './system-updates.service';

@Controller('admin/:communityId/system-updates')
export class SystemUpdatesController {
  constructor(private readonly updates: SystemUpdatesService, private readonly auth: AuthService, private readonly permissions: PermissionsService, private readonly stepUp: StepUpService, private readonly limits: PasskeyChallengeService) {}

  @Get()
  async overview(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.authorize(req, communityId, PERMISSIONS.systemUpdateView);
    return this.updates.overview(communityId, user);
  }

  @Post('check')
  async check(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.authorize(req, communityId, PERMISSIONS.systemUpdateCheck);
    const context = auditRequestContext(req);
    await this.limits.enforceRateLimit('system-update-check', `${user.id}:${context.sourceIp ?? 'unknown'}`, 6, 60 * 60);
    return this.updates.check(communityId, user, context);
  }

  @Post('install')
  async install(@Param('communityId') communityId: string, @Body() body: Record<string, unknown>, @Req() req: Request) {
    const user = await this.authorize(req, communityId, PERMISSIONS.systemUpdateExecute);
    const context = auditRequestContext(req);
    await this.limits.enforceRateLimit('system-update-install', `${user.id}:${context.sourceIp ?? 'unknown'}`, 3, 60 * 60);
    await this.stepUp.requireRecent(user);
    return this.updates.install(communityId, user, body, context);
  }

  @Post('authorize')
  async authorizeInstall(@Param('communityId') communityId: string, @Req() req: Request) {
    const user = await this.authorize(req, communityId, PERMISSIONS.systemUpdateExecute);
    await this.limits.enforceRateLimit('system-update-authorize', user.id, 10, 15 * 60);
    await this.stepUp.requireRecent(user);
    return { authorized: true };
  }

  @Get('history')
  async history(@Param('communityId') communityId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    await this.authorize(req, communityId, PERMISSIONS.systemUpdateHistory);
    return this.updates.history(communityId, Number(query.page ?? 1), Number(query.pageSize ?? 10));
  }

  @Get('runs/:runId')
  async run(@Param('communityId') communityId: string, @Param('runId') runId: string, @Query() query: Record<string, unknown>, @Req() req: Request) {
    await this.authorize(req, communityId, PERMISSIONS.systemUpdateHistory);
    return this.updates.run(communityId, runId, Number(query.after ?? 0));
  }

  @Post('runs/:runId/cancel')
  async cancel(@Param('communityId') communityId: string, @Param('runId') runId: string, @Req() req: Request) {
    const user = await this.authorize(req, communityId, PERMISSIONS.systemUpdateExecute);
    await this.limits.enforceRateLimit('system-update-cancel', user.id, 10, 60 * 60);
    await this.stepUp.requireRecent(user);
    return this.updates.cancel(communityId, runId);
  }

  private async authorize(req: Request, communityId: string, permission: Permission): Promise<RequestUser> {
    const user = await requireOwner(this.auth, req.cookies?.[this.auth.cookieName], communityId);
    await this.permissions.requirePermission(user, permission, communityId);
    return user;
  }
}
