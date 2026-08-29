import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auditRequestContext, requestIp } from './auth-http';
import { AuthService } from './auth.service';
import { PasskeyRateLimitException } from './passkey-challenge.service';
import { PasskeyService } from './passkey.service';
import { StepUpService } from './step-up.service';

@Controller('auth/step-up')
export class StepUpController {
  constructor(
    private readonly auth: AuthService,
    private readonly passkeys: PasskeyService,
    private readonly stepUp: StepUpService,
  ) {}

  @Get('status')
  async status(@Req() req: Request) {
    return this.stepUp.status(await this.user(req));
  }

  @Post('password')
  async password(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: Record<string, unknown>) {
    const user = await this.user(req);
    return this.withRateLimitHeader(res, () => this.stepUp.verifyPassword(
      user,
      body.currentPassword,
      requestIp(req),
      auditRequestContext(req),
    ));
  }

  @Post('passkey/options')
  async passkeyOptions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.user(req);
    this.passkeys.assertRequestOrigin(req.get('origin'));
    return this.withRateLimitHeader(res, () => this.passkeys.stepUpOptions(user));
  }

  @Post('passkey/verify')
  async passkeyVerify(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: Record<string, unknown>) {
    const user = await this.user(req);
    this.passkeys.assertRequestOrigin(req.get('origin'));
    return this.withRateLimitHeader(res, async () => {
      await this.passkeys.verifyStepUp(user, body, auditRequestContext(req));
      await this.stepUp.markAuthenticated(user, 'PASSKEY', auditRequestContext(req));
      return this.stepUp.status(user);
    });
  }

  private user(req: Request) {
    return this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
  }

  private async withRateLimitHeader<T>(response: Response, operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PasskeyRateLimitException) response.setHeader('Retry-After', String(error.retryAfterSeconds));
      throw error;
    }
  }
}
