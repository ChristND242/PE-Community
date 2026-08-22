import {
  BUILT_IN_EMAIL_TEMPLATES,
  EmailLocale,
  EmailTemplateKey,
  EMAIL_LOCALES,
  LocalizedEmailTemplate,
  normalizeEmailLocale,
} from '@pe/shared';
import { Prisma, PrismaClient } from '@prisma/client';

export const registrationInviteEmailKey = 'registration_invite_email';
export const passwordResetEmailKey = 'password_reset_email';

export type MessageTemplateChannel = 'notification' | 'email' | 'system';

export const editableEmailTemplateKeys = [
  passwordResetEmailKey,
  registrationInviteEmailKey,
  'REGISTRATION_APPROVED',
  'EMAIL_VERIFY_PRIMARY_ADDRESS',
  'EMAIL_CHANGE_VERIFY_NEW_ADDRESS',
  'EMAIL_CHANGE_NOTICE_OLD_ADDRESS',
  'EMAIL_CHANGE_COMPLETED',
  'REGISTRATION_ACKNOWLEDGEMENT',
  'REGISTRATION_PENDING_REMINDER',
  'REGISTRATION_EXISTING_ACCOUNT_NOTICE',
  'REGISTRATION_POLICY_GUIDANCE',
] as const satisfies readonly EmailTemplateKey[];

export type EditableEmailTemplateKey = (typeof editableEmailTemplateKeys)[number];
export type MessageTemplateDefinition = LocalizedEmailTemplate & {
  title: string;
  description: string;
  channel: 'email';
  isEditable: true;
  isSystem: false;
};

const templateMetadata: Record<EditableEmailTemplateKey, { title: string; description: string }> = {
  password_reset_email: {
    title: 'Password reset email',
    description: 'Sent when a member requests a secure password reset link.',
  },
  registration_invite_email: {
    title: 'Registration invite email',
    description: 'Sent when an admin or owner emails a registration invitation.',
  },
  REGISTRATION_APPROVED: {
    title: 'Registration approved',
    description: 'Confirms approval and includes primary email verification when required.',
  },
  EMAIL_VERIFY_PRIMARY_ADDRESS: {
    title: 'Primary email verification',
    description: 'Sent when a member requests verification of the current account address.',
  },
  EMAIL_CHANGE_VERIFY_NEW_ADDRESS: {
    title: 'Email change verification',
    description: 'Sent to a proposed new address before an account email is changed.',
  },
  EMAIL_CHANGE_NOTICE_OLD_ADDRESS: {
    title: 'Email change request notice',
    description: 'Security notice sent to the current address when a change is requested.',
  },
  EMAIL_CHANGE_COMPLETED: {
    title: 'Email change completion notice',
    description: 'Security confirmation sent after an account email is changed.',
  },
  REGISTRATION_ACKNOWLEDGEMENT: {
    title: 'Registration acknowledgement',
    description: 'Sent after a new registration request is accepted for review.',
  },
  REGISTRATION_PENDING_REMINDER: {
    title: 'Pending registration reminder',
    description: 'Sent when an address submits another request while one is pending.',
  },
  REGISTRATION_EXISTING_ACCOUNT_NOTICE: {
    title: 'Existing-account registration notice',
    description: 'Security notice sent when a registration uses an address already associated with access.',
  },
  REGISTRATION_POLICY_GUIDANCE: {
    title: 'Registration policy guidance',
    description: 'Private sign-in or recovery guidance for an existing address.',
  },
};

const emailTemplateActionVariables: Partial<Record<EditableEmailTemplateKey, string>> = {
  password_reset_email: 'resetUrl',
  registration_invite_email: 'inviteUrl',
  REGISTRATION_APPROVED: 'verificationUrl',
  EMAIL_VERIFY_PRIMARY_ADDRESS: 'verificationUrl',
  EMAIL_CHANGE_VERIFY_NEW_ADDRESS: 'verificationUrl',
  REGISTRATION_EXISTING_ACCOUNT_NOTICE: 'loginUrl',
  REGISTRATION_POLICY_GUIDANCE: 'passwordRecoveryUrl',
};

