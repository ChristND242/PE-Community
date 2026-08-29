import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Prisma, PrismaClient } from '@prisma/client';
import type { LocalizedEmailTemplate } from '@pe/shared';
import {
  ensureCommunityMessageTemplates,
  passwordResetEmailKey,
  registrationInviteEmailKey,
  resolveCompleteMessageTemplate,
} from '../message-templates';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from '../security/encrypted-secret';
import {
  dateInPeriod,
  emailDashboardComparison,
  emailDashboardDeliveryTrend,
  emailDashboardPeriod,
  emailDashboardSparkline,
  parseEmailDashboardRange,
} from './email-dashboard-analytics';
import { EmailLocale, renderAnnouncementEmail, renderBrandedEmail, renderEmailConfigurationTest, renderPasswordResetEmail, renderRegistrationInviteEmail, renderTemplateEmail, resolveEmailLocale } from './email-template';

export const emailQueueName = 'pe-community-email';

type EmailRecipientInput = {
  userId?: string | null;
  email: string;
  name?: string | null;
};

type EmailCampaignInput = {
  communityId: string;
  createdById?: string | null;
  type: string;
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  locale?: EmailLocale;
  metadata?: Prisma.InputJsonObject;
  recipients: EmailRecipientInput[];
};

export type AutomationEmailAvailability = {
  available: boolean;
  reason?: 'SMTP_NOT_CONFIGURED' | 'SMTP_DISABLED' | 'MISSING_FROM_ADDRESS' | 'UNKNOWN';
};

