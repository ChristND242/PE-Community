import { Body, Controller, Delete, Get, HttpCode, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { RegistrationRateLimitException } from '../registration/registration-submission.service';
import { AuthService } from './auth.service';
import { auditRequestContext, requestIp, sessionCookieOptions } from './auth-http';
import { EmailChangeRateLimitException } from './email-change-rate-limit.service';
import { EmailChangeService } from './email-change.service';
import { RegisterDto } from './register.dto';
import { StepUpService } from './step-up.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailChanges: EmailChangeService,
    private readonly stepUp: StepUpService,
  ) {}

  @Post('register')
  @HttpCode(202)
  async register(@Body() body: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    try {
      return await this.auth.register(body, req.ip || req.socket.remoteAddress || 'unknown');
    } catch (error) {
      if (error instanceof RegistrationRateLimitException) {
        response.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Get('registration-security')
  registrationSecurity(@Query('communityId') communityId?: string, @Query('invite') inviteToken?: string) {
    return this.auth.registrationSecurity(communityId, inviteToken);
  }

  @Get('invite-status')
  inviteStatus(@Query('invite') invite?: string, @Query('communityId') communityId?: string) {
    return this.auth.inviteStatus(invite, communityId);
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body.email, body.password, auditRequestContext(req));
    if ('twoFactorRequired' in result || 'twoFactorReenrollmentRequired' in result) return result;
    res.cookie(this.auth.cookieName, result.jwtToken, sessionCookieOptions());
    return { user: result.user };
  }

  @Post('login/2fa')
  async loginTwoFactor(@Body() body: { challengeToken?: string; code?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.completeTwoFactorLogin(body.challengeToken, body.code, auditRequestContext(req));
    res.cookie(this.auth.cookieName, result.jwtToken, sessionCookieOptions());
    return { user: result.user };
  }

  @Post('login/2fa/reenroll/setup')
  ownerTwoFactorReenrollmentSetup(@Body() body: { reenrollmentToken?: string }, @Req() req: Request) {
    return this.auth.startOwnerTwoFactorReenrollment(body.reenrollmentToken, auditRequestContext(req));
  }

  @Post('login/2fa/reenroll/verify')
  async ownerTwoFactorReenrollmentVerify(@Body() body: { reenrollmentToken?: string; code?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.completeOwnerTwoFactorReenrollment(body.reenrollmentToken, body.code, auditRequestContext(req));
    res.cookie(this.auth.cookieName, result.jwtToken, sessionCookieOptions());
    return { user: result.user, backupCodes: result.backupCodes, backupCodesRemaining: result.backupCodesRemaining };
  }

  @Get('password-reset/status')
  passwordResetStatus() {
    return this.auth.passwordResetStatus();
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.forgotPassword(body, auditRequestContext(req));
  }

  @Post('reset-password')
  resetPassword(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.auth.resetPassword(body, auditRequestContext(req));
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[this.auth.cookieName]);
    res.clearCookie(this.auth.cookieName, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request) {
    return this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
  }

  @Get('session/status')
  sessionStatus(@Req() req: Request) {
    return this.auth.sessionStatus(req.cookies?.[this.auth.cookieName]);
  }

  @Post('session/activity')
  sessionActivity(@Req() req: Request) {
    return this.auth.touchSessionActivity(req.cookies?.[this.auth.cookieName], auditRequestContext(req));
  }

  @Post('change-required-password')
  async changeRequiredPassword(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    await this.stepUp.requireRecent(user);
    return this.auth.changeRequiredPassword(user.id, body, user.communityId, auditRequestContext(req));
  }

  @Get('email-change/status')
  async emailChangeStatus(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.emailChanges.status(user.id);
  }

  @Post('email-verification/send')
  async sendEmailVerification(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    try {
      return await this.emailChanges.sendPrimaryVerification(user.id, user.communityId, requestIp(req));
    } catch (error) {
      if (error instanceof EmailChangeRateLimitException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Post('email-verification/verify')
  verifyEmail(@Body() body: Record<string, unknown>) {
    return this.emailChanges.verifyPrimary(body.token);
  }

  @Post('email-change/request')
  async requestEmailChange(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    await this.stepUp.requireRecent(user);
    try {
      return await this.emailChanges.request(user.id, user.communityId, body, requestIp(req));
    } catch (error) {
      if (error instanceof EmailChangeRateLimitException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Post('email-change/resend')
  async resendEmailChange(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    try {
      return await this.emailChanges.resend(user.id, user.communityId, requestIp(req));
    } catch (error) {
      if (error instanceof EmailChangeRateLimitException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Delete('email-change')
  async cancelEmailChange(@Req() req: Request) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.emailChanges.cancel(user.id, user.communityId);
  }

  @Post('email-change/verify')
  async verifyEmailChange(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const cookie = req.cookies?.[this.auth.cookieName];
    const [user, sessionTokenHash] = await Promise.all([
      this.auth.userFromCookie(cookie),
      this.auth.sessionTokenHashFromCookie(cookie),
    ]);
    if (!sessionTokenHash) throw new UnauthorizedException('Authentication required.');
    return {
      ...await this.emailChanges.verify(
        user.id,
        user.communityId,
        body.token,
        sessionTokenHash,
        auditRequestContext(req),
      ),
      role: user.role,
    };
  }
}
