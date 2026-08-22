import {
  BrandedEmailInput,
  builtInEmailTemplate,
  DEFAULT_EMAIL_LOGO_URL,
  EmailLocale,
  EmailTemplateKey,
  escapeEmailHtml,
  LocalizedEmailTemplate,
  normalizeEmailLocale,
  RenderedEmail,
  renderBrandedEmail,
  renderTemplateEmail,
  resolveEmailLocale,
  safeEmailImageUrl,
  safeEmailUrl,
} from '@pe/shared';

export {
  DEFAULT_EMAIL_LOGO_URL,
  escapeEmailHtml,
  normalizeEmailLocale,
  renderBrandedEmail,
  renderTemplateEmail,
  resolveEmailLocale,
  safeEmailImageUrl,
  safeEmailUrl,
};
export type { BrandedEmailInput, EmailLocale, EmailTemplateKey, LocalizedEmailTemplate, RenderedEmail };

type CommunityTemplateInput = {
  communityName: string;
  locale?: EmailLocale;
};

export function renderEmailConfigurationTest(input: CommunityTemplateInput): RenderedEmail {
  const locale = normalizeEmailLocale(input.locale);
  return renderTemplateEmail(
    builtInEmailTemplate('EMAIL_CONFIGURATION_TEST', locale),
    { communityName: input.communityName },
    { communityName: input.communityName },
  );
}

export function renderPasswordResetEmail(input: CommunityTemplateInput & {
  memberName?: string | null;
  resetUrl: string;
  template?: LocalizedEmailTemplate;
}): RenderedEmail {
  const locale = normalizeEmailLocale(input.locale);
  return renderTemplateEmail(
    input.template ?? builtInEmailTemplate('password_reset_email', locale),
    {
      communityName: input.communityName,
      recipientName: input.memberName || input.communityName,
      resetUrl: input.resetUrl,
      expiresInMinutes: 45,
    },
    { communityName: input.communityName, actionUrl: input.resetUrl },
  );
}

export function renderRegistrationInviteEmail(input: CommunityTemplateInput & {
  inviteUrl: string;
  template?: LocalizedEmailTemplate;
}): RenderedEmail {
  const locale = normalizeEmailLocale(input.locale);
  return renderTemplateEmail(
    input.template ?? builtInEmailTemplate('registration_invite_email', locale),
    { communityName: input.communityName, inviteUrl: input.inviteUrl },
    { communityName: input.communityName, actionUrl: input.inviteUrl },
  );
}

export function renderAnnouncementEmail(input: CommunityTemplateInput & { title: string; body: string }): RenderedEmail {
  const locale = normalizeEmailLocale(input.locale);
  return renderBrandedEmail({
    subject: input.title,
    title: input.title,
    body: input.body,
    communityName: input.communityName,
    locale,
    align: 'left',
    eyebrow: locale === 'fr' ? 'Annonce' : 'Announcement',
  });
}
