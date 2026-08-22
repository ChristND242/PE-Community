export const CAPTCHA_PROVIDERS = ['DISABLED', 'CLOUDFLARE_TURNSTILE', 'GOOGLE_RECAPTCHA', 'HCAPTCHA'] as const;
export const CAPTCHA_MODES = ['DISABLED', 'ALWAYS'] as const;
export const RECAPTCHA_VARIANTS = ['V2_CHECKBOX', 'V3_SCORE'] as const;
export const REGISTRATION_REQUEST_NOTE_MAX_LENGTH = 500;

export type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number];
export type CaptchaMode = (typeof CAPTCHA_MODES)[number];
export type RecaptchaVariant = (typeof RECAPTCHA_VARIANTS)[number];

export type RegistrationNoticeCategory =
  | 'REGISTRATION_ACKNOWLEDGEMENT'
  | 'REGISTRATION_PENDING_REMINDER'
  | 'REGISTRATION_EXISTING_ACCOUNT_NOTICE'
  | 'REGISTRATION_POLICY_GUIDANCE';

export type RegistrationSubmissionDecision =
  | { kind: 'created'; applicationId: string; notification: 'REGISTRATION_ACKNOWLEDGEMENT' }
  | { kind: 'pending_exists'; applicationId: string; notification: 'REGISTRATION_PENDING_REMINDER' }
  | { kind: 'existing_account'; applicationId?: string; notification: 'REGISTRATION_EXISTING_ACCOUNT_NOTICE' }
  | { kind: 'policy_guidance'; applicationId?: string; notification: 'REGISTRATION_POLICY_GUIDANCE' };

export type RegistrationCaptchaSettings = {
  enabled: boolean;
  mode: CaptchaMode;
  provider: CaptchaProvider;
  variant: RecaptchaVariant | null;
  siteKey: string | null;
  secretEncrypted: string | null;
  hostname: string | null;
  action: string | null;
  minimumScore: number;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
