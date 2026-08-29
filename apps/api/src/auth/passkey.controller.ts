import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { auditRequestContext, requestIp, sessionCookieOptions } from './auth-http';
import { AuthService } from './auth.service';
import { PasskeyRateLimitException } from './passkey-challenge.service';
import { PasskeyService } from './passkey.service';
import { StepUpService } from './step-up.service';

@Controller('auth/passkeys')
export class PasskeyController {
  constructor(
    private readonly auth: AuthService,
    private readonly passkeys: PasskeyService,
    private readonly stepUp: StepUpService,
  ) {}

  @Post('authentication/options')
  async authenticationOptions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.passkeys.assertRequestOrigin(req.get('origin'));
    return this.withRateLimitHeader(res, () => this.passkeys.authenticationOptions(requestIp(req)));
  }

  @Post('authentication/verify')
  async authenticationVerify(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: Record<string, unknown>) {
    this.passkeys.assertRequestOrigin(req.get('origin'));
    const result = await this.withRateLimitHeader(res, () => this.passkeys.verifyAuthentication(
      requestIp(req),
      body,
      auditRequestContext(req),
    ));
    res.cookie(this.auth.cookieName, result.jwtToken, sessionCookieOptions());
    return { user: result.user };
  }

  @Get()
  async list(@Req() req: Request) {
    const user = await this.currentUser(req);
    return this.passkeys.list(user.id);
  }

  @Post('registration/options')
  async registrationOptions(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.currentUser(req);
    this.passkeys.assertRequestOrigin(req.get('origin'));
    await this.stepUp.requireRecent(user);
    return this.withRateLimitHeader(res, () => this.passkeys.registrationOptions(user));
  }

  @Post('registration/verify')
  async registrationVerify(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: Record<string, unknown>) {
    const user = await this.currentUser(req);
    this.passkeys.assertRequestOrigin(req.get('origin'));
    await this.stepUp.requireRecent(user);
    return this.withRateLimitHeader(res, () => this.passkeys.verifyRegistration(user, body, auditRequestContext(req)));
  }

  @Patch(':id')
  async rename(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const user = await this.currentUser(req);
    this.passkeys.assertRequestOrigin(req.get('origin'));
    return this.withRateLimitHeader(res, () => this.passkeys.rename(user, id, body));
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Param('id') id: string) {
    const user = await this.currentUser(req);
    this.passkeys.assertRequestOrigin(req.get('origin'));
    await this.stepUp.requireRecent(user);
    return this.withRateLimitHeader(res, () => this.passkeys.remove(user, id, auditRequestContext(req)));
  }

  private currentUser(req: Request) {
    return this.auth.userFromCookie(req.cookies?.[this.auth.cookieName]);
  }

  private async withRateLimitHeader<T>(res: Response, operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PasskeyRateLimitException) res.setHeader('Retry-After', String(error.retryAfterSeconds));
      throw error;
    }
  }
}
