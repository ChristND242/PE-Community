import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret } from '../security/encrypted-secret';
import {
  CAPTCHA_MODES,
  CAPTCHA_PROVIDERS,
  CaptchaMode,
  CaptchaProvider,
  RECAPTCHA_VARIANTS,
  RecaptchaVariant,
  RegistrationCaptchaSettings,
  REGISTRATION_REQUEST_NOTE_MAX_LENGTH,
} from './registration.types';

@Injectable()
export class RegistrationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async settings(communityId: string) {
    return this.ensureSettings(communityId);
  }

  async captchaSettings(communityId: string): Promise<RegistrationCaptchaSettings> {
    const settings = await this.ensureSettings(communityId);
    return {
      enabled: settings.registrationCaptchaEnabled,
      mode: settings.registrationCaptchaMode as CaptchaMode,
      provider: settings.registrationCaptchaProvider as CaptchaProvider,
      variant: settings.registrationCaptchaVariant as RecaptchaVariant | null,
      siteKey: settings.registrationCaptchaSiteKey,
      secretEncrypted: settings.registrationCaptchaSecretEncrypted,
      hostname: settings.registrationCaptchaHostname,
      action: settings.registrationCaptchaAction,
      minimumScore: settings.registrationCaptchaMinimumScore,
    };
  }

  async publicConfig(communityId?: string) {
    const community = communityId
      ? await this.prisma.community.findUnique({ where: { id: communityId }, select: { id: true } })
      : await this.prisma.community.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!community) throw new BadRequestException('Community is not available.');
    const settings = await this.ensureSettings(community.id);
    const captchaRequired = settings.registrationCaptchaEnabled
      && settings.registrationCaptchaMode === 'ALWAYS'
      && settings.registrationCaptchaProvider !== 'DISABLED'
      && Boolean(settings.registrationCaptchaSiteKey && settings.registrationCaptchaSecretEncrypted);
    return {
      communityId: community.id,
      captchaRequired,
      provider: captchaRequired ? settings.registrationCaptchaProvider : 'DISABLED',
      variant: captchaRequired ? settings.registrationCaptchaVariant : null,
      siteKey: captchaRequired ? settings.registrationCaptchaSiteKey : null,
      action: captchaRequired ? settings.registrationCaptchaAction : null,
      requestNoteMaxLength: REGISTRATION_REQUEST_NOTE_MAX_LENGTH,
    };
  }

  async adminConfig(communityId: string) {
    const settings = await this.ensureSettings(communityId);
    return {
      enabled: settings.registrationCaptchaEnabled,
      mode: settings.registrationCaptchaMode,
      provider: settings.registrationCaptchaProvider,
      variant: settings.registrationCaptchaVariant,
      siteKey: settings.registrationCaptchaSiteKey ?? '',
      secretConfigured: Boolean(settings.registrationCaptchaSecretEncrypted),
      hostname: settings.registrationCaptchaHostname ?? '',
      action: settings.registrationCaptchaAction ?? '',
      minimumScore: settings.registrationCaptchaMinimumScore,
      ipLimit: settings.registrationIpLimit,
      ipWindowMinutes: settings.registrationIpWindowMinutes,
      notificationCooldownHours: settings.registrationNotificationCooldownHours,
      globalEmailDailyLimit: settings.registrationGlobalEmailDailyLimit,
    };
  }

  async update(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const existing = await this.ensureSettings(communityId);
    const enabled = booleanValue(input.enabled) ?? existing.registrationCaptchaEnabled;
    const mode = enumValue(input.mode, CAPTCHA_MODES) ?? existing.registrationCaptchaMode as CaptchaMode;
    const provider = enumValue(input.provider, CAPTCHA_PROVIDERS) ?? existing.registrationCaptchaProvider as CaptchaProvider;
    const variant = nullableEnumValue(input.variant, RECAPTCHA_VARIANTS);
    const siteKey = nullableString(input.siteKey);
    const hostname = validatedHostname(input.hostname);
    const action = validatedAction(input.action);
    const effectiveAction = provider === 'HCAPTCHA' || (provider === 'GOOGLE_RECAPTCHA' && variant !== 'V3_SCORE') ? null : action;
    const minimumScore = boundedNumber(input.minimumScore, 0, 1, existing.registrationCaptchaMinimumScore);
    const ipLimit = boundedInteger(input.ipLimit, 1, 20, existing.registrationIpLimit);
    const ipWindowMinutes = boundedInteger(input.ipWindowMinutes, 1, 60, existing.registrationIpWindowMinutes);
    const notificationCooldownHours = boundedInteger(input.notificationCooldownHours, 6, 24, existing.registrationNotificationCooldownHours);
    const globalEmailDailyLimit = boundedInteger(input.globalEmailDailyLimit, 1, 10, existing.registrationGlobalEmailDailyLimit);
    const secret = stringValue(input.secret);
    const removeSecret = input.removeSecret === true;
    const secretEncrypted = removeSecret
      ? null
      : secret
        ? encryptSecret(secret)
        : existing.registrationCaptchaSecretEncrypted;
    if (enabled && provider !== existing.registrationCaptchaProvider && !secret) {
      throw new BadRequestException('Enter the secret key for the selected CAPTCHA provider.');
    }

    validateCaptchaConfiguration({ enabled, mode, provider, variant, siteKey, secretEncrypted, minimumScore });
    const secretRotated = Boolean(secret);
    const enabledChanged = enabled !== existing.registrationCaptchaEnabled;
    const limitsChanged = ipLimit !== existing.registrationIpLimit
      || ipWindowMinutes !== existing.registrationIpWindowMinutes
      || notificationCooldownHours !== existing.registrationNotificationCooldownHours
      || globalEmailDailyLimit !== existing.registrationGlobalEmailDailyLimit;

    await this.prisma.$transaction(async (tx) => {
      await tx.communitySettings.update({
        where: { communityId },
        data: {
          registrationCaptchaEnabled: enabled,
          registrationCaptchaMode: mode,
          registrationCaptchaProvider: provider,
          registrationCaptchaVariant: provider === 'GOOGLE_RECAPTCHA' ? variant : null,
          registrationCaptchaSiteKey: siteKey,
          registrationCaptchaSecretEncrypted: secretEncrypted,
          registrationCaptchaHostname: hostname,
          registrationCaptchaAction: effectiveAction,
          registrationCaptchaMinimumScore: minimumScore,
          registrationIpLimit: ipLimit,
          registrationIpWindowMinutes: ipWindowMinutes,
          registrationNotificationCooldownHours: notificationCooldownHours,
          registrationGlobalEmailDailyLimit: globalEmailDailyLimit,
        },
      });
      const events = [
        'security.captcha.updated',
        ...(enabledChanged ? [enabled ? 'security.captcha.enabled' : 'security.captcha.disabled'] : []),
        ...(secretRotated ? ['security.captcha.secret_rotated'] : []),
        ...(limitsChanged ? ['security.registration_limits.updated'] : []),
      ];
      await tx.auditLog.createMany({
        data: events.map((action) => ({
          communityId,
          actorUserId,
          action,
          targetType: 'CommunitySettings',
          targetId: existing.id,
          metadata: {
            enabled,
            mode,
            provider,
            variant: provider === 'GOOGLE_RECAPTCHA' ? variant : null,
            secretConfigured: Boolean(secretEncrypted),
            ipLimit,
            ipWindowMinutes,
            notificationCooldownHours,
            globalEmailDailyLimit,
          } as Prisma.InputJsonObject,
        })),
      });
    });
    return this.adminConfig(communityId);
  }

  async testConfiguration(communityId: string) {
    const settings = await this.ensureSettings(communityId);
    validateCaptchaConfiguration({
      enabled: settings.registrationCaptchaEnabled,
      mode: settings.registrationCaptchaMode as CaptchaMode,
      provider: settings.registrationCaptchaProvider as CaptchaProvider,
      variant: settings.registrationCaptchaVariant as RecaptchaVariant | null,
      siteKey: settings.registrationCaptchaSiteKey,
      secretEncrypted: settings.registrationCaptchaSecretEncrypted,
      minimumScore: settings.registrationCaptchaMinimumScore,
    });
    return {
      ok: true,
      liveChallengeVerified: false,
      message: 'Configuration fields are valid. A live user challenge is required to verify the provider credentials.',
    };
  }

  private async ensureSettings(communityId: string) {
    const existing = await this.prisma.communitySettings.findUnique({ where: { communityId } });
    if (existing) return existing;
    try {
      return await this.prisma.communitySettings.create({ data: { communityId } });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const raced = await this.prisma.communitySettings.findUnique({ where: { communityId } });
        if (raced) return raced;
      }
      throw error;
    }
  }
}

