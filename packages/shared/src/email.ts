export type EmailLocale = 'en' | 'fr';

export const EMAIL_LOCALES = ['en', 'fr'] as const;

export const EMAIL_TEMPLATE_KEYS = [
  'EMAIL_CONFIGURATION_TEST',
  'password_reset_email',
  'registration_invite_email',
  'REGISTRATION_APPROVED',
  'EMAIL_VERIFY_PRIMARY_ADDRESS',
  'EMAIL_CHANGE_VERIFY_NEW_ADDRESS',
  'EMAIL_CHANGE_NOTICE_OLD_ADDRESS',
  'EMAIL_CHANGE_COMPLETED',
  'REGISTRATION_ACKNOWLEDGEMENT',
  'REGISTRATION_PENDING_REMINDER',
  'REGISTRATION_EXISTING_ACCOUNT_NOTICE',
  'REGISTRATION_POLICY_GUIDANCE',
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const DEFAULT_EMAIL_LOGO_URL = '';

export type LocalizedEmailTemplate = {
  templateKey: EmailTemplateKey;
  locale: EmailLocale;
  subject: string;
  previewText?: string | null;
  heading: string;
  greeting?: string | null;
  body: string;
  buttonLabel?: string | null;
  fallbackLinkInstructions?: string | null;
  expirationNotice?: string | null;
  securityNotice?: string | null;
  footerExplanation?: string | null;
  variables: readonly string[];
  requiredVariables: readonly string[];
};

export type RenderedLocalizedEmailTemplate = Omit<LocalizedEmailTemplate, 'variables' | 'requiredVariables'>;

export type BrandedEmailInput = {
  subject: string;
  title: string;
  body: string | string[];
  communityName?: string | null;
  locale: EmailLocale;
  previewText?: string | null;
  eyebrow?: string | null;
  greeting?: string | null;
  action?: { label: string; url: string } | null;
  fallbackLinkInstructions?: string | null;
  expiryText?: string | null;
  securityNote?: string | null;
  footerNote?: string | null;
  align?: 'center' | 'left';
  now?: Date;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

const sharedCopy = {
  en: {
    fallback: 'If the button does not work, copy and paste this link into your browser:',
    reason: 'You received this email because you have an account or activity in PE Community.',
    automated: 'This is an automated message. Please do not reply.',
  },
  fr: {
    fallback: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
    reason: 'Vous recevez cet e-mail en raison de votre compte ou de votre activité dans PE Community.',
    automated: 'Ceci est un message automatique. Merci de ne pas y répondre.',
  },
} as const;

const commonVariables = ['communityName', 'recipientName', 'supportEmail'] as const;

export const BUILT_IN_EMAIL_TEMPLATES: Record<EmailTemplateKey, Record<EmailLocale, LocalizedEmailTemplate>> = {
  EMAIL_CONFIGURATION_TEST: {
    en: template('EMAIL_CONFIGURATION_TEST', 'en', {
      subject: '{{communityName}} email configuration test',
      previewText: 'PE Community email configuration is working.',
      heading: 'Email configuration is working',
      body: 'This test confirms that {{communityName}} can successfully send email using the current configuration.',
      footerExplanation: 'You received this email because an administrator tested the email configuration.',
      variables: commonVariables,
      requiredVariables: ['communityName'],
    }),
    fr: template('EMAIL_CONFIGURATION_TEST', 'fr', {
      subject: 'Test de configuration des e-mails — {{communityName}}',
      previewText: 'La configuration des e-mails PE Community fonctionne.',
      heading: 'La configuration des e-mails fonctionne',
      body: 'Ce test confirme que {{communityName}} peut envoyer des e-mails avec la configuration actuelle.',
      footerExplanation: 'Vous recevez cet e-mail parce qu’un administrateur a testé la configuration des e-mails.',
      variables: commonVariables,
      requiredVariables: ['communityName'],
    }),
  },
  password_reset_email: {
    en: template('password_reset_email', 'en', {
      subject: 'Reset your password',
      previewText: 'Reset your PE Community password securely.',
      heading: 'Reset your password',
      greeting: 'Hello {{recipientName}},',
      body: 'Use the secure link below to reset your password.',
      buttonLabel: 'Reset password',
      fallbackLinkInstructions: 'If the button does not work, copy and paste this link into your browser:',
      expirationNotice: 'This link expires in {{expiresInMinutes}} minutes and can be used only once.',
      securityNotice: 'If you did not request this password reset, you can safely ignore this email.',
      footerExplanation: 'You received this email because a password reset was requested for your PE Community account.',
      variables: [...commonVariables, 'resetUrl', 'expiresInMinutes'],
      requiredVariables: ['recipientName', 'resetUrl', 'expiresInMinutes'],
    }),
    fr: template('password_reset_email', 'fr', {
      subject: 'Réinitialisez votre mot de passe',
      previewText: 'Réinitialisez votre mot de passe PE Community en toute sécurité.',
      heading: 'Réinitialisez votre mot de passe',
      greeting: 'Bonjour {{recipientName}},',
      body: 'Utilisez le lien sécurisé ci-dessous pour réinitialiser votre mot de passe.',
      buttonLabel: 'Réinitialiser le mot de passe',
      fallbackLinkInstructions: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
      expirationNotice: 'Ce lien expire dans {{expiresInMinutes}} minutes et ne peut être utilisé qu’une seule fois.',
      securityNotice: 'Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.',
      footerExplanation: 'Vous recevez cet e-mail parce qu’une réinitialisation a été demandée pour votre compte PE Community.',
      variables: [...commonVariables, 'resetUrl', 'expiresInMinutes'],
      requiredVariables: ['recipientName', 'resetUrl', 'expiresInMinutes'],
    }),
  },
  registration_invite_email: {
    en: template('registration_invite_email', 'en', {
      subject: 'You’re invited to join {{communityName}}',
      previewText: 'Invitation to join {{communityName}}.',
      heading: 'You’re invited to join {{communityName}}',
      greeting: 'Hello,',
      body: 'You’re invited to request membership in {{communityName}}. Your request will be reviewed before activation.',
      buttonLabel: 'Review invitation',
      fallbackLinkInstructions: 'If the button does not work, copy and paste this link into your browser:',
      securityNotice: 'Only use this invitation if you expected to receive it.',
      footerExplanation: 'You received this email because an administrator invited this address to {{communityName}}.',
      variables: [...commonVariables, 'inviteUrl'],
      requiredVariables: ['communityName', 'inviteUrl'],
    }),
    fr: template('registration_invite_email', 'fr', {
      subject: 'Invitation à rejoindre {{communityName}}',
      previewText: 'Invitation à rejoindre {{communityName}}.',
      heading: 'Invitation à rejoindre {{communityName}}',
      greeting: 'Bonjour,',
      body: 'Vous êtes invité à demander votre adhésion à {{communityName}}. Votre demande sera examinée avant activation.',
      buttonLabel: 'Consulter l’invitation',
      fallbackLinkInstructions: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
      securityNotice: 'Utilisez cette invitation uniquement si vous vous attendiez à la recevoir.',
      footerExplanation: 'Vous recevez cet e-mail parce qu’un administrateur a invité cette adresse à rejoindre {{communityName}}.',
      variables: [...commonVariables, 'inviteUrl'],
      requiredVariables: ['communityName', 'inviteUrl'],
    }),
  },
  REGISTRATION_APPROVED: {
    en: template('REGISTRATION_APPROVED', 'en', {
      subject: 'Your registration was approved — {{communityName}}',
      previewText: 'Your membership request was approved.',
      heading: 'Your registration was approved',
      greeting: 'Hello {{recipientName}},',
      body: 'Your registration for {{communityName}} has been approved.\n\nBefore continuing, verify your email address.',
      buttonLabel: 'Verify email address',
      fallbackLinkInstructions: 'If the button does not work, copy and paste this link into your browser:',
      expirationNotice: 'This link expires in {{expiresInMinutes}} minutes and can be used only once.',
      securityNotice: 'PE Community will never ask for your password, authentication code, or recovery code by email.',
      footerExplanation: 'You received this email because your registration request was reviewed.',
      variables: [...commonVariables, 'verificationUrl', 'expiresInMinutes'],
      requiredVariables: ['communityName', 'recipientName'],
    }),
    fr: template('REGISTRATION_APPROVED', 'fr', {
      subject: 'Votre inscription a été approuvée — {{communityName}}',
      previewText: 'Votre demande d’adhésion a été approuvée.',
      heading: 'Votre inscription a été approuvée',
      greeting: 'Bonjour {{recipientName}},',
      body: 'Votre inscription à {{communityName}} a été approuvée.\n\nAvant de continuer, vérifiez votre adresse e-mail.',
      buttonLabel: 'Vérifier l’adresse e-mail',
      fallbackLinkInstructions: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
      expirationNotice: 'Ce lien expire dans {{expiresInMinutes}} minutes et ne peut être utilisé qu’une seule fois.',
      securityNotice: 'PE Community ne vous demandera jamais votre mot de passe, votre code d’authentification ou votre code de récupération par e-mail.',
      footerExplanation: 'Vous recevez cet e-mail parce que votre demande d’inscription a été examinée.',
      variables: [...commonVariables, 'verificationUrl', 'expiresInMinutes'],
      requiredVariables: ['communityName', 'recipientName'],
    }),
  },
  EMAIL_VERIFY_PRIMARY_ADDRESS: {
    en: template('EMAIL_VERIFY_PRIMARY_ADDRESS', 'en', {
      subject: 'Verify your email address',
      previewText: 'Confirm ownership of your PE Community email address.',
      heading: 'Verify your email address',
      greeting: 'Hello {{recipientName}},',
      body: 'Confirm that this is the email address for your PE Community account.',
      buttonLabel: 'Verify email address',
      fallbackLinkInstructions: 'If the button does not work, copy and paste this link into your browser:',
      expirationNotice: 'This link expires in {{expiresInMinutes}} minutes and can be used only once.',
      securityNotice: 'PE Community will never ask for your password, authentication code, or recovery code by email.',
      footerExplanation: 'You received this email because verification was requested for your account address.',
      variables: [...commonVariables, 'verificationUrl', 'expiresInMinutes'],
      requiredVariables: ['recipientName', 'verificationUrl', 'expiresInMinutes'],
    }),
    fr: template('EMAIL_VERIFY_PRIMARY_ADDRESS', 'fr', {
      subject: 'Vérifiez votre adresse e-mail',
      previewText: 'Confirmez votre adresse e-mail PE Community.',
      heading: 'Vérifiez votre adresse e-mail',
      greeting: 'Bonjour {{recipientName}},',
      body: 'Confirmez qu’il s’agit de l’adresse e-mail de votre compte PE Community.',
      buttonLabel: 'Vérifier l’adresse e-mail',
      fallbackLinkInstructions: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
      expirationNotice: 'Ce lien expire dans {{expiresInMinutes}} minutes et ne peut être utilisé qu’une seule fois.',
      securityNotice: 'PE Community ne vous demandera jamais votre mot de passe, votre code d’authentification ou votre code de récupération par e-mail.',
      footerExplanation: 'Vous recevez cet e-mail parce qu’une vérification a été demandée pour l’adresse de votre compte.',
      variables: [...commonVariables, 'verificationUrl', 'expiresInMinutes'],
      requiredVariables: ['recipientName', 'verificationUrl', 'expiresInMinutes'],
    }),
  },
  EMAIL_CHANGE_VERIFY_NEW_ADDRESS: {
    en: template('EMAIL_CHANGE_VERIFY_NEW_ADDRESS', 'en', {
      subject: 'Verify your new email address',
      previewText: 'Confirm your new PE Community email address.',
      heading: 'Verify your new email address',
      greeting: 'Hello {{recipientName}},',
      body: 'A request was made to use this email address for your PE Community account. Verify it before the request expires.',
      buttonLabel: 'Verify email address',
      fallbackLinkInstructions: 'If the button does not work, copy and paste this link into your browser:',
      expirationNotice: 'This link expires in {{expiresInMinutes}} minutes and can be used only once.',
      securityNotice: 'If you did not request this change, do not use the link and secure your account.',
      footerExplanation: 'You received this email because this address was entered as a new PE Community account email.',
      variables: [...commonVariables, 'verificationUrl', 'expiresInMinutes'],
      requiredVariables: ['recipientName', 'verificationUrl', 'expiresInMinutes'],
    }),
    fr: template('EMAIL_CHANGE_VERIFY_NEW_ADDRESS', 'fr', {
      subject: 'Vérifiez votre nouvelle adresse e-mail',
      previewText: 'Confirmez votre nouvelle adresse e-mail PE Community.',
      heading: 'Vérifiez votre nouvelle adresse e-mail',
      greeting: 'Bonjour {{recipientName}},',
      body: 'Une demande a été faite pour utiliser cette adresse e-mail avec votre compte PE Community. Vérifiez-la avant l’expiration de la demande.',
      buttonLabel: 'Vérifier l’adresse e-mail',
      fallbackLinkInstructions: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
      expirationNotice: 'Ce lien expire dans {{expiresInMinutes}} minutes et ne peut être utilisé qu’une seule fois.',
      securityNotice: 'Si vous n’êtes pas à l’origine de cette demande, n’utilisez pas le lien et sécurisez votre compte.',
      footerExplanation: 'Vous recevez cet e-mail parce que cette adresse a été saisie comme nouvelle adresse de compte PE Community.',
      variables: [...commonVariables, 'verificationUrl', 'expiresInMinutes'],
      requiredVariables: ['recipientName', 'verificationUrl', 'expiresInMinutes'],
    }),
  },
  EMAIL_CHANGE_NOTICE_OLD_ADDRESS: {
    en: template('EMAIL_CHANGE_NOTICE_OLD_ADDRESS', 'en', {
      subject: 'Email address change requested',
      previewText: 'A change was requested for your PE Community account email.',
      heading: 'Email address change requested',
      greeting: 'Hello {{recipientName}},',
      body: 'A request was made to change your account email to {{maskedNewEmail}}. Your current email has not changed.',
      securityNotice: 'If you made this request, no action is needed at this address. If you did not, secure your account and contact the platform owner.',
      footerExplanation: 'You received this security notice because an email change was requested for your PE Community account.',
      variables: [...commonVariables, 'maskedNewEmail'],
      requiredVariables: ['recipientName', 'maskedNewEmail'],
    }),
    fr: template('EMAIL_CHANGE_NOTICE_OLD_ADDRESS', 'fr', {
      subject: 'Demande de changement d’adresse e-mail',
      previewText: 'Un changement d’adresse e-mail a été demandé pour votre compte PE Community.',
      heading: 'Demande de changement d’adresse e-mail',
      greeting: 'Bonjour {{recipientName}},',
      body: 'Une demande a été faite pour remplacer l’adresse e-mail de votre compte par {{maskedNewEmail}}. Votre adresse actuelle n’a pas changé.',
      securityNotice: 'Si vous avez fait cette demande, aucune action n’est requise à cette adresse. Dans le cas contraire, sécurisez votre compte et contactez le propriétaire de la plateforme.',
      footerExplanation: 'Vous recevez cet avis de sécurité parce qu’un changement d’adresse e-mail a été demandé pour votre compte PE Community.',
      variables: [...commonVariables, 'maskedNewEmail'],
      requiredVariables: ['recipientName', 'maskedNewEmail'],
    }),
  },
  EMAIL_CHANGE_COMPLETED: {
    en: template('EMAIL_CHANGE_COMPLETED', 'en', {
      subject: 'Your email address was changed',
      previewText: 'Your PE Community account email was updated.',
      heading: 'Your email address was changed',
      greeting: 'Hello {{recipientName}},',
      body: 'The email address used to sign in to your PE Community account was changed successfully.',
      securityNotice: 'If you did not make this change, secure your account and contact the platform owner immediately.',
      footerExplanation: 'You received this security notice because the email address on your PE Community account changed.',
      variables: commonVariables,
      requiredVariables: ['recipientName'],
    }),
    fr: template('EMAIL_CHANGE_COMPLETED', 'fr', {
      subject: 'Votre adresse e-mail a été modifiée',
      previewText: 'L’adresse e-mail de votre compte PE Community a été mise à jour.',
      heading: 'Votre adresse e-mail a été modifiée',
      greeting: 'Bonjour {{recipientName}},',
      body: 'L’adresse e-mail utilisée pour vous connecter à votre compte PE Community a été modifiée.',
      securityNotice: 'Si vous n’êtes pas à l’origine de cette modification, sécurisez votre compte et contactez immédiatement le propriétaire de la plateforme.',
      footerExplanation: 'Vous recevez cet avis de sécurité parce que l’adresse e-mail de votre compte PE Community a changé.',
      variables: commonVariables,
      requiredVariables: ['recipientName'],
    }),
  },
  REGISTRATION_ACKNOWLEDGEMENT: {
    en: registrationTemplate('REGISTRATION_ACKNOWLEDGEMENT', 'en', {
      subject: 'Registration request received — {{communityName}}',
      previewText: 'Your registration request has been received.',
      heading: 'Registration request received',
      body: 'We received your registration request. It is awaiting review. You will receive another message when its status changes.',
      footerExplanation: 'You received this email because this address was used for a registration request.',
    }),
    fr: registrationTemplate('REGISTRATION_ACKNOWLEDGEMENT', 'fr', {
      subject: 'Demande d’inscription reçue — {{communityName}}',
      previewText: 'Votre demande d’inscription a été reçue.',
      heading: 'Demande d’inscription reçue',
      body: 'Nous avons reçu votre demande d’inscription. Elle est en attente de validation. Vous recevrez un autre message lorsque son statut changera.',
      footerExplanation: 'Vous recevez cet e-mail parce que cette adresse a été utilisée pour une demande d’inscription.',
    }),
  },
  REGISTRATION_PENDING_REMINDER: {
    en: registrationTemplate('REGISTRATION_PENDING_REMINDER', 'en', {
      subject: 'Your registration request is already pending',
      previewText: 'No duplicate registration request was created.',
      heading: 'Your registration request is already pending',
      body: 'We received another registration request using this email address.\n\nA request associated with this address is already awaiting review. No duplicate request was created.',
      securityNotice: 'If you initiated this request, no further action is required. If you did not, no account changes were made.',
      footerExplanation: 'You received this email because this address was used for another registration attempt.',
    }),
    fr: registrationTemplate('REGISTRATION_PENDING_REMINDER', 'fr', {
      subject: 'Votre demande d’inscription est déjà en attente',
      previewText: 'Aucune demande d’inscription en double n’a été créée.',
      heading: 'Votre demande d’inscription est déjà en attente',
      body: 'Nous avons reçu une nouvelle demande d’inscription utilisant cette adresse e-mail.\n\nUne demande associée à cette adresse est déjà en attente de validation. Aucune demande en double n’a été créée.',
      securityNotice: 'Si vous êtes à l’origine de cette demande, aucune autre action n’est nécessaire. Dans le cas contraire, aucune modification n’a été apportée au compte.',
      footerExplanation: 'Vous recevez cet e-mail parce que cette adresse a été utilisée pour une nouvelle tentative d’inscription.',
    }),
  },
  REGISTRATION_EXISTING_ACCOUNT_NOTICE: {
    en: registrationTemplate('REGISTRATION_EXISTING_ACCOUNT_NOTICE', 'en', {
      subject: 'Registration attempt associated with your account',
      previewText: 'A registration attempt used this email address.',
      heading: 'Registration attempt associated with your account',
      body: 'We received a registration request using this email address. An account or registration may already be associated with it.',
      buttonLabel: 'Sign in',
      fallbackLinkInstructions: 'If the button does not work, copy and paste this link into your browser:',
      securityNotice: 'If you did not initiate this request, no account changes were made. You can safely ignore this email.',
      footerExplanation: 'You received this security notice because this address was used for a registration attempt.',
    }, ['loginUrl']),
    fr: registrationTemplate('REGISTRATION_EXISTING_ACCOUNT_NOTICE', 'fr', {
      subject: 'Tentative d’inscription associée à votre compte',
      previewText: 'Une tentative d’inscription a utilisé cette adresse e-mail.',
      heading: 'Tentative d’inscription associée à votre compte',
      body: 'Nous avons reçu une demande d’inscription utilisant cette adresse e-mail. Un compte ou une demande peut déjà y être associé.',
      buttonLabel: 'Se connecter',
      fallbackLinkInstructions: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
      securityNotice: 'Si vous n’êtes pas à l’origine de cette demande, aucune modification n’a été apportée au compte. Vous pouvez ignorer cet e-mail.',
      footerExplanation: 'Vous recevez cet avis de sécurité parce que cette adresse a été utilisée pour une tentative d’inscription.',
    }, ['loginUrl']),
  },
  REGISTRATION_POLICY_GUIDANCE: {
    en: registrationTemplate('REGISTRATION_POLICY_GUIDANCE', 'en', {
      subject: 'Registration guidance — {{communityName}}',
      previewText: 'Guidance for a registration request using this address.',
      heading: 'Registration guidance',
      body: 'We received a registration request using this email address. Sign in to continue, or use password recovery if you cannot access your account.',
      buttonLabel: 'Recover access',
      fallbackLinkInstructions: 'If the button does not work, copy and paste this link into your browser:',
      securityNotice: 'If you did not initiate this request, no account changes were made.',
      footerExplanation: 'You received this email because this address was used for a registration request.',
    }, ['passwordRecoveryUrl']),
    fr: registrationTemplate('REGISTRATION_POLICY_GUIDANCE', 'fr', {
      subject: 'Aide concernant votre inscription — {{communityName}}',
      previewText: 'Aide concernant une demande d’inscription utilisant cette adresse.',
      heading: 'Aide concernant votre inscription',
      body: 'Nous avons reçu une demande d’inscription utilisant cette adresse e-mail. Connectez-vous pour continuer ou utilisez la récupération du mot de passe si vous ne pouvez pas accéder à votre compte.',
      buttonLabel: 'Récupérer l’accès',
      fallbackLinkInstructions: 'Si le bouton ne fonctionne pas, copiez et collez ce lien dans votre navigateur :',
      securityNotice: 'Si vous n’êtes pas à l’origine de cette demande, aucune modification n’a été apportée au compte.',
      footerExplanation: 'Vous recevez cet e-mail parce que cette adresse a été utilisée pour une demande d’inscription.',
    }, ['passwordRecoveryUrl']),
  },
};

export function normalizeEmailLocale(value: unknown): EmailLocale {
  return typeof value === 'string' && value.toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr' : 'en';
}

export function resolveEmailLocale(explicitLocale?: unknown, communityLocale?: unknown, installationLocale?: unknown): EmailLocale {
  for (const candidate of [explicitLocale, communityLocale, installationLocale]) {
    if (candidate === 'en' || candidate === 'fr') return candidate;
  }
  return 'en';
}

export function builtInEmailTemplate(key: EmailTemplateKey, requestedLocale: unknown): LocalizedEmailTemplate {
  const locale = normalizeEmailLocale(requestedLocale);
  return BUILT_IN_EMAIL_TEMPLATES[key][locale] ?? BUILT_IN_EMAIL_TEMPLATES[key].en;
}

export function renderLocalizedTemplate(
  templateVariant: LocalizedEmailTemplate,
  variables: Record<string, string | number | null | undefined>,
): RenderedLocalizedEmailTemplate {
  for (const variable of templateVariant.requiredVariables) {
    if (variables[variable] === null || variables[variable] === undefined || String(variables[variable]).trim() === '') {
      throw new Error(`Missing required email template variable: ${variable}`);
    }
  }
  const values = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, String(value ?? '')]));
  const render = (value?: string | null) => value ? renderTemplateString(value, values) : null;
  return {
    templateKey: templateVariant.templateKey,
    locale: templateVariant.locale,
    subject: renderTemplateString(templateVariant.subject, values),
    previewText: render(templateVariant.previewText),
    heading: renderTemplateString(templateVariant.heading, values),
    greeting: render(templateVariant.greeting),
    body: renderTemplateString(templateVariant.body, values),
    buttonLabel: render(templateVariant.buttonLabel),
    fallbackLinkInstructions: render(templateVariant.fallbackLinkInstructions),
    expirationNotice: render(templateVariant.expirationNotice),
    securityNotice: render(templateVariant.securityNotice),
    footerExplanation: render(templateVariant.footerExplanation),
  };
}

