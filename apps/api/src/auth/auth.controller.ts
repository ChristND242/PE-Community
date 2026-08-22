import { Body, Controller, Delete, Get, HttpCode, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { RegistrationRateLimitException } from '../registration/registration-submission.service';
import { AuthService, SESSION_ABSOLUTE_TIMEOUT_MS } from './auth.service';
import { EmailChangeRateLimitException } from './email-change-rate-limit.service';
import { EmailChangeService } from './email-change.service';
import { RegisterDto } from './register.dto';
import { randomUUID } from 'crypto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailChanges: EmailChangeService,
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
  ownerTwoFactorReenrollmentSetup(@Body() body: { reenrollmentToken?: string }) {
    return this.auth.startOwnerTwoFactorReenrollment(body.reenrollmentToken);
  }

  @Post('login/2fa/reenroll/verify')
  async ownerTwoFactorReenrollmentVerify(@Body() body: { reenrollmentToken?: string; code?: string }, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.completeOwnerTwoFactorReenrollment(body.reenrollmentToken, body.code);
    res.cookie(this.auth.cookieName, result.jwtToken, sessionCookieOptions());
    return { user: result.user, backupCodes: result.backupCodes, backupCodesRemaining: result.backupCodesRemaining };
  }

  @Get('password-reset/status')
  passwordResetStatus() {
    return this.auth.passwordResetStatus();
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: Record<string, unknown>) {
    return this.auth.forgotPassword(body);
  }

  @Post('reset-password')
  resetPassword(@Body() body: Record<string, unknown>) {
    return this.auth.resetPassword(body);
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
    return this.auth.touchSessionActivity(req.cookies?.[this.auth.cookieName]);
  }

  @Post('change-required-password')
  async changeRequiredPassword(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const user = await this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
    return this.auth.changeRequiredPassword(user.id, body);
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
    return { ...await this.emailChanges.verify(user.id, user.communityId, body.token, sessionTokenHash), role: user.role };
  }
}

function requestIp(req: Request) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function auditRequestContext(req: Request) {
  const requestId = randomUUID();
  return {
    requestId,
    correlationId: requestId,
    sourceIp: requestIp(req),
    userAgent: req.get('user-agent') ?? undefined,
    route: req.originalUrl.split('?')[0],
    httpMethod: req.method,
    service: 'API',
  };
}

function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookies(),
    maxAge: SESSION_ABSOLUTE_TIMEOUT_MS,
    path: '/',
  };
}

function shouldUseSecureCookies() {
  if (process.env.SESSION_COOKIE_SECURE) return process.env.SESSION_COOKIE_SECURE === 'true';
  if (process.env.WEB_ORIGIN) return process.env.WEB_ORIGIN.startsWith('https://');
  return process.env.NODE_ENV === 'production';
}