export function editableTemplateRequiredVariables(template: LocalizedEmailTemplate) {
  const actionVariable = emailTemplateActionVariables[template.templateKey as EditableEmailTemplateKey];
  return template.requiredVariables.filter((variable) => variable !== actionVariable);
}

export function emailTemplateUsesLayoutAction(template: LocalizedEmailTemplate) {
  return Boolean(emailTemplateActionVariables[template.templateKey as EditableEmailTemplateKey]);
}

export function emailTemplatePreviewContext(key: EditableEmailTemplateKey) {
  const verificationUrl = key === 'EMAIL_CHANGE_VERIFY_NEW_ADDRESS'
    ? 'https://community.example.com/verify-email-change?token=preview'
    : 'https://community.example.com/verify-email?token=preview';
  const variables: Record<string, string | number> = {
    communityName: 'PE Community',
    recipientName: 'Exaud',
    supportEmail: 'support@community.example.com',
    resetUrl: 'https://community.example.com/reset-password?token=preview',
    inviteUrl: 'https://community.example.com/register?token=preview',
    verificationUrl,
    expiresInMinutes: 45,
    maskedNewEmail: 'e***@example.com',
    loginUrl: 'https://community.example.com/login',
    passwordRecoveryUrl: 'https://community.example.com/forgot-password',
  };
  const actionVariable = emailTemplateActionVariables[key];
  return {
    variables,
    actionUrl: actionVariable ? String(variables[actionVariable]) : null,
  };
}

type TemplatePrismaClient = Pick<PrismaClient, 'communityMessageTemplate'>;
type TemplateRecord = Prisma.CommunityMessageTemplateGetPayload<Record<string, never>>;

export async function ensureCommunityMessageTemplates(
  prisma: TemplatePrismaClient,
  communityId: string,
  _communityName: string,
) {
  await Promise.all(editableEmailTemplateKeys.flatMap((key) => EMAIL_LOCALES.map((locale) => {
    const definition = messageTemplateDefinition(key, locale);
    return prisma.communityMessageTemplate.upsert({
      where: { communityId_key_locale: { communityId, key, locale } },
      update: {
        channel: 'email',
        title: templateMetadata[key].title,
        defaultBody: definition.body,
        defaultContent: templateDefaultContent(definition),
        variablesJson: templateVariablesJson([...definition.variables]),
        isEditable: true,
        isSystem: false,
      },
      create: {
        communityId,
        key,
        locale,
        channel: 'email',
        title: templateMetadata[key].title,
        subject: definition.subject,
        previewText: definition.previewText,
        heading: definition.heading,
        greeting: definition.greeting,
        body: definition.body,
        buttonLabel: definition.buttonLabel,
        fallbackLinkInstructions: definition.fallbackLinkInstructions,
        expirationNotice: definition.expirationNotice,
        securityNotice: definition.securityNotice,
        footerExplanation: definition.footerExplanation,
        defaultBody: definition.body,
        defaultContent: templateDefaultContent(definition),
        variablesJson: templateVariablesJson([...definition.variables]),
        isEditable: true,
        isSystem: false,
      },
    });
  })));
}

export function messageTemplateDefinition(key: EditableEmailTemplateKey, locale?: EmailLocale): MessageTemplateDefinition;
export function messageTemplateDefinition(key: string, locale?: EmailLocale): MessageTemplateDefinition | undefined;
export function messageTemplateDefinition(key: string, locale: EmailLocale = 'en'): MessageTemplateDefinition | undefined {
  if (!isEditableEmailTemplateKey(key)) return undefined;
  const template = BUILT_IN_EMAIL_TEMPLATES[key][locale];
  return {
    ...template,
    title: templateMetadata[key].title,
    description: templateMetadata[key].description,
    channel: 'email' as const,
    isEditable: true,
    isSystem: false,
  };
}

