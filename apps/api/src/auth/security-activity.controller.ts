import { Controller, Delete, Get, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auditRequestContext } from './auth-http';
import { AuthService } from './auth.service';
import { SecurityActivityService } from './security-activity.service';
import { StepUpService } from './step-up.service';

@Controller('auth')
export class SecurityActivityController {
  constructor(
    private readonly auth: AuthService,
    private readonly securityActivity: SecurityActivityService,
    private readonly stepUp: StepUpService,
  ) {}

  @Get('sessions')
  async sessions(@Req() req: Request) {
    return this.securityActivity.sessions(await this.currentUser(req));
  }

  @Delete('sessions/others')
  async revokeOtherSessions(@Req() req: Request) {
    const user = await this.currentUser(req);
    await this.stepUp.requireRecent(user);
    return this.securityActivity.revokeOtherSessions(user, auditRequestContext(req));
  }

  @Delete('sessions/:sessionId')
  async revokeSession(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const user = await this.currentUser(req);
    await this.stepUp.requireRecent(user);
    return this.securityActivity.revokeSession(user, sessionId, auditRequestContext(req));
  }

  @Get('security-activity')
  async activity(@Req() req: Request, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.securityActivity.activity(await this.currentUser(req), page, pageSize);
  }

  @Get('security-activity/export')
  async exportActivity(
    @Req() req: Request,
    @Res() res: Response,
    @Query('range') range?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('format') format?: string,
  ) {
    const user = await this.currentUser(req);
    await this.stepUp.requireRecent(user);
    const exported = await this.securityActivity.exportActivity(user, { range, from, to, format }, auditRequestContext(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).send(exported.content);
  }

  private currentUser(req: Request) {
    return this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
  }
}