function validateCaptchaConfiguration(input: {
  enabled: boolean;
  mode: CaptchaMode;
  provider: CaptchaProvider;
  variant: RecaptchaVariant | null;
  siteKey: string | null;
  secretEncrypted: string | null;
  minimumScore: number;
}) {
  if (!input.enabled) return;
  if (input.mode !== 'ALWAYS') throw new BadRequestException('Enabled registration protection must use Always mode.');
  if (input.provider === 'DISABLED') throw new BadRequestException('A CAPTCHA provider is required.');
  if (!input.siteKey) throw new BadRequestException('A CAPTCHA site key is required.');
  if (!input.secretEncrypted) throw new BadRequestException('A CAPTCHA secret key is required.');
  if (input.provider === 'GOOGLE_RECAPTCHA' && !input.variant) throw new BadRequestException('A reCAPTCHA variant is required.');
  if (input.provider === 'GOOGLE_RECAPTCHA' && input.variant === 'V3_SCORE' && (input.minimumScore < 0 || input.minimumScore > 1)) {
    throw new BadRequestException('The reCAPTCHA minimum score must be between 0 and 1.');
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined;
}

function nullableString(value: unknown) {
  return stringValue(value) || null;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  const normalized = stringValue(value);
  return normalized && values.includes(normalized as T[number]) ? normalized as T[number] : undefined;
}

function nullableEnumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  const normalized = stringValue(value);
  if (!normalized) return null;
  if (!values.includes(normalized as T[number])) throw new BadRequestException('Unsupported CAPTCHA variant.');
  return normalized as T[number];
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new BadRequestException(`Value must be between ${minimum} and ${maximum}.`);
  return number;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = boundedNumber(value, minimum, maximum, fallback);
  if (!Number.isInteger(number)) throw new BadRequestException('Value must be a whole number.');
  return number;
}

function validatedHostname(value: unknown) {
  const hostname = nullableString(value)?.toLowerCase() ?? null;
  if (hostname && !/^(?=.{1,253}$)(localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)$/.test(hostname)) {
    throw new BadRequestException('Allowed hostname is invalid.');
  }
  return hostname;
}

function validatedAction(value: unknown) {
  const action = nullableString(value);
  if (action && !/^[a-z0-9_-]{1,32}$/i.test(action)) throw new BadRequestException('CAPTCHA action is invalid.');
  return action;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