export function renderBrandedEmail(input: BrandedEmailInput): RenderedEmail {
  const copy = sharedCopy[input.locale];
  const communityName = cleanText(input.communityName) || 'PE Community';
  const body = (Array.isArray(input.body) ? input.body : input.body.split(/\n{2,}/)).map(cleanText).filter(Boolean);
  const actionUrl = input.action ? safeEmailUrl(input.action.url) : null;
  const alignment = input.align === 'left' ? 'left' : 'center';
  const year = (input.now ?? new Date()).getUTCFullYear();
  const footerReason = cleanText(input.footerNote) || copy.reason;
  const preview = cleanText(input.previewText);
  const logoUrl = safeEmailImageUrl(DEFAULT_EMAIL_LOGO_URL);
  const fallback = cleanText(input.fallbackLinkInstructions) || copy.fallback;
  const paragraphs = body.map((paragraph) => `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;text-align:${alignment};">${escapeEmailHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  const action = input.action && actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:24px auto 0;"><tr><td bgcolor="#059669" style="border-radius:9px;text-align:center;"><a class="email-button" href="${escapeEmailHtml(actionUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 26px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;line-height:20px;text-decoration:none;border-radius:9px;">${escapeEmailHtml(input.action.label)}</a></td></tr></table>
      <p style="margin:20px 0 0;color:#6b7280;font-size:12px;line-height:1.6;text-align:left;">${escapeEmailHtml(fallback)}<br><a href="${escapeEmailHtml(actionUrl)}" target="_blank" rel="noopener noreferrer" style="color:#047857;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${escapeEmailHtml(actionUrl)}</a></p>`
    : '';
  const notes = [input.expiryText, input.securityNote].map(cleanText).filter(Boolean)
    .map((value) => `<p style="margin:12px 0 0;color:#6b7280;font-size:13px;line-height:1.6;text-align:${alignment};">${escapeEmailHtml(value)}</p>`).join('');
  const html = `<!doctype html>
<html lang="${input.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeEmailHtml(input.subject)}</title>
<style>@media only screen and (max-width:480px){.email-outer{padding:20px 8px!important}.email-logo{padding:0 16px 18px!important}.email-card{padding:26px 20px!important}.email-title{font-size:22px!important}.email-button{display:block!important;padding:14px 18px!important}.email-footer{padding:18px 16px 0!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f4f6;color:#111827;font-family:Arial,Helvetica,sans-serif;">
${preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeEmailHtml(preview)}</div>` : ''}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f4f6;"><tr><td class="email-outer" align="center" style="padding:32px 14px;">
  <table class="email-shell" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;margin:0 auto;">
    <tr><td class="email-logo" align="center" style="padding:0 24px 24px;">${logoUrl ? `<img src="${escapeEmailHtml(logoUrl)}" width="88" height="88" alt="PE Community" style="display:block;width:88px;height:88px;max-width:100%;margin:0 auto;border:0;outline:none;text-decoration:none;">` : '<div style="color:#047857;font-size:20px;font-weight:700;line-height:1.3;">PE Community</div>'}${communityName !== 'PE Community' ? `<div style="margin-top:8px;color:#6b7280;font-size:13px;line-height:1.4;">${escapeEmailHtml(communityName)}</div>` : ''}</td></tr>
    <tr><td class="email-card" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:36px 38px;">
      ${cleanText(input.eyebrow) ? `<div style="margin:0 0 10px;color:#059669;font-size:11px;font-weight:700;letter-spacing:1.2px;text-align:${alignment};text-transform:uppercase;">${escapeEmailHtml(cleanText(input.eyebrow))}</div>` : ''}
      <h1 class="email-title" style="margin:0 0 20px;color:#111827;font-size:26px;font-weight:700;line-height:1.3;text-align:${alignment};">${escapeEmailHtml(input.title)}</h1>
      ${cleanText(input.greeting) ? `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7;text-align:${alignment};">${escapeEmailHtml(cleanText(input.greeting))}</p>` : ''}
      ${paragraphs}${action}${notes}
    </td></tr>
    <tr><td class="email-footer" align="center" style="padding:22px 24px 0;color:#6b7280;font-size:12px;line-height:1.6;">${escapeEmailHtml(footerReason)}<br><strong style="color:#374151;">PE Community</strong>${communityName !== 'PE Community' ? ` · ${escapeEmailHtml(communityName)}` : ''}<br>${escapeEmailHtml(copy.automated)}<br>&copy; ${year} PE Community</td></tr>
  </table>
</td></tr></table>
</body></html>`;
  const textParts = [
    input.title,
    cleanText(input.greeting),
    ...body,
    input.action && actionUrl ? `${input.action.label}:\n${actionUrl}` : '',
    cleanText(input.expiryText),
    cleanText(input.securityNote),
    footerReason,
    `PE Community${communityName !== 'PE Community' ? ` · ${communityName}` : ''}`,
    copy.automated,
    `© ${year} PE Community`,
  ].filter(Boolean);
  return { subject: input.subject, html, text: textParts.join('\n\n') };
}

export function renderTemplateEmail(
  templateVariant: LocalizedEmailTemplate,
  variables: Record<string, string | number | null | undefined>,
  input: { communityName: string; actionUrl?: string | null; align?: 'center' | 'left'; now?: Date },
): RenderedEmail {
  const content = renderLocalizedTemplate(templateVariant, variables);
  return renderBrandedEmail({
    subject: content.subject,
    title: content.heading,
    body: content.body,
    communityName: input.communityName,
    locale: content.locale,
    previewText: content.previewText,
    greeting: content.greeting,
    action: content.buttonLabel && input.actionUrl ? { label: content.buttonLabel, url: input.actionUrl } : null,
    fallbackLinkInstructions: content.fallbackLinkInstructions,
    expiryText: content.expirationNotice,
    securityNote: content.securityNotice,
    footerNote: content.footerExplanation,
    align: input.align,
    now: input.now,
  });
}

export function safeEmailUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function safeEmailImageUrl(value: string): string | null {
  const url = safeEmailUrl(value);
  return url?.startsWith('https:') ? url : null;
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function template(
  templateKey: EmailTemplateKey,
  locale: EmailLocale,
  input: Omit<LocalizedEmailTemplate, 'templateKey' | 'locale'>,
): LocalizedEmailTemplate {
  return { templateKey, locale, ...input };
}

function registrationTemplate(
  templateKey: EmailTemplateKey,
  locale: EmailLocale,
  input: Pick<LocalizedEmailTemplate, 'subject' | 'previewText' | 'heading' | 'body' | 'buttonLabel' | 'fallbackLinkInstructions' | 'securityNotice' | 'footerExplanation'>,
  actionVariables: readonly string[] = [],
) {
  return template(templateKey, locale, {
    ...input,
    greeting: locale === 'fr' ? 'Bonjour {{recipientName}},' : 'Hello {{recipientName}},',
    variables: [...commonVariables, 'loginUrl', 'passwordRecoveryUrl'],
    requiredVariables: ['communityName', 'recipientName', ...actionVariables],
  });
}

function renderTemplateString(value: string, variables: Record<string, string>) {
  const rendered = value.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? '');
  if (/\{\{[^{}]+\}\}/.test(rendered)) throw new Error('Email template contains an unresolved variable.');
  return rendered;
}

function cleanText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}
