import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { decryptSecret } from '../security/encrypted-secret';
import { CaptchaProvider, RegistrationCaptchaSettings } from './registration.types';

const endpoints: Record<Exclude<CaptchaProvider, 'DISABLED'>, string> = {
  CLOUDFLARE_TURNSTILE: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  GOOGLE_RECAPTCHA: 'https://www.google.com/recaptcha/api/siteverify',
  HCAPTCHA: 'https://api.hcaptcha.com/siteverify',
};

type SiteverifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  score?: number;
  'error-codes'?: unknown;
};

export type CaptchaVerificationResult = {
  success: boolean;
  provider: CaptchaProvider;
  errorCode?: string;
  hostname?: string;
  action?: string;
  score?: number;
};

@Injectable()
export class CaptchaVerificationService {
  private readonly logger = new Logger(CaptchaVerificationService.name);

  async verify(
    settings: RegistrationCaptchaSettings,
    token: string | undefined,
    remoteIp?: string,
  ): Promise<CaptchaVerificationResult> {
    if (!settings.enabled || settings.mode === 'DISABLED') return { success: true, provider: 'DISABLED' };
    if (settings.provider === 'DISABLED' || !settings.secretEncrypted || !settings.siteKey || !token?.trim()) {
      throw captchaFailure();
    }

    const body = new URLSearchParams({
      secret: decryptSecret(settings.secretEncrypted),
      response: token.trim(),
    });
    if (remoteIp) body.set('remoteip', remoteIp);
    if (settings.provider === 'HCAPTCHA') body.set('sitekey', settings.siteKey);

    let response: Response;
    try {
      response = await fetch(endpoints[settings.provider], {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(7_000),
      });
    } catch (error) {
      this.logger.warn(`CAPTCHA provider request failed provider=${settings.provider} error=${safeErrorName(error)}`);
      throw captchaFailure();
    }

    let providerResult: SiteverifyResponse;
    try {
      providerResult = await response.json() as SiteverifyResponse;
    } catch {
      this.logger.warn(`CAPTCHA provider returned malformed JSON provider=${settings.provider}`);
      throw captchaFailure();
    }

    const errorCode = firstErrorCode(providerResult['error-codes']);
    const valid = response.ok
      && providerResult.success === true
      && matchesOptional(settings.hostname, providerResult.hostname)
      && matchesOptional(settings.action, providerResult.action)
      && (
        settings.provider !== 'GOOGLE_RECAPTCHA'
        || settings.variant !== 'V3_SCORE'
        || (typeof providerResult.score === 'number' && providerResult.score >= settings.minimumScore)
      );

    const result: CaptchaVerificationResult = {
      success: valid,
      provider: settings.provider,
      errorCode: valid ? undefined : errorCode ?? 'verification_failed',
      hostname: providerResult.hostname,
      action: providerResult.action,
      score: providerResult.score,
    };
    if (!valid) throw captchaFailure();
    return result;
  }
}

export function captchaFailure() {
  return new BadRequestException({
    code: 'CAPTCHA_VERIFICATION_FAILED',
    message: 'We could not verify the security check. Please try again.',
  });
}

function matchesOptional(expected: string | null, actual: string | undefined) {
  return !expected || expected.toLowerCase() === actual?.toLowerCase();
}

function firstErrorCode(value: unknown) {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0].slice(0, 80) : undefined;
}

function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : 'ProviderError';
}