export function resolveCompleteMessageTemplate(
  records: TemplateRecord[],
  key: string,
  requestedLocale: unknown,
): { template: LocalizedEmailTemplate; fallbackUsed: boolean; customized: boolean; needsReview: boolean } {
  if (!isEditableEmailTemplateKey(key)) throw new Error(`Unsupported email template key: ${key}`);
  const locale = normalizeEmailLocale(requestedLocale);
  const requested = records.find((record) => record.key === key && record.locale === locale);
  if (requested && completeTemplateRecord(requested, key, locale)) {
    return {
      template: recordToTemplate(requested),
      fallbackUsed: false,
      customized: customizedRecord(requested),
      needsReview: requested.needsReview,
    };
  }
  const english = records.find((record) => record.key === key && record.locale === 'en');
  if (english && completeTemplateRecord(english, key, 'en')) {
    return {
      template: recordToTemplate(english),
      fallbackUsed: locale !== 'en',
      customized: customizedRecord(english),
      needsReview: english.needsReview,
    };
  }
  return {
    template: BUILT_IN_EMAIL_TEMPLATES[key].en,
    fallbackUsed: true,
    customized: false,
    needsReview: false,
  };
}

export function templateDefaultContent(template: LocalizedEmailTemplate): Prisma.InputJsonObject {
  return {
    subject: template.subject,
    previewText: template.previewText ?? null,
    heading: template.heading,
    greeting: template.greeting ?? null,
    body: template.body,
    buttonLabel: template.buttonLabel ?? null,
    fallbackLinkInstructions: template.fallbackLinkInstructions ?? null,
    expirationNotice: template.expirationNotice ?? null,
    securityNotice: template.securityNotice ?? null,
    footerExplanation: template.footerExplanation ?? null,
  };
}

export function templateVariablesJson(variables: string[]): Prisma.InputJsonArray {
  return variables as Prisma.InputJsonArray;
}

export function missingRequiredVariables(content: string, requiredVariables: readonly string[]) {
  return requiredVariables.filter((variable) => !new RegExp(`\\{\\{\\s*${escapeRegExp(variable)}\\s*\\}\\}`).test(content));
}

export function renderMessageTemplate(body: string, values: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

function recordToTemplate(record: TemplateRecord): LocalizedEmailTemplate {
  const definition = messageTemplateDefinition(record.key, normalizeEmailLocale(record.locale));
  if (!definition) throw new Error(`Unsupported email template key: ${record.key}`);
  return {
    templateKey: record.key as EmailTemplateKey,
    locale: normalizeEmailLocale(record.locale),
    subject: record.subject,
    previewText: record.previewText,
    heading: record.heading,
    greeting: record.greeting,
    body: record.body,
    buttonLabel: record.buttonLabel,
    fallbackLinkInstructions: record.fallbackLinkInstructions,
    expirationNotice: record.expirationNotice,
    securityNotice: record.securityNotice,
    footerExplanation: record.footerExplanation,
    variables: definition.variables,
    requiredVariables: definition.requiredVariables,
  };
}

function completeTemplateRecord(record: TemplateRecord, key: EmailTemplateKey, locale: EmailLocale) {
  const required = BUILT_IN_EMAIL_TEMPLATES[key][locale];
  return Boolean(
    record.subject.trim()
    && record.heading.trim()
    && record.body.trim()
    && (!required.greeting || record.greeting?.trim())
    && (!required.buttonLabel || record.buttonLabel?.trim())
    && (!required.fallbackLinkInstructions || record.fallbackLinkInstructions?.trim())
    && (!required.expirationNotice || record.expirationNotice?.trim())
    && (!required.securityNotice || record.securityNotice?.trim())
    && (!required.footerExplanation || record.footerExplanation?.trim()),
  );
}

function customizedRecord(record: TemplateRecord) {
  if (!record.defaultContent || typeof record.defaultContent !== 'object' || Array.isArray(record.defaultContent)) return true;
  const current = {
    subject: record.subject,
    previewText: record.previewText,
    heading: record.heading,
    greeting: record.greeting,
    body: record.body,
    buttonLabel: record.buttonLabel,
    fallbackLinkInstructions: record.fallbackLinkInstructions,
    expirationNotice: record.expirationNotice,
    securityNotice: record.securityNotice,
    footerExplanation: record.footerExplanation,
  };
  return JSON.stringify(current) !== JSON.stringify(record.defaultContent);
}

export function isEditableEmailTemplateKey(key: string): key is EditableEmailTemplateKey {
  return editableEmailTemplateKeys.includes(key as EditableEmailTemplateKey);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