type EffectiveSmtpConfig = {
  enabled: boolean;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  secure: boolean;
  fromEmail?: string;
  fromName?: string;
  source: 'database' | 'environment' | 'none';
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly queue = new Queue(emailQueueName, { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } });

  constructor(private readonly prisma: PrismaService) {}

  async publicSettings(communityId: string) {
    const [settings, effective, latestAttempt] = await Promise.all([
      this.emailSettings(communityId),
      this.effectiveConfig(communityId),
      this.latestDeliveryAttempt(communityId),
    ]);
    const configured = this.isCompleteSettings(settings);
    const deliveryIssue = latestAttempt?.status === 'FAILED' && latestAttempt.attemptedAt > settings.updatedAt;
    return {
      enabled: settings.enabled,
      smtpHost: settings.smtpHost ?? '',
      smtpPort: settings.smtpPort ?? 587,
      smtpUsername: settings.smtpUsername ?? '',
      smtpPasswordSet: Boolean(settings.smtpPasswordEncrypted),
      smtpSecure: settings.smtpSecure,
      fromEmail: settings.fromEmail ?? '',
      fromName: settings.fromName ?? '',
      available: this.isUsable(effective),
      configured,
      deliveryIssue,
      lastErrorMessage: deliveryIssue ? friendlySmtpError(latestAttempt?.errorMessage) : null,
      source: effective.source,
    };
  }

  async updateSettings(communityId: string, actorUserId: string, input: Record<string, unknown>) {
    const existing = await this.emailSettings(communityId);
    const password = stringValue(input.smtpPassword);
    const enabled = booleanValue(input.enabled) ?? existing.enabled;
    const smtpPort = numberValue(input.smtpPort);
    const smtpHost = nullableString(input.smtpHost);
    const fromEmail = nullableString(input.fromEmail);
    if (enabled) {
      if (!smtpHost) throw new BadRequestException('SMTP host is required when email sending is enabled.');
      if (!smtpPort) throw new BadRequestException('SMTP port is required when email sending is enabled.');
      if (!fromEmail || !fromEmail.includes('@')) throw new BadRequestException('A valid from email is required when email sending is enabled.');
      if (!nullableString(input.fromName)) throw new BadRequestException('From name is required when email sending is enabled.');
      if (!nullableString(input.smtpUsername)) throw new BadRequestException('SMTP username is required when email sending is enabled.');
      if (!existing.smtpPasswordEncrypted && !password) throw new BadRequestException('SMTP password is required when email sending is enabled.');
      if (smtpPort === 465 && (booleanValue(input.smtpSecure) ?? existing.smtpSecure) !== true) throw new BadRequestException('Port 465 usually requires secure TLS.');
    }
    const data: Prisma.CommunityEmailSettingsUpdateInput = {
      enabled,
      smtpHost,
      smtpPort,
      smtpUsername: nullableString(input.smtpUsername),
      smtpSecure: booleanValue(input.smtpSecure) ?? existing.smtpSecure,
      fromEmail,
      fromName: nullableString(input.fromName),
    };
    if (password) data.smtpPasswordEncrypted = encryptSecret(password);
    const updated = await this.prisma.communityEmailSettings.update({ where: { communityId }, data });
    await this.prisma.auditLog.create({
      data: {
        communityId,
        actorUserId,
        action: 'settings.smtp.updated',
        targetType: 'CommunityEmailSettings',
        targetId: updated.id,
        metadata: { enabled: updated.enabled, smtpHost: updated.smtpHost, smtpPort: updated.smtpPort, fromEmail: updated.fromEmail },
      },
    });
    return this.publicSettings(communityId);
  }

  async passwordResetAvailable(communityId?: string) {
    if (communityId) return { available: this.isUsable(await this.effectiveConfig(communityId)) };
    const community = await this.prisma.community.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
    return { available: community ? this.isUsable(await this.effectiveConfig(community.id)) : this.isUsable(envSmtpConfig()) };
  }

  async automationAvailability(communityId: string): Promise<AutomationEmailAvailability> {
    const [settings, effective] = await Promise.all([
      this.prisma.communityEmailSettings.findUnique({ where: { communityId } }),
      this.effectiveConfig(communityId),
    ]);
    if (this.isUsable(effective)) return { available: true };
    if (effective.enabled && !effective.fromEmail) return { available: false, reason: 'MISSING_FROM_ADDRESS' };
    if (settings && !settings.enabled && !envSmtpConfig().enabled) return { available: false, reason: 'SMTP_DISABLED' };
    if (!settings && !envSmtpConfig().enabled) return { available: false, reason: 'SMTP_NOT_CONFIGURED' };
    return { available: false, reason: 'UNKNOWN' };
  }

  async queueAutomationEmail(input: EmailCampaignInput) {
    return this.queueCampaign(input);
  }

  async sendTestEmail(communityId: string, actorUserId: string, recipientEmail: string) {
    const email = stringValue(recipientEmail);
    if (!email || !email.includes('@')) throw new BadRequestException('A valid recipient email is required.');
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, include: { settings: true } });
    const locale = emailLocale(community.settings?.defaultLanguage);
    const rendered = renderEmailConfigurationTest({ communityName: community.name, locale });
    const campaign = await this.queueCampaign({
      communityId,
      createdById: actorUserId,
      type: 'TEST',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale,
      metadata: { templateKey: 'EMAIL_CONFIGURATION_TEST', locale },
      recipients: [{ email }],
    });
    await this.prisma.auditLog.create({
      data: { communityId, actorUserId, action: 'email.test.sent', targetType: 'EmailCampaign', targetId: campaign.id, metadata: { recipientEmail: email } },
    });
    return campaign;
  }

  async queuePasswordResetEmail(communityId: string, user: { id: string; email: string; name: string }, token: string) {
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, include: { settings: true } });
    const locale = emailLocale(community.settings?.defaultLanguage);
    const resetUrl = publicWebUrl('/reset-password', { token });
    const resolved = await this.messageTemplate(communityId, community.name, passwordResetEmailKey, locale);
    this.warnTemplateFallback(passwordResetEmailKey, locale, resolved);
    const rendered = renderPasswordResetEmail({
      communityName: community.name,
      memberName: user.name,
      resetUrl,
      locale: resolved.template.locale,
      template: resolved.template,
    });
    return this.queueCampaign({
      communityId,
      type: 'PASSWORD_RESET',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale: resolved.template.locale,
      metadata: {
        templateKey: passwordResetEmailKey,
        locale: resolved.template.locale,
        templateFallbackUsed: resolved.fallbackUsed,
      },
      recipients: [{ userId: user.id, email: user.email, name: user.name }],
    });
  }

  async queueOwnerMfaRecoveryEmail(communityId: string, user: { id: string; email: string; name: string }) {
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, include: { settings: true } });
    const locale = emailLocale(community.settings?.defaultLanguage);
    const french = locale === 'fr';
    const subject = french ? 'Récupération de l’authentification à deux facteurs terminée' : 'Two-factor authentication recovery completed';
    const rendered = renderBrandedEmail({
      subject,
      title: subject,
      greeting: french ? `Bonjour ${user.name},` : `Hello ${user.name},`,
      body: french
        ? [
            'Une récupération d’urgence côté serveur a été effectuée pour votre compte propriétaire.',
            'Vos anciennes sessions, votre ancien facteur d’authentification et vos codes de récupération ont été invalidés. Vous devez vous connecter avec votre mot de passe et configurer un nouveau facteur avant de retrouver l’accès privilégié.',
            'Si vous n’avez pas autorisé cette opération, considérez le serveur comme potentiellement compromis et contactez immédiatement son opérateur.',
          ]
        : [
            'A server-side emergency recovery was performed for your Owner account.',
            'Your previous sessions, second factor, and recovery codes were invalidated. You must sign in with your password and configure a new factor before privileged access is restored.',
            'If you did not authorize this operation, treat the server as potentially compromised and contact its operator immediately.',
          ],
      communityName: community.name,
      locale,
      align: 'left',
      eyebrow: french ? 'Avis de sécurité' : 'Security notice',
    });
    return this.queueCampaign({
      communityId,
      type: 'OWNER_MFA_BREAK_GLASS_RECOVERY',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale,
      metadata: { source: 'OWNER_BREAK_GLASS_CLI', locale },
      recipients: [{ userId: user.id, email: user.email, name: user.name }],
    });
  }

  async queueSecurityEventEmail(eventId: string, recipientEmail?: string) {
    const existing = await this.prisma.emailCampaign.findFirst({
      where: { type: 'ACCOUNT_SECURITY_EVENT', metadata: { path: ['securityEventId'], equals: eventId } },
      include: { recipients: true },
    });
    if (existing) {
      await this.enqueueCampaignRecipients(
        existing.id,
        existing.recipients.filter((recipient) => ['PENDING', 'QUEUED', 'FAILED'].includes(recipient.status)),
        campaignLocale(existing.metadata),
      );
      return { id: existing.id, status: existing.status, recipientCount: existing.recipients.length };
    }
    const event = await this.prisma.securityEvent.findUnique({
      where: { id: eventId },
      include: { user: { select: { id: true, email: true, name: true } }, community: { include: { settings: true } } },
    });
    if (!event) throw new BadRequestException('Security event was not found.');
    const locale = emailLocale(event.community.settings?.defaultLanguage);
    const french = locale === 'fr';
    const copy = securityEventEmailCopy(event.eventType, locale, securityEventMetadata(event.metadata));
    const time = new Intl.DateTimeFormat(french ? 'fr-FR' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: event.community.settings?.timezone ?? 'UTC',
    }).format(event.occurredAt);
    const rendered = renderBrandedEmail({
      subject: copy.subject,
      title: copy.title,
      greeting: french ? `Bonjour ${event.user.name},` : `Hello ${event.user.name},`,
      body: [
        ...copy.body,
        `${french ? 'Heure' : 'Time'}: ${time}`,
        `${french ? 'Navigateur' : 'Browser'}: ${event.browser}`,
        `${french ? 'Système d’exploitation' : 'Operating system'}: ${event.operatingSystem}`,
        `${french ? 'Adresse IP' : 'IP address'}: ${event.ipAddress}`,
        `${french ? 'Pays' : 'Country'}: ${event.countryName}`,
        copy.guidance,
      ],
      communityName: event.community.name,
      locale,
      align: 'left',
      eyebrow: french ? 'Sécurité du compte' : 'Account security',
    });
    return this.queueCampaign({
      communityId: event.communityId,
      createdById: event.userId,
      type: 'ACCOUNT_SECURITY_EVENT',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale,
      metadata: { securityEventId: event.id, eventType: event.eventType, locale },
      recipients: [{ userId: event.userId, email: recipientEmail ?? event.user.email, name: event.user.name }],
    });
  }

  async queueEmailChangeVerification(
    communityId: string,
    user: { id: string; name: string },
    newEmail: string,
    token: string,
  ) {
    const verificationUrl = publicWebUrl('/verify-email-change', { token });
    const rendered = await this.renderAccountTemplate(
      communityId,
      'EMAIL_CHANGE_VERIFY_NEW_ADDRESS',
      {
        recipientName: user.name,
        verificationUrl,
        expiresInMinutes: 45,
      },
      verificationUrl,
    );
    return this.queueCampaign({
      communityId,
      createdById: user.id,
      type: 'EMAIL_CHANGE_VERIFY_NEW_ADDRESS',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale: rendered.locale,
      metadata: { templateKey: 'EMAIL_CHANGE_VERIFY_NEW_ADDRESS', locale: rendered.locale },
      recipients: [{ userId: user.id, email: newEmail, name: user.name }],
    });
  }

  async queuePrimaryEmailVerification(
    communityId: string,
    user: { id: string; email: string; name: string },
    token: string,
  ) {
    const verificationUrl = publicWebUrl('/verify-email', { token });
    const rendered = await this.renderAccountTemplate(
      communityId,
      'EMAIL_VERIFY_PRIMARY_ADDRESS',
      {
        recipientName: user.name,
        verificationUrl,
        expiresInMinutes: 45,
      },
      verificationUrl,
    );
    return this.queueCampaign({
      communityId,
      createdById: user.id,
      type: 'EMAIL_VERIFY_PRIMARY_ADDRESS',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale: rendered.locale,
      metadata: { templateKey: 'EMAIL_VERIFY_PRIMARY_ADDRESS', locale: rendered.locale },
      recipients: [{ userId: user.id, email: user.email, name: user.name }],
    });
  }

  async queueRegistrationApprovedEmail(
    communityId: string,
    user: { id: string; email: string; name: string },
    token: string | null,
  ) {
    const verificationUrl = token ? publicWebUrl('/verify-email', { token }) : null;
    const rendered = await this.renderAccountTemplate(
      communityId,
      'REGISTRATION_APPROVED',
      {
        recipientName: user.name,
        verificationUrl,
        expiresInMinutes: 45,
      },
      verificationUrl ?? undefined,
      token ? undefined : approvalOnlyTemplate,
    );
    return this.queueCampaign({
      communityId,
      createdById: user.id,
      type: 'REGISTRATION_APPROVED',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale: rendered.locale,
      metadata: { templateKey: 'REGISTRATION_APPROVED', locale: rendered.locale, verificationRequired: Boolean(token) },
      recipients: [{ userId: user.id, email: user.email, name: user.name }],
    });
  }

  async queueEmailChangeRequestNotice(
    communityId: string,
    user: { id: string; email: string; name: string },
    newEmail: string,
  ) {
    const rendered = await this.renderAccountTemplate(
      communityId,
      'EMAIL_CHANGE_NOTICE_OLD_ADDRESS',
      {
        recipientName: user.name,
        maskedNewEmail: maskEmailAddress(newEmail),
      },
    );
    return this.queueCampaign({
      communityId,
      createdById: user.id,
      type: 'EMAIL_CHANGE_NOTICE_OLD_ADDRESS',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale: rendered.locale,
      metadata: { templateKey: 'EMAIL_CHANGE_NOTICE_OLD_ADDRESS', locale: rendered.locale },
      recipients: [{ userId: user.id, email: user.email, name: user.name }],
    });
  }

  async queueEmailChangeCompleted(
    communityId: string,
    user: { id: string; name: string },
    oldEmail: string,
    newEmail: string,
  ) {
    const rendered = await this.renderAccountTemplate(
      communityId,
      'EMAIL_CHANGE_COMPLETED',
      { recipientName: user.name },
    );
    return this.queueCampaign({
      communityId,
      createdById: user.id,
      type: 'EMAIL_CHANGE_COMPLETED',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale: rendered.locale,
      metadata: { templateKey: 'EMAIL_CHANGE_COMPLETED', locale: rendered.locale },
      recipients: [
        { userId: user.id, email: oldEmail, name: user.name },
        { userId: user.id, email: newEmail, name: user.name },
      ],
    });
  }

  async queueAnnouncementBroadcast(communityId: string, actorUserId: string, announcement: { id: string; title: string; body: string }) {
    const [members, community] = await Promise.all([
      this.activeMembers(communityId),
      this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, include: { settings: true } }),
    ]);
    const locale = emailLocale(community.settings?.defaultLanguage);
    const rendered = renderAnnouncementEmail({ communityName: community.name, title: announcement.title, body: announcement.body, locale });
    const campaign = await this.queueCampaign({
      communityId,
      createdById: actorUserId,
      type: 'ANNOUNCEMENT',
      subject: announcement.title,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale,
      metadata: { templateKey: 'ANNOUNCEMENT', locale, source: 'ADMIN_AUTHORED' },
      recipients: members.map((member) => ({ userId: member.userId, email: member.user.email, name: member.user.name })),
    });
    await this.prisma.auditLog.create({
      data: { communityId, actorUserId, action: 'email.campaign.created', targetType: 'Announcement', targetId: announcement.id, metadata: { campaignId: campaign.id, type: 'ANNOUNCEMENT' } },
    });
    await this.prisma.auditLog.create({
      data: { communityId, actorUserId, action: 'email.campaign.queued', targetType: 'EmailCampaign', targetId: campaign.id, metadata: { recipientCount: campaign.recipientCount } },
    });
    return campaign;
  }

  async queueEventAttendeeEmail(communityId: string, actorUserId: string, eventId: string, input: Record<string, unknown>) {
    const group = stringValue(input.recipientGroup) ?? 'all';
    const subject = stringValue(input.subject);
    const message = stringValue(input.message);
    if (!subject || !message) throw new BadRequestException('Email subject and message are required.');
    if (!['all', 'GOING', 'MAYBE', 'DECLINED'].includes(group)) throw new BadRequestException('Recipient group is invalid.');
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, communityId },
      include: { rsvps: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    if (!event) throw new BadRequestException('Event not found.');
    const rsvps = group === 'all' ? event.rsvps : event.rsvps.filter((rsvp) => rsvp.status === group);
    const rendered = await this.renderGeneralEmail(communityId, subject, message, 'Event');
    const campaign = await this.queueCampaign({
      communityId,
      createdById: actorUserId,
      type: 'EVENT_ATTENDEES',
      subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale: rendered.locale,
      metadata: { templateKey: 'EVENT_ATTENDEES', locale: rendered.locale, source: 'ADMIN_AUTHORED' },
      recipients: rsvps.map((rsvp) => ({ userId: rsvp.userId, email: rsvp.user.email, name: rsvp.user.name })),
    });
    await this.prisma.auditLog.create({
      data: { communityId, actorUserId, action: 'event.email_attendees.queued', targetType: 'Event', targetId: event.id, metadata: { campaignId: campaign.id, recipientGroup: group, recipientCount: campaign.recipientCount } },
    });
    return campaign;
  }

  async queuePassportReminderEmail(communityId: string, recipient: EmailRecipientInput, subject: string, body: string, createdById?: string | null) {
    const rendered = await this.renderGeneralEmail(communityId, subject, body, 'Reminder');
    return this.queueCampaign({ communityId, createdById, type: 'PASSPORT_EXPIRATION', subject, textBody: rendered.text, htmlBody: rendered.html, locale: rendered.locale, metadata: { templateKey: 'PASSPORT_EXPIRATION', locale: rendered.locale, source: 'SYSTEM_DYNAMIC' }, recipients: [recipient] });
  }

  async queueInviteEmail(communityId: string, actorUserId: string, recipientEmail: string, inviteUrl: string) {
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, include: { settings: true } });
    const locale = emailLocale(community.settings?.defaultLanguage);
    const resolved = await this.messageTemplate(communityId, community.name, registrationInviteEmailKey, locale);
    this.warnTemplateFallback(registrationInviteEmailKey, locale, resolved);
    const rendered = renderRegistrationInviteEmail({
      communityName: community.name,
      inviteUrl,
      locale: resolved.template.locale,
      template: resolved.template,
    });
    return this.queueCampaign({
      communityId,
      createdById: actorUserId,
      type: 'REGISTRATION_INVITE',
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      locale: resolved.template.locale,
      metadata: {
        templateKey: registrationInviteEmailKey,
        locale: resolved.template.locale,
        templateFallbackUsed: resolved.fallbackUsed,
      },
      recipients: [{ email: recipientEmail }],
    });
  }

  async recentCampaigns(communityId: string, take = 8) {
    const campaigns = await this.prisma.emailCampaign.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { recipients: true },
    });
    return campaigns.map((campaign) => ({
      id: campaign.id,
      type: campaign.type,
      subject: campaign.subject,
      status: campaign.status,
      recipientCount: campaign.recipients.length,
      sentCount: campaign.recipients.filter((recipient) => recipient.status === 'SENT').length,
      failedCount: campaign.recipients.filter((recipient) => recipient.status === 'FAILED').length,
      createdAt: campaign.createdAt,
      sentAt: campaign.sentAt,
    }));
  }

  async overview(communityId: string, input: Record<string, unknown> = {}) {
    const requestedRange = parseEmailDashboardRange(input.range);
    if (!requestedRange) throw new BadRequestException('Email dashboard range is invalid.');

    const settings = await this.prisma.communitySettings.findUnique({ where: { communityId }, select: { timezone: true } });
    const period = emailDashboardPeriod(requestedRange, settings?.timezone ?? 'UTC');
    const combinedFrom = period.previous?.from ?? period.current.from;
    const combinedDateFilter = dateFilter(combinedFrom, period.current.to);
    const [campaignRows, recipientRows, pendingRecipients, lastAttempt] = await Promise.all([
      this.prisma.emailCampaign.findMany({
        where: { communityId, createdAt: combinedDateFilter },
        select: { createdAt: true, status: true },
      }),
      this.prisma.emailRecipient.findMany({
        where: {
          campaign: { communityId },
          OR: [
            { status: 'SENT', sentAt: combinedDateFilter },
            { status: 'FAILED', attempts: { some: { status: 'FAILED', attemptedAt: combinedDateFilter } } },
          ],
        },
        select: {
          status: true,
          sentAt: true,
          attempts: {
            where: { status: 'FAILED', attemptedAt: combinedDateFilter },
            orderBy: { attemptedAt: 'desc' },
            take: 1,
            select: { attemptedAt: true },
          },
        },
      }),
      this.prisma.emailRecipient.count({ where: { campaign: { communityId }, status: { in: ['PENDING', 'QUEUED'] } } }),
      this.prisma.emailDeliveryAttempt.findFirst({ where: { campaign: { communityId } }, orderBy: { attemptedAt: 'desc' }, select: { attemptedAt: true } }),
    ]);

    const campaignDates = campaignRows.filter((campaign) => dateInPeriod(campaign.createdAt, period.current)).map((campaign) => campaign.createdAt);
    const previousCampaigns = period.previous ? campaignRows.filter((campaign) => dateInPeriod(campaign.createdAt, period.previous!)).length : null;
    const outcomeRows = recipientRows.flatMap((recipient) => {
      const outcomeAt = recipient.status === 'SENT' ? recipient.sentAt : recipient.attempts[0]?.attemptedAt;
      return outcomeAt ? [{ status: recipient.status, outcomeAt }] : [];
    });
    const sentDates = outcomeRows.filter((outcome) => outcome.status === 'SENT' && dateInPeriod(outcome.outcomeAt, period.current)).map((outcome) => outcome.outcomeAt);
    const failedDates = outcomeRows.filter((outcome) => outcome.status === 'FAILED' && dateInPeriod(outcome.outcomeAt, period.current)).map((outcome) => outcome.outcomeAt);
    const previousSent = period.previous ? outcomeRows.filter((outcome) => outcome.status === 'SENT' && dateInPeriod(outcome.outcomeAt, period.previous!)).length : null;
    const previousFailed = period.previous ? outcomeRows.filter((outcome) => outcome.status === 'FAILED' && dateInPeriod(outcome.outcomeAt, period.previous!)).length : null;
    const totalCampaigns = campaignDates.length;
    const sentEmails = sentDates.length;
    const failedEmails = failedDates.length;
    const currentCampaigns = campaignRows.filter((campaign) => dateInPeriod(campaign.createdAt, period.current));
    const queuedCampaigns = currentCampaigns.filter((campaign) => campaign.status === 'QUEUED' || campaign.status === 'SENDING').length;
    const campaignStatusCounts = countStatuses(currentCampaigns);
    const attemptedEmails = sentEmails + failedEmails;
    const deliverySuccessRate = attemptedEmails ? Math.round((sentEmails / attemptedEmails) * 100) : 0;
    const campaignSparkline = emailDashboardSparkline(campaignDates, period);
    const sentSparkline = emailDashboardSparkline(sentDates, period);
    const failedSparkline = emailDashboardSparkline(failedDates, period);
    return {
      range: {
        preset: period.range,
        timezone: period.timezone,
        from: period.current.from,
        to: period.current.to,
        previousFrom: period.previous?.from ?? null,
        previousTo: period.previous?.to ?? null,
      },
      metrics: {
        totalCampaigns,
        queuedCampaigns,
        sentEmails,
        failedEmails,
        deliverySuccessRate,
        pendingRecipients,
        failedRecipients: failedEmails,
        lastDeliveryAttemptAt: lastAttempt?.attemptedAt ?? null,
      },
      comparisons: {
        totalCampaigns: emailDashboardComparison(totalCampaigns, previousCampaigns, campaignSparkline, 'campaigns'),
        sentEmails: emailDashboardComparison(sentEmails, previousSent, sentSparkline, 'sent'),
        failedEmails: emailDashboardComparison(failedEmails, previousFailed, failedSparkline, 'failed'),
      },
      charts: {
        recipientsByStatus: [{ label: 'SENT', value: sentEmails }, { label: 'FAILED', value: failedEmails }],
        campaignsByStatus: Array.from(campaignStatusCounts, ([label, value]) => ({ label, value })),
        recentDeliveryTrend: emailDashboardDeliveryTrend(sentDates, failedDates, period),
      },
    };
  }

  async campaigns(communityId: string, input: Record<string, unknown>) {
    const page = Math.max(1, numberValue(input.page) ?? 1);
    const pageSize = Math.min(25, Math.max(5, numberValue(input.pageSize) ?? 10));
    const search = stringValue(input.search);
    const status = stringValue(input.status);
    const type = stringValue(input.type);
    const where: Prisma.EmailCampaignWhereInput = {
      communityId,
      ...(search ? { subject: { contains: search, mode: 'insensitive' } } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(type && type !== 'all' ? { type } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.emailCampaign.count({ where }),
      this.prisma.emailCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { recipients: true, attempts: { orderBy: { attemptedAt: 'desc' }, take: 1 } },
      }),
    ]);
    return {
      page,
      pageSize,
      total,
      campaigns: rows.map((campaign) => campaignSummary(campaign)),
    };
  }

  async campaignDetail(communityId: string, campaignId: string) {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id: campaignId, communityId },
      include: {
        recipients: { include: { attempts: { orderBy: { attemptedAt: 'desc' } } }, orderBy: { createdAt: 'asc' } },
        attempts: { orderBy: { attemptedAt: 'desc' } },
      },
    });
    if (!campaign) throw new BadRequestException('Email campaign not found.');
    return campaignSummary(campaign);
  }

  async retryFailedRecipients(communityId: string, campaignId: string, actorUserId: string) {
    const campaign = await this.prisma.emailCampaign.findFirst({ where: { id: campaignId, communityId }, include: { recipients: true } });
    if (!campaign) throw new BadRequestException('Email campaign not found.');
    const failedRecipients = campaign.recipients.filter((recipient) => recipient.status === 'FAILED');
    if (!failedRecipients.length) return { retried: 0 };
    await this.prisma.$transaction(async (tx) => {
      await tx.emailRecipient.updateMany({ where: { id: { in: failedRecipients.map((recipient) => recipient.id) }, status: 'FAILED' }, data: { status: 'QUEUED', errorMessage: null } });
      await tx.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'QUEUED', sentAt: null } });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'email.campaign.retry_failed', targetType: 'EmailCampaign', targetId: campaign.id, metadata: { retryCount: failedRecipients.length } },
      });
    });
    for (const recipient of failedRecipients) {
      await this.prisma.emailDeliveryAttempt.create({ data: { campaignId: campaign.id, recipientId: recipient.id, status: 'QUEUED' } });
      const locale = campaignLocale(campaign.metadata);
      await this.queue.add('send-email', { campaignId: campaign.id, recipientId: recipient.id, locale }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
    }
    return { retried: failedRecipients.length };
  }

  async cancelCampaign(communityId: string, campaignId: string, actorUserId: string) {
    const campaign = await this.prisma.emailCampaign.findFirst({ where: { id: campaignId, communityId }, include: { recipients: true } });
    if (!campaign) throw new BadRequestException('Email campaign not found.');
    if (!['QUEUED', 'SENDING'].includes(campaign.status)) throw new BadRequestException('Only queued or sending campaigns can be canceled.');
    const cancelableRecipients = campaign.recipients.filter((recipient) => ['PENDING', 'QUEUED'].includes(recipient.status));
    if (!cancelableRecipients.length) throw new BadRequestException('No queued recipients can be canceled.');
    const sentCount = campaign.recipients.filter((recipient) => recipient.status === 'SENT').length;
    await this.prisma.$transaction(async (tx) => {
      await tx.emailRecipient.updateMany({
        where: { id: { in: cancelableRecipients.map((recipient) => recipient.id) }, status: { in: ['PENDING', 'QUEUED'] } },
        data: { status: 'CANCELED', errorMessage: null },
      });
      await tx.emailCampaign.update({ where: { id: campaign.id }, data: { status: sentCount > 0 ? 'PARTIAL' : 'CANCELED', sentAt: new Date() } });
      await tx.auditLog.create({
        data: { communityId, actorUserId, action: 'email.campaign.canceled', targetType: 'EmailCampaign', targetId: campaign.id, metadata: { canceledCount: cancelableRecipients.length } },
      });
    });
    return { canceled: cancelableRecipients.length };
  }

  async exportCampaignRecipients(communityId: string, campaignId: string) {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id: campaignId, communityId },
      include: { recipients: { include: { attempts: { orderBy: { attemptedAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'asc' } } },
    });
    if (!campaign) throw new BadRequestException('Email campaign not found.');
    const rows = [
      ['name', 'email', 'status', 'sentAt', 'lastAttemptAt', 'errorMessage'],
      ...campaign.recipients.map((recipient) => [
        recipient.name ?? '',
        recipient.email,
        recipient.status,
        recipient.sentAt?.toISOString() ?? '',
        recipient.attempts[0]?.attemptedAt.toISOString() ?? '',
        recipient.errorMessage ?? recipient.attempts[0]?.errorMessage ?? '',
      ]),
    ];
    return {
      filename: `email-campaign-${campaign.id}-recipients.csv`,
      csv: rows.map((row) => row.map(csvCell).join(',')).join('\n'),
    };
  }

  private async messageTemplate(communityId: string, communityName: string, key: string, locale: EmailLocale) {
    await ensureCommunityMessageTemplates(this.prisma, communityId, communityName);
    const records = await this.prisma.communityMessageTemplate.findMany({
      where: { communityId, key, locale: { in: [locale, 'en'] } },
    });
    return resolveCompleteMessageTemplate(records, key, locale);
  }

  private async renderAccountTemplate(
    communityId: string,
    key: 'REGISTRATION_APPROVED' | 'EMAIL_VERIFY_PRIMARY_ADDRESS' | 'EMAIL_CHANGE_VERIFY_NEW_ADDRESS' | 'EMAIL_CHANGE_NOTICE_OLD_ADDRESS' | 'EMAIL_CHANGE_COMPLETED',
    variables: Record<string, string | number | null>,
    actionUrl?: string,
    transform?: (template: LocalizedEmailTemplate) => LocalizedEmailTemplate,
  ) {
    const community = await this.prisma.community.findUniqueOrThrow({
      where: { id: communityId },
      include: { settings: true },
    });
    const requestedLocale = emailLocale(community.settings?.defaultLanguage);
    const resolved = await this.messageTemplate(communityId, community.name, key, requestedLocale);
    this.warnTemplateFallback(key, requestedLocale, resolved);
    const template = transform ? transform(resolved.template) : resolved.template;
    return {
      ...renderTemplateEmail(
        template,
        { communityName: community.name, ...variables },
        { communityName: community.name, actionUrl },
      ),
      locale: template.locale,
    };
  }

  async queueCampaign(input: EmailCampaignInput) {
    if (!input.recipients.length) throw new BadRequestException('At least one email recipient is required.');
    const effective = await this.effectiveConfig(input.communityId);
    if (!this.isUsable(effective)) throw new BadRequestException('SMTP email delivery is not configured.');
    let textBody = input.textBody;
    let htmlBody = input.htmlBody;
    if (!htmlBody) {
      const rendered = await this.renderGeneralEmail(input.communityId, input.subject, input.textBody);
      textBody = rendered.text;
      htmlBody = rendered.html;
    }
    const locale = resolveEmailLocale(input.locale, input.metadata?.locale);
    const metadata = { ...(input.metadata ?? {}), locale } as Prisma.InputJsonObject;
    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.emailCampaign.create({
        data: {
          communityId: input.communityId,
          createdById: input.createdById,
          type: input.type,
          subject: input.subject,
          textBody,
          htmlBody,
          metadata,
          status: 'QUEUED',
        },
      });
      await tx.emailRecipient.createMany({
        data: input.recipients.map((recipient) => ({
          campaignId: created.id,
          userId: recipient.userId,
          email: recipient.email,
          name: recipient.name,
          status: 'QUEUED',
        })),
      });
      return tx.emailCampaign.findUniqueOrThrow({ where: { id: created.id }, include: { recipients: true } });
    });
    await this.enqueueCampaignRecipients(campaign.id, campaign.recipients, locale);
    console.log(`[email] queued campaign ${campaign.id} with ${campaign.recipients.length} recipient(s)`);
    return {
      id: campaign.id,
      status: campaign.status,
      recipientCount: campaign.recipients.length,
    };
  }

  async effectiveConfig(communityId: string): Promise<EffectiveSmtpConfig> {
    const settings = await this.prisma.communityEmailSettings.findUnique({ where: { communityId } });
    if (settings?.enabled) {
      return {
        enabled: true,
        host: settings.smtpHost ?? undefined,
        port: settings.smtpPort ?? undefined,
        username: settings.smtpUsername ?? undefined,
        password: settings.smtpPasswordEncrypted ? decryptSecret(settings.smtpPasswordEncrypted) : undefined,
        secure: settings.smtpSecure,
        fromEmail: settings.fromEmail ?? undefined,
        fromName: settings.fromName ?? undefined,
        source: 'database',
      };
    }
    return envSmtpConfig();
  }

  private async enqueueCampaignRecipients(
    campaignId: string,
    recipients: Array<{ id: string }>,
    locale: EmailLocale,
  ) {
    for (const recipient of recipients) {
      await this.queue.add(
        'send-email',
        { campaignId, recipientId: recipient.id, locale },
        {
          jobId: `email-recipient-${recipient.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      );
    }
  }

  isUsable(config: EffectiveSmtpConfig) {
    return Boolean(config.enabled && config.host && config.port && config.username && config.password && config.fromEmail && config.fromName && (config.port !== 465 || config.secure));
  }

  private async emailSettings(communityId: string) {
    const existing = await this.prisma.communityEmailSettings.findUnique({ where: { communityId } });
    if (existing) return existing;
    return this.prisma.communityEmailSettings.create({ data: { communityId } });
  }

  private isCompleteSettings(settings: { enabled: boolean; smtpHost: string | null; smtpPort: number | null; smtpUsername: string | null; smtpPasswordEncrypted: string | null; smtpSecure: boolean; fromEmail: string | null; fromName: string | null }) {
    return Boolean(settings.enabled && settings.smtpHost && settings.smtpPort && settings.smtpUsername && settings.smtpPasswordEncrypted && settings.fromEmail && settings.fromName && (settings.smtpPort !== 465 || settings.smtpSecure));
  }

  private latestDeliveryAttempt(communityId: string) {
    return this.prisma.emailDeliveryAttempt.findFirst({
      where: { campaign: { communityId } },
      orderBy: { attemptedAt: 'desc' },
      select: { status: true, errorMessage: true, attemptedAt: true },
    });
  }

  private activeMembers(communityId: string) {
    return this.prisma.membership.findMany({
      where: { communityId, status: 'ACTIVE' },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  private async renderGeneralEmail(communityId: string, subject: string, body: string, eyebrow?: string) {
    const community = await this.prisma.community.findUniqueOrThrow({ where: { id: communityId }, include: { settings: true } });
    const locale = emailLocale(community.settings?.defaultLanguage);
    return { ...renderBrandedEmail({ subject, title: subject, body, communityName: community.name, locale, align: 'left', eyebrow }), locale };
  }

  private warnTemplateFallback(
    key: string,
    requestedLocale: EmailLocale,
    resolved: { fallbackUsed: boolean; needsReview: boolean },
  ) {
    if (resolved.fallbackUsed || resolved.needsReview) {
      this.logger.warn(`Email template fallback/review required key=${key} locale=${requestedLocale}`);
    }
  }
}

export async function sendCampaignRecipient(prisma: PrismaClient, campaignId: string, recipientId: string, send: (input: { to: string; subject: string; text: string; html?: string | null; communityId: string }) => Promise<{ messageId?: string }>) {
  const recipient = await prisma.emailRecipient.findUnique({ where: { id: recipientId }, include: { campaign: true } });
  if (!recipient || recipient.campaignId !== campaignId) return;
  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } });
  try {
    const result = await send({ to: recipient.email, subject: recipient.campaign.subject, text: recipient.campaign.textBody, html: recipient.campaign.htmlBody, communityId: recipient.campaign.communityId });
    await prisma.emailRecipient.update({ where: { id: recipient.id }, data: { status: 'SENT', sentAt: new Date(), errorMessage: null } });
    await prisma.emailDeliveryAttempt.create({ data: { campaignId, recipientId, status: 'SENT', providerMessageId: result.messageId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed.';
    await prisma.emailRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED', errorMessage: message } });
    await prisma.emailDeliveryAttempt.create({ data: { campaignId, recipientId, status: 'FAILED', errorMessage: message } });
    throw error;
  } finally {
    await updateCampaignStatus(prisma, campaignId);
  }
}

type CampaignWithRecipients = Prisma.EmailCampaignGetPayload<{ include: { recipients: true; attempts: true } }>;

function campaignSummary(campaign: CampaignWithRecipients) {
  const recipients = campaign.recipients ?? [];
  const attempts = campaign.attempts ?? [];
  return {
    id: campaign.id,
    type: campaign.type,
    subject: campaign.subject,
    status: campaign.status,
    recipientCount: recipients.length,
    sentCount: recipients.filter((recipient) => recipient.status === 'SENT').length,
    failedCount: recipients.filter((recipient) => recipient.status === 'FAILED').length,
    pendingCount: recipients.filter((recipient) => recipient.status === 'PENDING' || recipient.status === 'QUEUED').length,
    canceledCount: recipients.filter((recipient) => recipient.status === 'CANCELED').length,
    createdAt: campaign.createdAt,
    sentAt: campaign.sentAt,
    lastAttemptAt: attempts[0]?.attemptedAt ?? null,
    lastErrorMessage: attempts.find((attempt) => attempt.status === 'FAILED')?.errorMessage ?? null,
    metadata: campaign.metadata,
    recipients,
    attempts,
  };
}

function dateFilter(from: Date | null, to: Date): Prisma.DateTimeFilter {
  return { ...(from ? { gte: from } : {}), lt: to };
}

function countStatuses(rows: Array<{ status: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return counts;
}

export async function updateCampaignStatus(prisma: PrismaClient, campaignId: string) {
  const recipients = await prisma.emailRecipient.findMany({ where: { campaignId } });
  const sent = recipients.filter((recipient) => recipient.status === 'SENT').length;
  const failed = recipients.filter((recipient) => recipient.status === 'FAILED').length;
  const pending = recipients.filter((recipient) => recipient.status === 'PENDING' || recipient.status === 'QUEUED').length;
  const canceled = recipients.filter((recipient) => recipient.status === 'CANCELED').length;
  const status = pending > 0 ? 'SENDING' : failed > 0 && sent > 0 ? 'PARTIAL' : failed > 0 ? 'FAILED' : canceled > 0 && sent > 0 ? 'PARTIAL' : canceled > 0 ? 'CANCELED' : 'SENT';
  await prisma.emailCampaign.update({ where: { id: campaignId }, data: { status, sentAt: pending === 0 ? new Date() : undefined } });
}

function envSmtpConfig(): EffectiveSmtpConfig {
  const port = Number(process.env.SMTP_PORT ?? '587');
  return {
    enabled: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM_EMAIL),
    host: process.env.SMTP_HOST,
    port: Number.isFinite(port) ? port : 587,
    username: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    secure: process.env.SMTP_SECURE === 'true',
    fromEmail: process.env.SMTP_FROM_EMAIL,
    fromName: process.env.SMTP_FROM_NAME,
    source: process.env.SMTP_HOST ? 'environment' : 'none',
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined;
}

function nullableString(value: unknown) {
  const string = stringValue(value);
  return string || null;
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(stringValue(value));
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
}

function publicWebUrl(pathname: string, query?: Record<string, string>) {
  const url = new URL(pathname, process.env.WEB_ORIGIN ?? `http://localhost:${process.env.WEB_PORT ?? 3000}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return url.toString();
}

function approvalOnlyTemplate(template: LocalizedEmailTemplate): LocalizedEmailTemplate {
  return {
    ...template,
    body: template.locale === 'fr'
      ? 'Votre inscription à {{communityName}} a été approuvée. Vous pouvez maintenant vous connecter.'
      : 'Your registration for {{communityName}} has been approved. You can now sign in.',
    buttonLabel: null,
    fallbackLinkInstructions: null,
    expirationNotice: null,
    securityNotice: null,
  };
}

function emailLocale(value?: string | null): EmailLocale {
  return value === 'fr' ? 'fr' : 'en';
}

function securityEventMetadata(value: Prisma.JsonValue | null) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function securityEventEmailCopy(eventType: string, locale: EmailLocale, metadata: Record<string, Prisma.JsonValue>) {
  const french = locale === 'fr';
  const passkeyName = typeof metadata.passkeyName === 'string' ? metadata.passkeyName.slice(0, 80) : french ? 'Clé d’accès' : 'Passkey';
  const attemptCount = typeof metadata.attemptCount === 'number' ? Math.max(0, Math.min(20, metadata.attemptCount)) : 0;
  const sourceLines = Array.isArray(metadata.sources)
    ? metadata.sources.slice(0, 5).flatMap((source) => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
      const ipAddress = typeof source.ipAddress === 'string' ? source.ipAddress.slice(0, 64) : 'Unknown';
      const countryName = typeof source.countryName === 'string' ? source.countryName.slice(0, 100) : 'Unknown';
      return [`${ipAddress} — ${countryName}`];
    })
    : [];
  const entries: Record<string, { en: string; fr: string; enBody: string; frBody: string }> = {
    LOGIN_NEW_SESSION: { en: 'New sign-in to your account', fr: 'Nouvelle connexion à votre compte', enBody: 'A new authenticated session was created for your PE Community account.', frBody: 'Une nouvelle session authentifiée a été créée pour votre compte PE Community.' },
    LOGIN_FAILED_ALERT: { en: 'Multiple unsuccessful sign-in attempts', fr: 'Plusieurs tentatives de connexion ont échoué', enBody: `We detected ${attemptCount} unsuccessful sign-in attempts within a short period.`, frBody: `Nous avons détecté ${attemptCount} tentatives de connexion infructueuses sur une courte période.` },
    PASSWORD_CHANGED: { en: 'Your password was changed', fr: 'Votre mot de passe a été modifié', enBody: 'The password for your PE Community account was changed.', frBody: 'Le mot de passe de votre compte PE Community a été modifié.' },
    EMAIL_CHANGED: { en: 'Your email address was changed', fr: 'Votre adresse courriel a été modifiée', enBody: 'The primary email address for your PE Community account was changed.', frBody: 'L’adresse courriel principale de votre compte PE Community a été modifiée.' },
    TOTP_ENABLED: { en: 'Two-factor authentication enabled', fr: 'Authentification à deux facteurs activée', enBody: 'Authenticator-based two-factor authentication was enabled.', frBody: 'L’authentification à deux facteurs par application d’authentification a été activée.' },
    TOTP_DISABLED: { en: 'Two-factor authentication disabled', fr: 'Authentification à deux facteurs désactivée', enBody: 'Authenticator-based two-factor authentication was disabled.', frBody: 'L’authentification à deux facteurs par application d’authentification a été désactivée.' },
    TOTP_REENROLLED: { en: 'Two-factor authentication reconfigured', fr: 'Authentification à deux facteurs reconfigurée', enBody: 'Authenticator-based two-factor authentication was reconfigured.', frBody: 'L’authentification à deux facteurs par application d’authentification a été reconfigurée.' },
    BACKUP_CODES_REGENERATED: { en: 'Backup codes regenerated', fr: 'Codes de secours régénérés', enBody: 'New two-factor backup codes were generated. No codes are included in this email.', frBody: 'De nouveaux codes de secours ont été générés. Aucun code ne figure dans ce courriel.' },
    PASSKEY_ADDED: { en: 'A new passkey was added', fr: 'Une nouvelle clé d’accès a été ajoutée', enBody: `Passkey: ${passkeyName}`, frBody: `Clé d’accès : ${passkeyName}` },
    PASSKEY_REMOVED: { en: 'A passkey was removed', fr: 'Une clé d’accès a été supprimée', enBody: `Passkey: ${passkeyName}`, frBody: `Clé d’accès : ${passkeyName}` },
    SESSION_REVOKED: { en: 'An active session was revoked', fr: 'Une session active a été révoquée', enBody: 'An active session was removed from your account.', frBody: 'Une session active a été supprimée de votre compte.' },
    OTHER_SESSIONS_REVOKED: { en: 'Other sessions were signed out', fr: 'Les autres sessions ont été déconnectées', enBody: 'All other active sessions were signed out.', frBody: 'Toutes les autres sessions actives ont été déconnectées.' },
    ACCOUNT_ROLE_CHANGED: { en: 'Your account role changed', fr: 'Le rôle de votre compte a changé', enBody: 'An administrator changed your community role.', frBody: 'Un administrateur a modifié votre rôle dans la communauté.' },
    ACCOUNT_STATUS_CHANGED: { en: 'Your account status changed', fr: 'Le statut de votre compte a changé', enBody: 'An administrator changed your membership status.', frBody: 'Un administrateur a modifié le statut de votre adhésion.' },
    ACCOUNT_PASSWORD_RESET: { en: 'Your password was reset by an administrator', fr: 'Votre mot de passe a été réinitialisé par un administrateur', enBody: 'An administrator reset your account password.', frBody: 'Un administrateur a réinitialisé le mot de passe de votre compte.' },
    ACCOUNT_TOTP_RESET: { en: 'Two-factor authentication was reset', fr: 'L’authentification à deux facteurs a été réinitialisée', enBody: 'An administrator reset your two-factor authentication state.', frBody: 'Un administrateur a réinitialisé votre authentification à deux facteurs.' },
  };
  const selected = entries[eventType] ?? { en: 'Account security activity', fr: 'Activité de sécurité du compte', enBody: 'A security-sensitive action occurred on your account.', frBody: 'Une action sensible liée à la sécurité a eu lieu sur votre compte.' };
  return {
    subject: french ? selected.fr : selected.en,
    title: french ? selected.fr : selected.en,
    body: [
      french ? selected.frBody : selected.enBody,
      ...(eventType === 'LOGIN_FAILED_ALERT' && sourceLines.length
        ? [french ? 'Sources récentes :' : 'Recent sources:', ...sourceLines]
        : []),
    ],
    guidance: french
      ? 'Si vous reconnaissez cette activité, aucune action n’est requise. Sinon, examinez vos sessions actives et sécurisez immédiatement votre compte.'
      : 'If you recognize this activity, no action is required. Otherwise, review your active sessions and secure your account immediately.',
  };
}

function maskEmailAddress(value: string) {
  const [local, domain] = value.trim().toLowerCase().split('@');
  return local && domain ? `${local.slice(0, 1)}***@${domain}` : '***';
}

function campaignLocale(metadata: Prisma.JsonValue | undefined): EmailLocale {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) && metadata.locale === 'fr' ? 'fr' : 'en';
}

function friendlySmtpError(message?: string | null) {
  const value = (message ?? '').toLowerCase();
  if (!value) return 'Recent delivery failed.';
  if (value.includes('auth') || value.includes('credential') || value.includes('login') || value.includes('535')) return 'Authentication failed.';
  if (value.includes('connect') || value.includes('timeout') || value.includes('econn')) return 'Connection failed.';
  if (value.includes('tls') || value.includes('ssl') || value.includes('certificate')) return 'TLS configuration issue.';
  return 'Recent delivery failed.';
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
