'use client';

import { ArrowLeft, Bell, CalendarClock, Copy, Download, ExternalLink, FileText, HelpCircle, Mail, Play, Save, ShieldCheck, SlidersHorizontal, Undo2, UserRound, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AdminProfileForm } from '../profile/admin-profile-form';
import { AppSelect } from '../../../components/app-select';
import { Card, LoadingButton, TableErrorState, TableSkeleton } from '../../../components/ui';
import { ChatGovernanceSettings } from '../../../components/chat-governance-settings';
import { TemplateTokenCollapsible } from '../../../components/template-token-collapsible';
import {
  AutomationNotificationTemplateWorkspace,
  type AutomationNotificationDetailMode,
  type AutomationNotificationPreview,
  type AutomationNotificationTemplate,
} from '../../../components/automation-notification-template-workspace';
import { apiFetch, apiUrl, COMMUNITY_ID, userFacingApiError } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { PERMISSIONS, hasPermission } from '../../../lib/permissions';
import { cn } from '../../../lib/utils';
import { SystemUpdatesSettings } from '../../../components/system-updates-settings';

type ReminderSettings = {
  birthdayReminderEnabled: boolean;
  birthdayReminderDaysBefore: number;
  birthdayDayNotificationEnabled: boolean;
  birthdayNotifyAllMembers: boolean;
  anniversaryReminderEnabled: boolean;
  anniversaryReminderDaysBefore: number;
  anniversaryDayNotificationEnabled: boolean;
  birthdayReminderTemplate: string;
  birthdayDayTemplate: string;
  anniversaryReminderTemplate: string;
  anniversaryDayTemplate: string;
  passportRemindersEnabled: boolean;
  passportNotifyMember: boolean;
  passportNotifyAdmins: boolean;
  passportEmailEnabled: boolean;
  passportFirstReminderDaysBefore: number;
  passportSecondReminderDaysBefore: number;
  passportFinalReminderDaysBefore: number;
  passportDayOfReminderEnabled: boolean;
  passportReminderTemplate: string;
  passportDayOfTemplate: string;
};

type CommunitySettings = {
  twoFactorEnabled: boolean;
};

type NotificationSettings = {
  adminInAppAlertsEnabled: boolean;
  emailDeliveryIssueAlertsEnabled: boolean;
  registrationReviewAlertsEnabled: boolean;
  passportExpirationAdminAlertsEnabled: boolean;
  reminderRunSummaryAlertsEnabled: boolean;
};

type GeneralSettings = {
  communityId: string;
  communityName: string;
  communitySlug: string;
  defaultLanguage: 'en' | 'fr';
  timezone: string;
  registrationApprovalMode: 'invite_link' | 'portal_registration';
  memberDirectoryVisibility: 'members_only' | 'hidden';
  supportContactEmail: string;
};

type EmailSettings = {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPasswordSet: boolean;
  smtpSecure: boolean;
  fromEmail: string;
  fromName: string;
  available: boolean;
  configured: boolean;
  deliveryIssue: boolean;
  lastErrorMessage?: string | null;
  source: string;
};

type RegistrationProtectionSettings = {
  enabled: boolean;
  mode: 'DISABLED' | 'ALWAYS';
  provider: 'DISABLED' | 'CLOUDFLARE_TURNSTILE' | 'GOOGLE_RECAPTCHA' | 'HCAPTCHA';
  variant: 'V2_CHECKBOX' | 'V3_SCORE' | null;
  siteKey: string;
  secretConfigured: boolean;
  hostname: string;
  action: string;
  minimumScore: number;
  ipLimit: number;
  ipWindowMinutes: number;
  notificationCooldownHours: number;
  globalEmailDailyLimit: number;
};

type InviteLinkSettings = {
  exists: boolean;
  id?: string;
  status?: 'active' | 'revoked' | 'expired';
  createdAt?: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
  useCount?: number;
  maxUses?: number | null;
  createdBy?: { name: string; email: string };
  inviteUrl?: string;
  emailQueued?: boolean;
};

type MessageTemplateChannel = 'notification' | 'email' | 'system';
type EmailTemplateLocale = 'en' | 'fr';
type EmailTemplateVariant = {
  locale: EmailTemplateLocale;
  subject: string;
  previewText: string | null;
  heading: string;
  greeting: string | null;
  body: string;
  buttonLabel: string | null;
  fallbackLinkInstructions: string | null;
  expirationNotice: string | null;
  securityNotice: string | null;
  footerExplanation: string | null;
  defaultContent: Record<string, string | null>;
  configured: boolean;
  needsReview: boolean;
  updatedAt: string | null;
};

type MessageTemplate = {
  key: string;
  channel: MessageTemplateChannel;
  displayName: string;
  description: string;
  subject?: string;
  body?: string;
  defaultBody?: string;
  variants?: Record<EmailTemplateLocale, EmailTemplateVariant>;
  variables: string[];
  requiredVariables: string[];
  isEditable: boolean;
  isSystem: boolean;
  updatedAt: string | null;
};

type MessageTemplateGroups = Record<MessageTemplateChannel, MessageTemplate[]>;

type TabKey = 'profile' | 'general' | 'security' | 'reminders' | 'templates' | 'notifications' | 'system-updates';
type CurrentUser = { role: string; permissions?: string[] };
type TemplateGroup = 'notifications' | 'email';

const timezoneOptions = getTimezoneOptions();
const templateChannels: MessageTemplateChannel[] = ['notification', 'email', 'system'];

export default function AdminSettingsPage() {
  const { t, applyCommunityDefaults, refreshCommunityDefaults } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [reminders, setReminders] = useState<ReminderSettings | null>(null);
  const [savedReminders, setSavedReminders] = useState<ReminderSettings | null>(null);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings | null>(null);
  const [savedGeneralSettings, setSavedGeneralSettings] = useState<GeneralSettings | null>(null);
  const [inviteLink, setInviteLink] = useState<InviteLinkSettings | null>(null);
  const [inviteRecipientEmail, setInviteRecipientEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [exportingUsers, setExportingUsers] = useState(false);
  const [communitySettings, setCommunitySettings] = useState<CommunitySettings | null>(null);
  const [savedCommunitySettings, setSavedCommunitySettings] = useState<CommunitySettings | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [savedNotificationSettings, setSavedNotificationSettings] = useState<NotificationSettings | null>(null);
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [savedEmailSettings, setSavedEmailSettings] = useState<EmailSettings | null>(null);
  const [smtpPassword, setSmtpPassword] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [registrationProtection, setRegistrationProtection] = useState<RegistrationProtectionSettings | null>(null);
  const [savedRegistrationProtection, setSavedRegistrationProtection] = useState<RegistrationProtectionSettings | null>(null);
  const [captchaSecret, setCaptchaSecret] = useState('');
  const [testingCaptcha, setTestingCaptcha] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplateGroups | null>(null);
  const [automationTemplates, setAutomationTemplates] = useState<AutomationNotificationTemplate[] | null>(null);
  const [automationTemplateEditor, setAutomationTemplateEditor] = useState<AutomationNotificationTemplate | null>(null);
  const [automationTemplateDraft, setAutomationTemplateDraft] = useState<AutomationNotificationTemplate | null>(null);
  const [automationTemplateMode, setAutomationTemplateMode] = useState<AutomationNotificationDetailMode>('view');
  const [automationTemplateLocale, setAutomationTemplateLocale] = useState<'en' | 'fr'>('en');
  const [automationTemplatePreview, setAutomationTemplatePreview] = useState<AutomationNotificationPreview | null>(null);
  const [automationTemplateBusy, setAutomationTemplateBusy] = useState('');
  const [automationTemplateError, setAutomationTemplateError] = useState('');
  const [activeTemplateGroup, setActiveTemplateGroup] = useState<TemplateGroup>('notifications');
  const [notificationTemplateMobileView, setNotificationTemplateMobileView] = useState<'table' | 'detail'>('table');
  const [templateChannel, setTemplateChannel] = useState<MessageTemplateChannel>('notification');
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [templateDraft, setTemplateDraft] = useState('');
  const [templateLocale, setTemplateLocale] = useState<EmailTemplateLocale>('en');
  const [emailTemplateDraft, setEmailTemplateDraft] = useState<EmailTemplateVariant | null>(null);
  const [emailTemplatePreviewHtml, setEmailTemplatePreviewHtml] = useState('');
  const [emailTemplateAction, setEmailTemplateAction] = useState('');
  const [templateError, setTemplateError] = useState('');

  const reminderDirty = useMemo(() => JSON.stringify(reminders) !== JSON.stringify(savedReminders), [reminders, savedReminders]);
  const generalDirty = useMemo(() => JSON.stringify(generalSettings) !== JSON.stringify(savedGeneralSettings), [generalSettings, savedGeneralSettings]);
  const supportEmailValid = useMemo(() => !generalSettings?.supportContactEmail.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(generalSettings.supportContactEmail.trim()), [generalSettings]);
  const securityDirty = useMemo(() => JSON.stringify(communitySettings) !== JSON.stringify(savedCommunitySettings), [communitySettings, savedCommunitySettings]);
  const notificationDirty = useMemo(() => JSON.stringify(notificationSettings) !== JSON.stringify(savedNotificationSettings), [notificationSettings, savedNotificationSettings]);
  const emailDirty = useMemo(() => JSON.stringify(emailSettings) !== JSON.stringify(savedEmailSettings) || Boolean(smtpPassword), [emailSettings, savedEmailSettings, smtpPassword]);
  const registrationProtectionDirty = useMemo(
    () => JSON.stringify(registrationProtection) !== JSON.stringify(savedRegistrationProtection) || Boolean(captchaSecret),
    [registrationProtection, savedRegistrationProtection, captchaSecret],
  );
  const selectedTemplate = useMemo(() => messageTemplates?.[templateChannel].find((template) => template.key === selectedTemplateKey) ?? messageTemplates?.[templateChannel][0] ?? null, [messageTemplates, selectedTemplateKey, templateChannel]);
  const selectedEmailVariant = selectedTemplate?.variants?.[templateLocale] ?? null;
  const templateDirty = Boolean(selectedTemplate && (selectedEmailVariant && emailTemplateDraft
    ? JSON.stringify(emailTemplateDraft) !== JSON.stringify(selectedEmailVariant)
    : templateDraft !== selectedTemplate.body));
  const templateMissingVariable = useMemo(() => {
    const content = emailTemplateDraft
      ? Object.values(emailTemplateDraft).filter((value) => typeof value === 'string').join('\n')
      : templateDraft;
    return selectedTemplate?.requiredVariables.find((variable) => !templateContainsVariable(content, variable)) ?? null;
  }, [selectedTemplate, emailTemplateDraft, templateDraft]);
  const automationTemplateDirty = Boolean(
    automationTemplateEditor
    && automationTemplateDraft
    && JSON.stringify(automationTemplateDraft) !== JSON.stringify(automationTemplateEditor),
  );
  const emailComplete = useMemo(() => {
    if (!emailSettings?.enabled) return true;
    return Boolean(emailSettings.smtpHost.trim() && emailSettings.smtpPort > 0 && emailSettings.smtpUsername.trim() && emailSettings.fromEmail.trim().includes('@') && emailSettings.fromName.trim() && (emailSettings.smtpPasswordSet || smtpPassword) && (emailSettings.smtpPort !== 465 || emailSettings.smtpSecure));
  }, [emailSettings, smtpPassword]);
  const canManageGeneral = hasPermission(currentUser, PERMISSIONS.settingsGeneralManage);
  const canManageSecurity = hasPermission(currentUser, PERMISSIONS.settingsSecurityManage);
  const canManageSmtp = hasPermission(currentUser, PERMISSIONS.settingsSmtpManage);
  const canManageReminders = hasPermission(currentUser, PERMISSIONS.settingsRemindersManage);
  const canManageTemplates = hasPermission(currentUser, PERMISSIONS.settingsTemplatesManage);
  const canManageNotifications = hasPermission(currentUser, PERMISSIONS.settingsNotificationsManage);
  const canViewSystemUpdates = currentUser?.role === 'owner' && hasPermission(currentUser, PERMISSIONS.systemUpdateView);
  const canManageChatGovernance = hasPermission(currentUser, PERMISSIONS.chatDeviceLimitManage)
    || hasPermission(currentUser, PERMISSIONS.chatDevicesView)
    || hasPermission(currentUser, PERMISSIONS.chatStorageView);
  async function load() {
    setError('');
    try {
      const user = await apiFetch<CurrentUser>('/auth/me');
      setCurrentUser(user);
      const [generalData, inviteData, reminderData, settingsData, emailData, registrationProtectionData, notificationData, templateData, automationTemplateData] = await Promise.all([
        hasPermission(user, PERMISSIONS.settingsGeneralManage)
          ? apiFetch<GeneralSettings>(`/admin/${COMMUNITY_ID}/settings/general`)
          : Promise.resolve(null),
        hasPermission(user, PERMISSIONS.settingsGeneralManage)
          ? apiFetch<InviteLinkSettings>(`/admin/${COMMUNITY_ID}/settings/invite-link`)
          : Promise.resolve(null),
        hasPermission(user, PERMISSIONS.settingsRemindersManage)
          ? apiFetch<ReminderSettings>(`/admin/${COMMUNITY_ID}/reminder-settings`)
          : Promise.resolve(null),
        hasPermission(user, PERMISSIONS.settingsSecurityManage)
          ? apiFetch<CommunitySettings>(`/admin/${COMMUNITY_ID}/settings`)
          : Promise.resolve(null),
        hasPermission(user, PERMISSIONS.settingsSmtpManage)
          ? apiFetch<EmailSettings>(`/admin/${COMMUNITY_ID}/settings/email`)
          : Promise.resolve(null),
        hasPermission(user, PERMISSIONS.settingsSecurityManage)
          ? apiFetch<RegistrationProtectionSettings>(`/admin/${COMMUNITY_ID}/settings/registration-protection`)
          : Promise.resolve(null),
        hasPermission(user, PERMISSIONS.settingsNotificationsManage)
          ? apiFetch<NotificationSettings>(`/admin/${COMMUNITY_ID}/settings/notifications`)
          : Promise.resolve(null),
        hasPermission(user, PERMISSIONS.settingsTemplatesManage)
          ? apiFetch<MessageTemplateGroups>(`/admin/${COMMUNITY_ID}/settings/templates`)
          : Promise.resolve(null),
        hasPermission(user, PERMISSIONS.settingsTemplatesManage)
          ? apiFetch<AutomationNotificationTemplate[]>(`/admin/${COMMUNITY_ID}/settings/notification-templates`)
          : Promise.resolve(null),
      ]);
      setGeneralSettings(generalData);
      setSavedGeneralSettings(generalData);
      setInviteLink(inviteData);
      setReminders(reminderData);
      setSavedReminders(reminderData);
      setCommunitySettings(settingsData);
      setSavedCommunitySettings(settingsData);
      setEmailSettings(emailData);
      setSavedEmailSettings(emailData);
      setRegistrationProtection(registrationProtectionData);
      setSavedRegistrationProtection(registrationProtectionData);
      setNotificationSettings(notificationData);
      setSavedNotificationSettings(notificationData);
      setMessageTemplates(templateData);
      setAutomationTemplates(automationTemplateData);
      setTestEmail(emailData?.fromEmail ?? '');
    } catch {
      setError(t.admin.settingsLoadFailed);
    }
  }

  useEffect(() => { load(); }, [t.admin.settingsLoadFailed]);

  useEffect(() => {
    if (!messageTemplates) return;
    const availableChannel = templateChannels.find((channel) => messageTemplates[channel].length > 0);
    if (!availableChannel) return;
    const channel = messageTemplates[templateChannel].length ? templateChannel : availableChannel;
    const template = messageTemplates[channel].find((item) => item.key === selectedTemplateKey) ?? messageTemplates[channel][0];
    if (channel !== templateChannel) setTemplateChannel(channel);
    if (template && template.key !== selectedTemplateKey) {
      setSelectedTemplateKey(template.key);
      setTemplateDraft(template.body ?? '');
      setEmailTemplateDraft(template.variants?.[templateLocale] ? { ...template.variants[templateLocale] } : null);
      setTemplateError('');
    }
  }, [messageTemplates, selectedTemplateKey, templateChannel, templateLocale]);

  useEffect(() => {
    if (selectedTemplate?.variants?.[templateLocale]) {
      setEmailTemplateDraft({ ...selectedTemplate.variants[templateLocale] });
      setEmailTemplatePreviewHtml('');
      setTemplateError('');
    }
  }, [selectedTemplate, templateLocale]);

  useEffect(() => {
    if (!automationTemplates?.length) {
      setAutomationTemplateEditor(null);
      setAutomationTemplateDraft(null);
      return;
    }
    if (automationTemplateEditor && automationTemplates.some((template) => template.id === automationTemplateEditor.id)) return;
    setAutomationTemplateEditor(automationTemplates[0]);
    setAutomationTemplateDraft({ ...automationTemplates[0] });
  }, [automationTemplates, automationTemplateEditor]);

  useEffect(() => {
    if (!automationTemplateDirty) return undefined;
    const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [automationTemplateDirty]);

  async function saveGeneral() {
    if (!generalSettings || saving || !supportEmailValid) return;
    setSaving(true);
    try {
      const updated = await apiFetch<GeneralSettings>(`/admin/${COMMUNITY_ID}/settings/general`, { method: 'PATCH', body: JSON.stringify(generalSettings) });
      setGeneralSettings(updated);
      setSavedGeneralSettings(updated);
      applyCommunityDefaults(updated);
      await refreshCommunityDefaults().catch(() => null);
      toast.success(t.admin.generalSettingsSaved);
    } catch {
      toast.error(t.admin.settingsSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function generateInviteLink() {
    if (inviteBusy) return;
    setInviteBusy(true);
    try {
      const generated = await apiFetch<InviteLinkSettings>(`/admin/${COMMUNITY_ID}/settings/invite-link`, { method: 'POST' });
      setInviteLink(generated);
      toast.success(t.admin.inviteLinkGenerated);
    } catch {
      toast.error(t.admin.settingsSaveFailed);
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInviteLink() {
    if (inviteBusy) return;
    setInviteBusy(true);
    try {
      setInviteLink(await apiFetch<InviteLinkSettings>(`/admin/${COMMUNITY_ID}/settings/invite-link/revoke`, { method: 'POST' }));
      toast.success(t.admin.inviteLinkRevoked);
    } catch {
      toast.error(t.admin.settingsSaveFailed);
    } finally {
      setInviteBusy(false);
    }
  }

  async function sendInviteEmail() {
    if (inviteBusy || !inviteRecipientEmail.trim()) return;
    setInviteBusy(true);
    try {
      const sent = await apiFetch<InviteLinkSettings>(`/admin/${COMMUNITY_ID}/settings/invite-link/send`, { method: 'POST', body: JSON.stringify({ recipientEmail: inviteRecipientEmail }) });
      setInviteLink(sent);
      setInviteRecipientEmail('');
      toast.success(t.admin.inviteSent);
    } catch {
      toast.error(t.admin.inviteEmailFailed);
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteLink?.inviteUrl) return;
    await navigator.clipboard?.writeText(inviteLink.inviteUrl);
    toast.success(t.admin.linkCopied);
  }

  async function exportUsersAudit() {
    if (exportingUsers || !canManageGeneral) return;
    setExportingUsers(true);
    try {
      const response = await fetch(apiUrl(`/admin/${COMMUNITY_ID}/settings/export/users`), { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      const csv = await response.text();
      const contentDisposition = response.headers.get('Content-Disposition') ?? '';
      const filename = contentDisposition.match(/filename="([^"]+)"/)?.[1] ?? `pe-community-users-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t.admin.userAuditExportReady);
    } catch {
      toast.error(t.admin.userAuditExportFailed);
    } finally {
      setExportingUsers(false);
    }
  }

  async function saveSecurity() {
    if (!communitySettings || saving) return;
    setSaving(true);
    try {
      const updated = await apiFetch<CommunitySettings>(`/admin/${COMMUNITY_ID}/settings`, { method: 'PATCH', body: JSON.stringify(communitySettings) });
      setCommunitySettings(updated);
      setSavedCommunitySettings(updated);
      toast.success(t.admin.settingsSaved);
    } catch {
      toast.error(t.admin.settingsSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function saveReminders() {
    if (!reminders || saving) return;
    setSaving(true);
    try {
      const updated = await apiFetch<ReminderSettings>(`/admin/${COMMUNITY_ID}/reminder-settings`, { method: 'PATCH', body: JSON.stringify(reminders) });
      setReminders(updated);
      setSavedReminders(updated);
      toast.success(t.admin.settingsSaved);
    } catch {
      toast.error(t.admin.settingsSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function saveEmailSettings() {
    if (!emailSettings || saving) return;
    setSaving(true);
    try {
      const updated = await apiFetch<EmailSettings>(`/admin/${COMMUNITY_ID}/settings/email`, { method: 'PATCH', body: JSON.stringify({ ...emailSettings, smtpPassword }) });
      setEmailSettings(updated);
      setSavedEmailSettings(updated);
      setSmtpPassword('');
      toast.success(t.admin.emailSettingsSaved);
    } catch {
      toast.error(t.admin.emailSettingsSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function saveRegistrationProtection() {
    if (!registrationProtection || saving) return;
    setSaving(true);
    try {
      const updated = await apiFetch<RegistrationProtectionSettings>(`/admin/${COMMUNITY_ID}/settings/registration-protection`, {
        method: 'PATCH',
        body: JSON.stringify({ ...registrationProtection, secret: captchaSecret }),
      });
      setRegistrationProtection(updated);
      setSavedRegistrationProtection(updated);
      setCaptchaSecret('');
      toast.success(t.admin.registrationProtectionSaved);
    } catch {
      toast.error(t.admin.registrationProtectionSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function testRegistrationProtection() {
    if (testingCaptcha || registrationProtectionDirty) return;
    setTestingCaptcha(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/settings/registration-protection/test`, { method: 'POST' });
      toast.success(t.admin.captchaConfigurationFieldsValid);
    } catch {
      toast.error(t.admin.captchaConfigurationInvalid);
    } finally {
      setTestingCaptcha(false);
    }
  }

  async function saveNotificationSettings() {
    if (!notificationSettings || saving || !canManageNotifications) return;
    setSaving(true);
    try {
      const updated = await apiFetch<NotificationSettings>(`/admin/${COMMUNITY_ID}/settings/notifications`, { method: 'PATCH', body: JSON.stringify(notificationSettings) });
      setNotificationSettings(updated);
      setSavedNotificationSettings(updated);
      toast.success(t.admin.notificationSettingsSaved);
    } catch {
      toast.error(t.admin.settingsSaveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplateBody(body = templateDraft, successMessage = t.admin.templateSaved) {
    if (!selectedTemplate || saving || !canManageTemplates) return;
    const validationError = emailTemplateDraft
      ? (!emailTemplateDraft.subject.trim() || !emailTemplateDraft.heading.trim() || !emailTemplateDraft.body.trim()
        ? t.admin.templateBodyRequired
        : templateMissingVariable ? t.admin.templateMustIncludeVariable(`{{${templateMissingVariable}}}`) : '')
      : templateValidationError(t, selectedTemplate, body);
    if (validationError) {
      setTemplateError(validationError);
      return;
    }
    setSaving(true);
    setTemplateError('');
    try {
      if (emailTemplateDraft && selectedTemplate.variants) {
        const updated = await apiFetch<EmailTemplateVariant>(`/admin/${COMMUNITY_ID}/settings/templates/${selectedTemplate.key}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...emailTemplateDraft, locale: templateLocale }),
        });
        setMessageTemplates((current) => replaceMessageTemplateVariant(current, selectedTemplate.key, updated));
        setEmailTemplateDraft(updated);
      } else {
        const updated = await apiFetch<MessageTemplate>(`/admin/${COMMUNITY_ID}/settings/templates/${selectedTemplate.key}`, { method: 'PATCH', body: JSON.stringify({ body }) });
        setMessageTemplates((current) => replaceMessageTemplate(current, updated));
        setSelectedTemplateKey(updated.key);
        setTemplateDraft(updated.body ?? '');
      }
      toast.success(successMessage);
    } catch (error) {
      const message = userFacingApiError(error, t.admin.couldNotSaveTemplate);
      setTemplateError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function resetTemplateBody() {
    if (!selectedTemplate) return;
    if (emailTemplateDraft && selectedEmailVariant) {
      setEmailTemplateDraft({ ...emailTemplateDraft, ...selectedEmailVariant.defaultContent });
      return;
    }
    saveTemplateBody(selectedTemplate.defaultBody ?? '', t.admin.templateReset);
  }

  async function previewEmailTemplate(sendTest = false) {
    if (!selectedTemplate || !emailTemplateDraft || emailTemplateAction) return;
    setEmailTemplateAction(sendTest ? 'test' : 'preview');
    try {
      const endpoint = sendTest ? 'test' : 'preview';
      const result = await apiFetch<{ html?: string }>(`/admin/${COMMUNITY_ID}/settings/templates/${selectedTemplate.key}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ ...emailTemplateDraft, locale: templateLocale }),
      });
      if (sendTest) toast.success(t.admin.testSentToYou);
      else setEmailTemplatePreviewHtml(result.html ?? '');
    } catch (error) {
      toast.error(userFacingApiError(error, sendTest ? t.admin.couldNotSendTest : t.admin.couldNotPreviewTemplate));
    } finally {
      setEmailTemplateAction('');
    }
  }

  function confirmAutomationTemplateDiscard() {
    return !automationTemplateDirty || window.confirm(t.admin.unsavedTemplateSwitch);
  }

  function selectAutomationTemplate(template: AutomationNotificationTemplate) {
    if (template.id === automationTemplateEditor?.id) {
      setNotificationTemplateMobileView('detail');
      return;
    }
    if (template.id !== automationTemplateEditor?.id && !confirmAutomationTemplateDiscard()) return;
    setAutomationTemplateEditor(template);
    setAutomationTemplateDraft({ ...template });
    setAutomationTemplateMode('view');
    setAutomationTemplatePreview(null);
    setAutomationTemplateError('');
    setNotificationTemplateMobileView('detail');
  }

  function selectTemplateGroup(group: TemplateGroup) {
    if (group === activeTemplateGroup) return;
    if (activeTemplateGroup === 'notifications' && !confirmAutomationTemplateDiscard()) return;
    if (activeTemplateGroup === 'email' && templateDirty && !window.confirm(t.admin.unsavedEmailTemplateSwitch)) return;
    if (group === 'email') {
      const nextTemplate = messageTemplates?.email[0];
      setTemplateChannel('email');
      setSelectedTemplateKey(nextTemplate?.key ?? '');
      setTemplateDraft(nextTemplate?.body ?? '');
      setEmailTemplateDraft(nextTemplate?.variants?.[templateLocale] ? { ...nextTemplate.variants[templateLocale] } : null);
      setTemplateError('');
    }
    setActiveTemplateGroup(group);
  }

  function discardAutomationTemplateChanges() {
    if (!automationTemplateEditor) return;
    setAutomationTemplateDraft({ ...automationTemplateEditor });
    setAutomationTemplatePreview(null);
    setAutomationTemplateMode('view');
    setAutomationTemplateError('');
  }

  function showNotificationTemplateList() {
    if (!confirmAutomationTemplateDiscard()) return;
    setAutomationTemplateMode('view');
    setNotificationTemplateMobileView('table');
  }

  async function saveAutomationTemplate() {
    if (!automationTemplateDraft || automationTemplateBusy || !canManageTemplates) return;
    setAutomationTemplateBusy('save');
    setAutomationTemplateError('');
    try {
      const updated = await apiFetch<AutomationNotificationTemplate>(`/admin/${COMMUNITY_ID}/settings/notification-templates/${automationTemplateDraft.id}`, { method: 'PATCH', body: JSON.stringify(automationTemplateDraft) });
      setAutomationTemplates((current) => current?.map((template) => template.id === updated.id ? updated : template) ?? current);
      setAutomationTemplateEditor(updated);
      setAutomationTemplateDraft({ ...updated });
      setAutomationTemplateMode('view');
      toast.success(t.admin.templateSaved);
    } catch {
      const message = t.admin.couldNotSaveTemplate;
      setAutomationTemplateError(message);
      toast.error(message);
    } finally {
      setAutomationTemplateBusy('');
    }
  }

  async function previewAutomationTemplate(template = automationTemplateDraft, locale = automationTemplateLocale) {
    if (!template || automationTemplateBusy) return;
    setAutomationTemplateBusy('preview');
    try {
      setAutomationTemplatePreview(await apiFetch<AutomationNotificationPreview>(`/admin/${COMMUNITY_ID}/settings/notification-templates/${template.id}/preview`, { method: 'POST', body: JSON.stringify({ locale }) }));
    } catch {
      toast.error(t.admin.couldNotSaveTemplate);
    } finally {
      setAutomationTemplateBusy('');
    }
  }

  function changeAutomationTemplateLocale(locale: 'en' | 'fr') {
    setAutomationTemplateLocale(locale);
    setAutomationTemplatePreview(null);
  }

  async function sendAutomationTemplateTest(template = automationTemplateDraft) {
    if (!template || automationTemplateBusy) return;
    setAutomationTemplateBusy('test');
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/settings/notification-templates/${template.id}/test`, { method: 'POST', body: JSON.stringify({ locale: automationTemplateLocale }) });
      toast.success(t.admin.testSentToYou);
    } catch {
      toast.error(t.admin.couldNotSendTest);
    } finally {
      setAutomationTemplateBusy('');
    }
  }

  async function sendTestEmail() {
    if (testingEmail || !testEmail.trim()) return;
    setTestingEmail(true);
    try {
      await apiFetch(`/admin/${COMMUNITY_ID}/settings/email/test`, { method: 'POST', body: JSON.stringify({ recipientEmail: testEmail }) });
      toast.success(t.admin.testEmailQueued);
    } catch {
      toast.error(t.admin.testEmailFailed);
    } finally {
      setTestingEmail(false);
    }
  }

  async function runDue() {
    if (running) return;
    setRunning(true);
    try {
      const result = await apiFetch<{ created: number; passportRemindersCreated: number; passportAdminAlertsCreated: number; reminderEmailsQueued: number }>(`/admin/${COMMUNITY_ID}/reminders/run-due`, { method: 'POST' });
      toast.success(t.admin.remindersRunDetailed(result.created, result.passportRemindersCreated, result.passportAdminAlertsCreated, result.reminderEmailsQueued));
    } catch {
      toast.error(t.admin.remindersRunFailed);
    } finally {
      setRunning(false);
    }
  }

  function updateReminder<K extends keyof ReminderSettings>(key: K, value: ReminderSettings[K]) {
    setReminders((current) => current ? { ...current, [key]: value } : current);
  }

  function updateNotification<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    setNotificationSettings((current) => current ? { ...current, [key]: value } : current);
  }

  const tabs = [
    ...(currentUser ? [{ key: 'profile' as const, label: t.nav.profile, description: t.admin.adminProfileSubtitle, icon: UserRound }] : []),
    ...(canManageGeneral ? [{ key: 'general' as const, label: t.admin.settingsGeneral, description: t.admin.settingsGeneralDescription, icon: SlidersHorizontal }] : []),
    ...(canManageSecurity || canManageSmtp || canManageChatGovernance ? [{ key: 'security' as const, label: t.admin.settingsSecurity, description: t.admin.settingsSecurityDescription, icon: ShieldCheck }] : []),
    ...(canManageReminders ? [{ key: 'reminders' as const, label: t.admin.settingsReminders, description: t.admin.reminderSettingsDescription, icon: CalendarClock }] : []),
    ...(canManageTemplates ? [{ key: 'templates' as const, label: t.admin.settingsTemplates, description: t.admin.settingsTemplatesDescription, icon: FileText }] : []),
    ...(canManageNotifications ? [{ key: 'notifications' as const, label: t.admin.settingsNotifications, description: t.admin.settingsNotificationsDescription, icon: Bell }] : []),
    ...(canViewSystemUpdates ? [{ key: 'system-updates' as const, label: t.systemUpdates.title, description: t.systemUpdates.description, icon: Wrench }] : []),
  ];
  const currentTab = tabs.find((tab) => tab.key === activeTab) ?? tabs[0] ?? null;

  useEffect(() => {
    if (!tabs.length) return;
    const pathSection = pathname.split('/').filter(Boolean).at(-1);
    const requestedSection = ((pathSection !== 'settings' ? pathSection : new URLSearchParams(window.location.search).get('section')) ?? null) as TabKey | null;
    const nextTab = requestedSection && tabs.some((tab) => tab.key === requestedSection) ? requestedSection : tabs[0].key;
    if (activeTab !== nextTab) setActiveTab(nextTab);
    if (requestedSection !== nextTab || pathname === '/admin/settings') router.replace(`/admin/settings/${nextTab}`, { scroll: false });
  }, [activeTab, pathname, router, tabs]);

  function chooseSection(section: TabKey) {
    setActiveTab(section);
    router.replace(`/admin/settings/${section}`, { scroll: false });
  }

  return (
    <div className="fixed inset-0 z-40 grid min-h-0 min-w-0 grid-cols-[248px_minmax(0,1fr)] overflow-hidden bg-[#020604] bg-[radial-gradient(circle_at_top_right,rgba(94,210,156,0.08),transparent_32rem)] text-white">
        {error ? (
          <div className="col-span-2 flex min-h-0 items-center justify-center overflow-y-auto px-4 py-6 sm:px-6 lg:p-8">
            <TableErrorState title={error} retryLabel={t.common.retry} onRetry={load} />
          </div>
        ) : !currentUser || (canManageGeneral && (!generalSettings || !inviteLink)) || (canManageReminders && !reminders) || (canManageSecurity && !communitySettings) || (canManageSmtp && !emailSettings) || (canManageNotifications && !notificationSettings) || (canManageTemplates && !messageTemplates) ? (
          <div className="col-span-2 min-h-0 overflow-y-auto px-4 py-6 sm:px-6 lg:p-8">
            <TableSkeleton rows={8} columns={3} />
          </div>
        ) : (
          <>
            <aside className="flex h-full max-h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-b border-white/[0.07] bg-[#03100b]/95 px-3 py-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:px-4 lg:w-[248px] lg:min-w-[248px] lg:max-w-[248px] lg:border-b-0 lg:border-r">
              <Link href="/admin" aria-label={t.admin.backToDashboard} className="group flex h-10 items-center gap-2 rounded-full border border-white/[0.06] px-3 text-sm font-medium text-white/80 transition-colors duration-200 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-accent/20">
                <span className="flex size-6 shrink-0 items-center justify-center text-white/70 transition group-hover:text-white">
                  <ArrowLeft size={16} />
                </span>
                <span className="min-w-0 truncate">{t.admin.settingsTitle}</span>
              </Link>
              <nav className="hidden space-y-1.5 lg:block" aria-label={t.admin.settingsSections}>
                {tabs.map(({ key, label, icon: Icon }) => {
                  const active = activeTab === key;
                  return (
                    <button key={key} type="button" aria-current={active ? 'page' : undefined} onClick={() => chooseSection(key)} className={cn('group flex h-10 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/20', active ? 'border-emerald-300/[0.16] bg-emerald-400/[0.13] text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'border-transparent text-white/62 hover:bg-white/[0.055] hover:text-white focus:border-white/12')}>
                      <Icon size={16} className="shrink-0" />
                      <span className="min-w-0 truncate">{label}</span>
                    </button>
                  );
                })}
              </nav>
              <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden" aria-label={t.admin.chooseSettingsSection}>
                {tabs.map(({ key, label, icon: Icon }) => {
                  const active = activeTab === key;
                  return (
                    <button key={key} type="button" aria-current={active ? 'page' : undefined} onClick={() => chooseSection(key)} className={cn('inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/20', active ? 'border-accent/25 bg-accent/15 text-accent' : 'border-white/10 bg-white/[0.035] text-white/62 hover:bg-white/[0.06] hover:text-white')}>
                      <Icon size={15} />
                      {label}
                    </button>
                  );
                })}
              </nav>
            </aside>
            <main className="h-full max-h-full min-h-0 min-w-0 overflow-hidden">
              <div className="h-full max-h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-5 md:px-8 lg:px-10 xl:px-12">
              <div className="mx-auto w-full max-w-[1120px] min-w-0 space-y-5 overflow-x-hidden">
                <header className="mb-5 flex flex-col gap-2 border-b border-white/[0.07] pb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300/80">{t.admin.operations}</p>
                  <h1 className="text-2xl font-semibold leading-tight tracking-[-0.04em] text-white md:text-[2rem]">{currentTab?.label ?? t.admin.settingsTitle}</h1>
                  <p className="max-w-2xl text-sm leading-6 text-white/52 md:text-[15px]">{currentTab?.description ?? t.admin.settingsSubtitle}</p>
                </header>
              {activeTab === 'profile' && (
                <AdminProfileForm />
              )}

              {activeTab === 'general' && generalSettings && (
                <div className="w-full min-w-0 max-w-full space-y-5 overflow-x-hidden">
                  <SettingsPanel title={t.admin.communityIdentity} description={t.admin.communityIdentityDescription}>
                    <SettingRow title={t.admin.communitySlug} description={t.admin.communitySlugDescription} compact>
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 font-mono text-xs text-white/70">{generalSettings.communitySlug}</span>
                    </SettingRow>
                    <SettingRow title={t.admin.defaultLanguage} description={t.admin.defaultLanguageDescription} compact>
                      <SelectField
                        label={t.admin.defaultLanguage}
                        value={generalSettings.defaultLanguage}
                        options={[
                          { value: 'en', label: t.admin.languageEnglish },
                          { value: 'fr', label: t.admin.languageFrench },
                        ]}
                        onChange={(value) => setGeneralSettings({ ...generalSettings, defaultLanguage: value as GeneralSettings['defaultLanguage'] })}
                      />
                    </SettingRow>
                    <SettingRow title={t.admin.timezone} description={t.admin.timezoneDescription} compact>
                      <SelectField
                        label={t.admin.timezone}
                        value={generalSettings.timezone}
                        options={timezoneOptions.map((value) => ({ value, label: value }))}
                        onChange={(value) => setGeneralSettings({ ...generalSettings, timezone: value })}
                      />
                    </SettingRow>
                  </SettingsPanel>

                  <SettingsPanel title={t.admin.memberAccess} description={t.admin.memberAccessDescription}>
                    <SettingRow title={<LabelWithHelp label={t.admin.registrationEntryMethod} help={generalSettings.registrationApprovalMode === 'invite_link' ? t.admin.registrationInviteLinkHelp : t.admin.registrationPortalHelp} ariaLabel={t.admin.registrationEntryMethodHelp} />} description={t.admin.registrationEntryMethodDescription} compact>
                      <SelectField
                        label={t.admin.registrationEntryMethod}
                        value={generalSettings.registrationApprovalMode}
                        options={[
                          { value: 'invite_link', label: t.admin.adminOwnerInviteLink },
                          { value: 'portal_registration', label: t.admin.portalRegistration },
                        ]}
                        onChange={(value) => setGeneralSettings({ ...generalSettings, registrationApprovalMode: value as GeneralSettings['registrationApprovalMode'] })}
                      />
                    </SettingRow>
                    {generalSettings.registrationApprovalMode === 'invite_link' && inviteLink && (
                      <InviteLinkCard
                        t={t}
                        inviteLink={inviteLink}
                        emailAvailable={Boolean(emailSettings?.available)}
                        recipientEmail={inviteRecipientEmail}
                        busy={inviteBusy}
                        onRecipientEmailChange={setInviteRecipientEmail}
                        onGenerate={generateInviteLink}
                        onRevoke={revokeInviteLink}
                        onCopy={copyInviteLink}
                        onSend={sendInviteEmail}
                      />
                    )}
                    <SettingRow title={t.admin.memberDirectoryVisibility} description={t.admin.memberDirectoryVisibilityDescription} compact>
                    <SelectField
                      label={t.admin.memberDirectoryVisibility}
                      value={generalSettings.memberDirectoryVisibility}
                      options={[
                        { value: 'members_only', label: t.admin.membersOnly },
                        { value: 'hidden', label: t.admin.hidden },
                      ]}
                      onChange={(value) => setGeneralSettings({ ...generalSettings, memberDirectoryVisibility: value as GeneralSettings['memberDirectoryVisibility'] })}
                    />
                    </SettingRow>
                  </SettingsPanel>

                  <SettingsPanel title={t.admin.supportContact} description={t.admin.supportContactDescription}>
                    <SettingRow title={t.admin.supportContactEmail} description={t.admin.supportContactEmailDescription} compact>
                    <TextField
                      label={t.admin.supportContactEmail}
                      type="email"
                      value={generalSettings.supportContactEmail}
                      onChange={(value) => setGeneralSettings({ ...generalSettings, supportContactEmail: value })}
                    />
                    </SettingRow>
                    {!supportEmailValid && <p className="text-sm text-rose-100/80">{t.admin.invalidEmailAddress}</p>}
                    {!canManageGeneral && <p className="text-sm text-amber-100/80">{t.admin.generalSettingsPermissionDenied}</p>}
                  </SettingsPanel>

                  <SettingsPanel title={t.admin.auditExport} description={t.admin.auditExportDescription}>
                    <div className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-white/[0.075] bg-black/[0.14] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{t.admin.downloadPublicUserAuditList}</p>
                        <p className="mt-1 text-sm leading-6 text-white/45">{t.admin.userAuditExportFields}</p>
                      </div>
                      <LoadingButton loading={exportingUsers} loadingLabel={t.admin.exportingCsv} disabled={!canManageGeneral || exportingUsers} onClick={exportUsersAudit} className="shrink-0 bg-white/10 text-white hover:bg-white/15">
                        <Download size={16} />
                        {t.admin.exportUserList}
                      </LoadingButton>
                    </div>
                  </SettingsPanel>
                  <div className="flex w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border border-white/[0.075] bg-white/[0.03] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-sm text-white/42">{generalDirty ? t.admin.unsavedGeneralChanges : t.admin.noChangesToSave}</p>
                    <Actions dirty={generalDirty} saving={saving} disabled={!supportEmailValid || !canManageGeneral} saveLabel={t.common.saveChanges} discardLabel={t.admin.discardChanges} onSave={saveGeneral} onDiscard={() => setGeneralSettings(savedGeneralSettings)} />
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <>
                  {canManageSecurity && communitySettings && (
                  <SettingsPanel title={t.admin.settingsSecurity} description={t.admin.settingsSecurityDescription}>
                    <SettingRow title={t.security.requireTwoFactorAuthentication} description={t.security.requireTwoFactorDescription}>
                      <Toggle checked={communitySettings.twoFactorEnabled} onChange={(value) => setCommunitySettings({ ...communitySettings, twoFactorEnabled: value })} />
                    </SettingRow>
                    <Actions dirty={securityDirty} saving={saving} saveLabel={t.common.save} discardLabel={t.admin.discardChanges} onSave={saveSecurity} onDiscard={() => setCommunitySettings(savedCommunitySettings)} />
                  </SettingsPanel>
                  )}
                  {canManageSmtp && emailSettings && (
                  <SettingsPanel title={t.admin.smtpEmailDelivery} description={t.admin.smtpEmailDeliveryDescription}>
                    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/15 p-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 rounded-lg border border-accent/20 bg-accent/10 p-2 text-accent"><Mail size={17} /></span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-white">{t.admin.smtpEmailDelivery}</p>
                            <StatusPill tone={emailStatusTone(emailSettings)}>{emailStatusLabel(t, emailSettings)}</StatusPill>
                          </div>
                          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/45">{emailSettings.enabled ? t.admin.smtpConfigurationDescription : t.admin.emailDeliveryDisabledDescription}</p>
                          {emailSettings.deliveryIssue && <p className="mt-1 text-xs text-rose-200/80">{emailSettings.lastErrorMessage ?? t.admin.recentDeliveryFailed} <Link href="/admin/emails" className="font-semibold text-rose-100 underline-offset-4 hover:underline">{t.admin.viewDeliveryActivity}</Link></p>}
                        </div>
                      </div>
                      <Toggle checked={emailSettings.enabled} onChange={(value) => setEmailSettings({ ...emailSettings, enabled: value })} />
                    </div>

                    {!emailSettings.enabled ? (
                      <div className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-white/50">{t.admin.emailDeliveryEnableHelp}</div>
                    ) : (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="w-full min-w-0 rounded-xl border border-white/[0.075] bg-white/[0.035] p-4 md:col-span-2 sm:p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-start gap-4">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-400/10 text-emerald-200">
                                  <ShieldCheck size={19} />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-white">{t.admin.smtpSecure}</p>
                                  <p className="mt-1 max-w-2xl text-sm leading-6 text-white/50">{t.admin.smtpSecureDescription}</p>
                                </div>
                              </div>
                              <div className="shrink-0 sm:pl-6">
                                <Toggle ariaLabel={t.admin.smtpSecure} checked={emailSettings.smtpSecure} onChange={(value) => setEmailSettings({ ...emailSettings, smtpSecure: value })} />
                              </div>
                            </div>
                          </div>
                          <EmailField label={t.admin.smtpHost} value={emailSettings.smtpHost} onChange={(value) => setEmailSettings({ ...emailSettings, smtpHost: value })} />
                          <EmailField label={t.admin.smtpPort} value={String(emailSettings.smtpPort ?? '')} onChange={(value) => setEmailSettings({ ...emailSettings, smtpPort: Number(value) || 587 })} />
                          <EmailField label={t.admin.smtpUsername} value={emailSettings.smtpUsername} onChange={(value) => setEmailSettings({ ...emailSettings, smtpUsername: value })} />
                          <EmailField label={emailSettings.smtpPasswordSet ? t.admin.smtpPasswordConfigured : t.admin.smtpPassword} type="password" value={smtpPassword} placeholder={emailSettings.smtpPasswordSet ? t.admin.leaveBlankToKeepPassword : ''} onChange={setSmtpPassword} />
                          <EmailField label={t.admin.fromEmail} value={emailSettings.fromEmail} onChange={(value) => setEmailSettings({ ...emailSettings, fromEmail: value })} />
                          <EmailField label={t.admin.fromName} value={emailSettings.fromName} onChange={(value) => setEmailSettings({ ...emailSettings, fromName: value })} />
                        </div>
                        <details className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
                          <summary className="cursor-pointer text-sm font-semibold text-white/75">{t.admin.providerSetupTips}</summary>
                          <div className="mt-3 space-y-2 text-sm leading-6 text-white/50">
                            <p>{t.admin.smtpNeutralProviderHelp}</p>
                            <p>{t.admin.smtpPasswordProviderHelp}</p>
                            <p>{t.admin.smtpProviderSettingsHelp}</p>
                            <p>{t.admin.smtpGmailExampleHelp}</p>
                          </div>
                        </details>
                        {!emailComplete && <p className="text-sm text-amber-100/80">{t.admin.smtpNeedsConfigurationHelp}</p>}
                        <div className="flex flex-wrap items-end gap-3 border-t border-white/10 pt-4">
                          <label className="min-w-[16rem] flex-1">
                            <span className="text-sm font-medium text-white/72">{t.admin.testEmailRecipient}</span>
                            <input value={testEmail} onChange={(event) => setTestEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-accent/60" />
                          </label>
                          <LoadingButton loading={testingEmail} loadingLabel={t.admin.sendingTestEmail} disabled={testingEmail || emailDirty || !emailSettings.available || !testEmail.trim()} onClick={sendTestEmail} className="bg-white/10 text-white hover:bg-white/15">{t.admin.sendTestEmail}</LoadingButton>
                        </div>
                        {!emailSettings.available && <p className="text-sm text-amber-100/80">{t.admin.smtpUnavailable}</p>}
                      </>
                    )}

                    <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <Link href="/admin/emails" className="inline-flex items-center gap-2 text-sm font-semibold text-accent transition hover:text-[#74e4b1]"><ExternalLink size={16} />{t.admin.viewEmailDashboard}</Link>
                      <Actions dirty={emailDirty} saving={saving} disabled={!emailComplete} saveLabel={t.admin.saveEmailSettings} discardLabel={t.admin.discardChanges} onSave={saveEmailSettings} onDiscard={() => { setEmailSettings(savedEmailSettings); setSmtpPassword(''); }} />
                    </div>
                  </SettingsPanel>
                  )}
                  {canManageSecurity && registrationProtection && (
                    <SettingsPanel title={t.admin.registrationProtection} description={t.admin.registrationProtectionDescription}>
                      <SettingRow title={t.admin.registrationProtectionEnabled} description={t.admin.registrationProtectionEnabledDescription}>
                        <Toggle ariaLabel={t.admin.registrationProtectionEnabled} checked={registrationProtection.enabled} onChange={(enabled) => setRegistrationProtection({ ...registrationProtection, enabled, mode: enabled ? 'ALWAYS' : 'DISABLED' })} />
                      </SettingRow>
                      <div className="grid gap-3 md:grid-cols-2">
                        <AppSelect
                          value={registrationProtection.mode}
                          label={t.admin.captchaEnforcementMode}
                          options={[
                            { value: 'DISABLED' as const, label: t.admin.captchaDisabled },
                            { value: 'ALWAYS' as const, label: t.admin.captchaAlways },
                          ]}
                          onChange={(mode) => setRegistrationProtection({ ...registrationProtection, mode, enabled: mode !== 'DISABLED' })}
                          dense
                          className="w-full"
                        />
                        <AppSelect
                          value={registrationProtection.provider}
                          label={t.admin.captchaProvider}
                          options={[
                            { value: 'DISABLED' as const, label: t.admin.captchaDisabled },
                            { value: 'CLOUDFLARE_TURNSTILE' as const, label: 'Cloudflare Turnstile' },
                            { value: 'GOOGLE_RECAPTCHA' as const, label: 'Google reCAPTCHA' },
                            { value: 'HCAPTCHA' as const, label: 'hCaptcha' },
                          ]}
                          onChange={(provider) => setRegistrationProtection({ ...registrationProtection, provider })}
                          dense
                          className="w-full"
                        />
                        {registrationProtection.provider === 'GOOGLE_RECAPTCHA' && (
                          <AppSelect
                            value={registrationProtection.variant ?? 'V2_CHECKBOX'}
                            label={t.admin.captchaVariant}
                            options={[
                              { value: 'V2_CHECKBOX' as const, label: 'reCAPTCHA v2 checkbox' },
                              { value: 'V3_SCORE' as const, label: 'reCAPTCHA v3 score' },
                            ]}
                            onChange={(variant) => setRegistrationProtection({ ...registrationProtection, variant })}
                            dense
                            className="w-full"
                          />
                        )}
                        <EmailField label={t.admin.captchaSiteKey} value={registrationProtection.siteKey} onChange={(siteKey) => setRegistrationProtection({ ...registrationProtection, siteKey })} />
                        <EmailField label={registrationProtection.secretConfigured ? t.admin.captchaSecretConfigured : t.admin.captchaSecret} type="password" value={captchaSecret} placeholder={registrationProtection.secretConfigured ? t.admin.leaveBlankToKeepPassword : ''} onChange={setCaptchaSecret} />
                        <EmailField label={t.admin.captchaAllowedHostname} value={registrationProtection.hostname} onChange={(hostname) => setRegistrationProtection({ ...registrationProtection, hostname })} />
                        <EmailField label={t.admin.captchaExpectedAction} value={registrationProtection.action} onChange={(action) => setRegistrationProtection({ ...registrationProtection, action })} />
                        {registrationProtection.provider === 'GOOGLE_RECAPTCHA' && registrationProtection.variant === 'V3_SCORE' && (
                          <EmailField label={t.admin.captchaMinimumScore} value={String(registrationProtection.minimumScore)} onChange={(minimumScore) => setRegistrationProtection({ ...registrationProtection, minimumScore: Number(minimumScore) })} />
                        )}
                        <EmailField label={t.admin.registrationIpLimit} value={String(registrationProtection.ipLimit)} onChange={(ipLimit) => setRegistrationProtection({ ...registrationProtection, ipLimit: Number(ipLimit) })} />
                        <EmailField label={t.admin.registrationIpWindow} value={String(registrationProtection.ipWindowMinutes)} onChange={(ipWindowMinutes) => setRegistrationProtection({ ...registrationProtection, ipWindowMinutes: Number(ipWindowMinutes) })} />
                        <EmailField label={t.admin.registrationNotificationCooldown} value={String(registrationProtection.notificationCooldownHours)} onChange={(notificationCooldownHours) => setRegistrationProtection({ ...registrationProtection, notificationCooldownHours: Number(notificationCooldownHours) })} />
                        <EmailField label={t.admin.registrationDailyEmailLimit} value={String(registrationProtection.globalEmailDailyLimit)} onChange={(globalEmailDailyLimit) => setRegistrationProtection({ ...registrationProtection, globalEmailDailyLimit: Number(globalEmailDailyLimit) })} />
                      </div>
                      <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <LoadingButton loading={testingCaptcha} loadingLabel={t.admin.testingCaptchaConfiguration} disabled={testingCaptcha || registrationProtectionDirty} onClick={testRegistrationProtection} className="bg-white/10 text-white hover:bg-white/15">{t.admin.testCaptchaConfiguration}</LoadingButton>
                        <Actions dirty={registrationProtectionDirty} saving={saving} saveLabel={t.common.saveChanges} discardLabel={t.admin.discardChanges} onSave={saveRegistrationProtection} onDiscard={() => { setRegistrationProtection(savedRegistrationProtection); setCaptchaSecret(''); }} />
                      </div>
                    </SettingsPanel>
                  )}
                  {canManageSecurity && (
                    <SettingsPanel title={t.admin.twoFactorReset} description={t.admin.twoFactorResetDescription}>
                      <div className="flex w-full min-w-0 flex-col gap-3 rounded-xl border border-white/[0.075] bg-black/[0.14] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="max-w-2xl text-sm leading-6 text-white/50">{t.admin.twoFactorResetMembersHelp}</p>
                        <Link href="/admin/members" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-4 text-sm font-semibold text-white/78 transition-colors duration-200 hover:bg-white/[0.075] hover:text-white">
                          <ExternalLink size={16} />
                          {t.admin.openMembers}
                        </Link>
                      </div>
                    </SettingsPanel>
                  )}
                  {currentUser && (
                    hasPermission(currentUser, PERMISSIONS.chatDeviceLimitManage) ||
                    hasPermission(currentUser, PERMISSIONS.chatDevicesView) ||
                    hasPermission(currentUser, PERMISSIONS.chatStorageView)
                  ) && (
                    <SettingsPanel title={t.admin.chatGovernance} description={t.admin.chatGovernanceDescription}>
                      <ChatGovernanceSettings user={currentUser} />
                    </SettingsPanel>
                  )}
                </>
              )}

              {activeTab === 'reminders' && reminders && (
                <SettingsPanel title={t.admin.settingsReminders} description={t.admin.reminderSettingsDescription}>
                  <IntroPanel title={t.admin.reminderLogicTitle} description={t.admin.reminderLogicDescription} />
                  <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-4 overflow-x-hidden xl:grid-cols-2">
                    <ReminderCard icon={<CalendarClock size={18} />} title={t.admin.birthdayReminderCardTitle} description={t.admin.birthdayReminderCardDescription}>
                      <ReminderSettingRow title={t.admin.birthdayReminders} description={t.admin.birthdayRemindersDescription}>
                        <Toggle checked={reminders.birthdayReminderEnabled} onChange={(value) => updateReminder('birthdayReminderEnabled', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.birthdayDayNotifications} description={t.admin.birthdayDayNotificationsDescription}>
                        <Toggle checked={reminders.birthdayDayNotificationEnabled} onChange={(value) => updateReminder('birthdayDayNotificationEnabled', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.daysBeforeBirthday} description={t.admin.daysBeforeBirthdayDescription}>
                        <NumberField value={reminders.birthdayReminderDaysBefore} onChange={(value) => updateReminder('birthdayReminderDaysBefore', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.birthdayNotifyAllMembers} description={t.admin.birthdayNotifyAllMembersDescription}>
                        <Toggle checked={reminders.birthdayNotifyAllMembers} onChange={(value) => updateReminder('birthdayNotifyAllMembers', value)} />
                      </ReminderSettingRow>
                    </ReminderCard>
                    <ReminderCard icon={<CalendarClock size={18} />} title={t.admin.anniversaryReminderCardTitle} description={t.admin.anniversaryReminderCardDescription}>
                      <ReminderSettingRow title={t.admin.anniversaryReminders} description={t.admin.anniversaryRemindersDescription}>
                        <Toggle checked={reminders.anniversaryReminderEnabled} onChange={(value) => updateReminder('anniversaryReminderEnabled', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.anniversaryDayNotifications} description={t.admin.anniversaryDayNotificationsDescription}>
                        <Toggle checked={reminders.anniversaryDayNotificationEnabled} onChange={(value) => updateReminder('anniversaryDayNotificationEnabled', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.daysBeforeAnniversary} description={t.admin.daysBeforeAnniversaryDescription}>
                        <NumberField value={reminders.anniversaryReminderDaysBefore} onChange={(value) => updateReminder('anniversaryReminderDaysBefore', value)} />
                      </ReminderSettingRow>
                    </ReminderCard>
                    <ReminderCard className="xl:col-span-2" icon={<CalendarClock size={18} />} title={t.admin.passportExpirationReminders} description={t.admin.passportExpirationRemindersDescription}>
                      <div className="grid w-full min-w-0 max-w-full gap-x-6 overflow-hidden xl:grid-cols-2">
                      <ReminderSettingRow title={t.admin.enablePassportReminders} description={t.admin.enablePassportRemindersDescription}>
                        <Toggle checked={reminders.passportRemindersEnabled} onChange={(value) => updateReminder('passportRemindersEnabled', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.notifyMember} description={t.admin.notifyMemberDescription}>
                        <Toggle checked={reminders.passportNotifyMember} onChange={(value) => updateReminder('passportNotifyMember', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.notifyAdmins} description={t.admin.notifyAdminsDescription}>
                        <Toggle checked={reminders.passportNotifyAdmins} onChange={(value) => updateReminder('passportNotifyAdmins', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.emailReminders} description={emailSettings?.available ? t.admin.emailRemindersDescription : t.admin.smtpUnavailable}>
                        <Toggle checked={reminders.passportEmailEnabled} onChange={(value) => updateReminder('passportEmailEnabled', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.firstNotice} description={t.admin.daysBeforeExpiration}>
                        <NumberField value={reminders.passportFirstReminderDaysBefore} onChange={(value) => updateReminder('passportFirstReminderDaysBefore', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.secondNotice} description={t.admin.daysBeforeExpiration}>
                        <NumberField value={reminders.passportSecondReminderDaysBefore} onChange={(value) => updateReminder('passportSecondReminderDaysBefore', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.finalNotice} description={t.admin.daysBeforeExpiration}>
                        <NumberField value={reminders.passportFinalReminderDaysBefore} onChange={(value) => updateReminder('passportFinalReminderDaysBefore', value)} />
                      </ReminderSettingRow>
                      <ReminderSettingRow title={t.admin.passportDayOfReminder} description={t.admin.passportDayOfReminderDescription}>
                        <Toggle checked={reminders.passportDayOfReminderEnabled} onChange={(value) => updateReminder('passportDayOfReminderEnabled', value)} />
                      </ReminderSettingRow>
                      </div>
                    </ReminderCard>
                  </div>
                  <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 text-white/45"><Wrench size={17} /></span>
                        <div>
                          <p className="text-sm font-semibold text-white">{t.admin.adminMaintenance}</p>
                          <p className="mt-1 text-sm leading-6 text-white/45">{t.admin.runDueRemindersDescription}</p>
                        </div>
                      </div>
                      <LoadingButton loading={running} loadingLabel={t.admin.runningReminders} onClick={runDue} className="bg-white/10 text-white hover:bg-white/15"><Play size={16} />{t.admin.runDueReminders}</LoadingButton>
                    </div>
                  </div>
                  <div className="flex w-full min-w-0 max-w-full justify-end overflow-hidden">
                    <Actions dirty={reminderDirty} saving={saving} saveLabel={t.common.save} discardLabel={t.admin.discardChanges} onSave={saveReminders} onDiscard={() => setReminders(savedReminders)} />
                  </div>
                </SettingsPanel>
              )}

              {activeTab === 'templates' && messageTemplates && (
                <div className="space-y-5">
                  <div role="tablist" aria-label={t.admin.templateCategories} className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-white/[0.08] bg-black/[0.16] p-1">
                    {([
                      { key: 'notifications' as const, label: t.admin.automationNotificationTemplates, count: automationTemplates?.length ?? 0 },
                      { key: 'email' as const, label: t.admin.emailTemplates, count: messageTemplates.email.length },
                    ]).map((group) => {
                      const active = activeTemplateGroup === group.key;
                      return (
                        <button key={group.key} type="button" role="tab" aria-selected={active} onClick={() => selectTemplateGroup(group.key)} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40', active ? 'border-emerald-300/20 bg-emerald-400/15 text-emerald-100 shadow-sm shadow-emerald-950/20' : 'border-transparent text-white/60 hover:bg-white/[0.06] hover:text-white')}>
                          {group.label}
                          <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums', active ? 'bg-emerald-200 text-emerald-950' : 'bg-white/10 text-white/65')}>{group.count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {activeTemplateGroup === 'notifications' && (
                    <AutomationNotificationTemplateWorkspace
                      templates={automationTemplates ?? []}
                      selectedTemplate={automationTemplateEditor}
                      draft={automationTemplateDraft}
                      locale={automationTemplateLocale}
                      mode={automationTemplateMode}
                      mobileView={notificationTemplateMobileView}
                      dirty={automationTemplateDirty}
                      busy={automationTemplateBusy}
                      error={automationTemplateError}
                      preview={automationTemplatePreview}
                      canManage={canManageTemplates}
                      onSelect={selectAutomationTemplate}
                      onLocaleChange={changeAutomationTemplateLocale}
                      onModeChange={setAutomationTemplateMode}
                      onMobileBack={showNotificationTemplateList}
                      onDraftChange={setAutomationTemplateDraft}
                      onPreview={() => void previewAutomationTemplate()}
                      onSendTest={() => void sendAutomationTemplateTest()}
                      onDiscard={discardAutomationTemplateChanges}
                      onSave={() => void saveAutomationTemplate()}
                    />
                  )}

                {activeTemplateGroup === 'email' && <Card className="min-w-0 max-w-full overflow-hidden rounded-[1.35rem] border-white/[0.075] bg-white/[0.035] p-0 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
                  <div className="border-b border-white/[0.06] px-5 py-4">
                    <div role="tablist" aria-label={t.admin.templateCategories} className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/[0.16] p-1">
                      {templateChannels.filter((channel) => channel !== 'system' || messageTemplates[channel].length > 0).map((channel) => {
                        const count = messageTemplates[channel].length;
                        const active = templateChannel === channel;
                        return (
                          <button key={channel} type="button" role="tab" aria-selected={active} disabled={!count} onClick={() => {
                            const nextTemplate = messageTemplates[channel][0];
                            setTemplateChannel(channel);
                            setSelectedTemplateKey(nextTemplate?.key ?? '');
                            setTemplateDraft(nextTemplate?.body ?? '');
                            setEmailTemplateDraft(nextTemplate?.variants?.[templateLocale] ? { ...nextTemplate.variants[templateLocale] } : null);
                            setTemplateError('');
                          }} className={cn('inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40', active ? 'border-emerald-300/20 bg-emerald-400/15 text-emerald-100 shadow-sm shadow-emerald-950/20' : 'border-white/[0.08] bg-white/[0.04] text-white/62 hover:border-white/15 hover:bg-white/[0.07] hover:text-white', !count && 'cursor-not-allowed opacity-45 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-white/62')}>
                            {templateChannelLabel(t, channel)}
                            <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums', active ? 'bg-emerald-200 text-emerald-950' : 'bg-white/10 text-white/65')}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedTemplate ? (
                    <div className="grid min-w-0 max-w-full gap-0 overflow-hidden lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
                      <div className="min-w-0 border-white/[0.07] p-3 lg:border-r">
                        <div className="space-y-1.5">
                          {messageTemplates[templateChannel].map((template) => (
                            <button key={template.key} type="button" onClick={() => {
                              setSelectedTemplateKey(template.key);
                              setTemplateDraft(template.body ?? '');
                              setEmailTemplateDraft(template.variants?.[templateLocale] ? { ...template.variants[templateLocale] } : null);
                              setTemplateError('');
                            }} className={cn('w-full rounded-xl border p-3 text-left transition-colors duration-200', selectedTemplate.key === template.key ? 'border-emerald-300/[0.18] bg-emerald-400/[0.10]' : 'border-transparent hover:bg-white/[0.045]')}>
                              <p className={cn('line-clamp-1 text-sm font-semibold tracking-[-0.015em]', selectedTemplate.key === template.key ? 'text-emerald-200' : 'text-white')}>{templateDisplayName(t, template)}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/45">{templateDescription(t, template)}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex min-w-0 max-w-full flex-col gap-4 p-5">
                        <div className="min-w-0 border-b border-white/[0.06] pb-4">
                          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-base font-semibold tracking-[-0.025em] text-white">{templateDisplayName(t, selectedTemplate)}</p>
                              <p className="mt-1 max-w-2xl text-sm leading-5 text-white/45">{templateDescription(t, selectedTemplate)}</p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <span className="rounded-full border border-white/[0.08] bg-white/[0.045] px-2.5 py-1 text-xs font-medium text-white/55">{templateChannelLabel(t, selectedTemplate.channel)}</span>
                              <span className="rounded-full border border-emerald-300/[0.16] bg-emerald-400/[0.10] px-2.5 py-1 text-xs font-medium text-emerald-200/80">{selectedTemplate.isEditable ? t.admin.bodyEditable : t.admin.readOnly}</span>
                            </div>
                          </div>
                        </div>

                        {selectedTemplate.channel === 'email' && emailTemplateDraft ? (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="inline-flex rounded-full border border-white/[0.08] bg-black/[0.16] p-1">
                                {(['en', 'fr'] as const).map((locale) => (
                                  <button key={locale} type="button" onClick={() => setTemplateLocale(locale)} className={cn('rounded-full px-3 py-1.5 text-sm font-semibold transition', templateLocale === locale ? 'bg-emerald-300 text-emerald-950' : 'text-white/55 hover:text-white')}>
                                    {locale === 'en' ? t.admin.english : t.admin.french}
                                  </button>
                                ))}
                              </div>
                              <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', emailTemplateDraft.needsReview ? 'border-amber-300/20 bg-amber-300/10 text-amber-100' : 'border-emerald-300/16 bg-emerald-400/10 text-emerald-200')}>
                                {emailTemplateDraft.needsReview ? t.admin.reviewRequired : t.admin.configured}
                              </span>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <TemplateField label={t.admin.subject} value={emailTemplateDraft.subject} onChange={(subject) => setEmailTemplateDraft({ ...emailTemplateDraft, subject })} disabled={!canManageTemplates} />
                              <TemplateField label={t.admin.previewText} value={emailTemplateDraft.previewText ?? ''} onChange={(previewText) => setEmailTemplateDraft({ ...emailTemplateDraft, previewText: previewText || null })} disabled={!canManageTemplates} />
                              <TemplateField label={t.admin.emailHeading} value={emailTemplateDraft.heading} onChange={(heading) => setEmailTemplateDraft({ ...emailTemplateDraft, heading })} disabled={!canManageTemplates} />
                              <TemplateField label={t.admin.greeting} value={emailTemplateDraft.greeting ?? ''} onChange={(greeting) => setEmailTemplateDraft({ ...emailTemplateDraft, greeting: greeting || null })} disabled={!canManageTemplates} />
                            </div>
                            <TemplateField label={t.admin.messageBody} value={emailTemplateDraft.body} onChange={(body) => setEmailTemplateDraft({ ...emailTemplateDraft, body })} disabled={!canManageTemplates} multiline />
                            <div className="grid gap-4 md:grid-cols-2">
                              <TemplateField label={t.admin.buttonLabel} value={emailTemplateDraft.buttonLabel ?? ''} onChange={(buttonLabel) => setEmailTemplateDraft({ ...emailTemplateDraft, buttonLabel: buttonLabel || null })} disabled={!canManageTemplates} />
                              <TemplateField label={t.admin.fallbackInstructions} value={emailTemplateDraft.fallbackLinkInstructions ?? ''} onChange={(fallbackLinkInstructions) => setEmailTemplateDraft({ ...emailTemplateDraft, fallbackLinkInstructions: fallbackLinkInstructions || null })} disabled={!canManageTemplates} />
                              <TemplateField label={t.admin.expirationNotice} value={emailTemplateDraft.expirationNotice ?? ''} onChange={(expirationNotice) => setEmailTemplateDraft({ ...emailTemplateDraft, expirationNotice: expirationNotice || null })} disabled={!canManageTemplates} />
                              <TemplateField label={t.admin.securityNotice} value={emailTemplateDraft.securityNotice ?? ''} onChange={(securityNotice) => setEmailTemplateDraft({ ...emailTemplateDraft, securityNotice: securityNotice || null })} disabled={!canManageTemplates} />
                            </div>
                            <TemplateField label={t.admin.footerExplanation} value={emailTemplateDraft.footerExplanation ?? ''} onChange={(footerExplanation) => setEmailTemplateDraft({ ...emailTemplateDraft, footerExplanation: footerExplanation || null })} disabled={!canManageTemplates} />
                          </>
                        ) : (
                          <label className="block min-w-0">
                            <div className="mb-2">
                              <span className="text-sm font-semibold text-white">{t.admin.messageBody}</span>
                              <p className="mt-1 text-xs leading-5 text-white/42">{t.admin.messageBodyHelper}</p>
                            </div>
                            <textarea disabled={!selectedTemplate.isEditable || !canManageTemplates} value={templateDraft} onChange={(event) => { setTemplateDraft(event.target.value); setTemplateError(''); }} className="max-h-[320px] min-h-[220px] w-full max-w-full resize-y overflow-auto rounded-xl border border-white/[0.08] bg-[#040806] p-4 text-sm leading-6 text-white outline-none transition placeholder:text-white/28 focus:border-emerald-300/45 focus:ring-2 focus-visible:ring-emerald-300/[0.12] disabled:cursor-not-allowed disabled:opacity-60" />
                          </label>
                        )}

                        <TemplateTokenCollapsible key={`email-template-variables-${selectedTemplate.key}-${templateLocale}`} title={t.admin.variables} description={t.admin.variablesHelper} tokens={selectedTemplate.variables.map((variable) => ({ value: `{{${variable}}}` }))} emptyLabel={t.admin.noVariablesAvailable} copyLabel={t.admin.copyVariable} copiedLabel={t.admin.copied} copyFailedLabel={t.admin.couldNotCopyToken} icon="variable" />

                        {emailTemplateDraft ? (
                          <div className="space-y-3 rounded-xl border border-white/[0.07] bg-black/[0.14] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-white/75">{t.admin.emailPreview}</p>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={Boolean(emailTemplateAction)} onClick={() => void previewEmailTemplate()} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.06] disabled:opacity-40">{t.admin.preview}</button>
                                <button type="button" disabled={Boolean(emailTemplateAction) || templateDirty} onClick={() => void previewEmailTemplate(true)} className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-950 disabled:opacity-40">{t.admin.sendTest} ({templateLocale.toUpperCase()})</button>
                              </div>
                            </div>
                            {emailTemplatePreviewHtml && <iframe title={`${t.admin.emailPreview} ${templateLocale.toUpperCase()}`} srcDoc={emailTemplatePreviewHtml} sandbox="" className="h-[460px] w-full rounded-lg border border-white/10 bg-white" />}
                          </div>
                        ) : (
                          <details className="rounded-xl border border-white/[0.07] bg-black/[0.14] p-4">
                            <summary className="cursor-pointer text-sm font-semibold text-white/75">{t.admin.preview}</summary>
                            <p className="mt-3 max-h-[220px] overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-white/64">{previewMessageTemplate(templateDraft, t.admin.templatePreviewValues, t.admin.passportTemplatePreviewValues)}</p>
                          </details>
                        )}

                        {(templateError || templateMissingVariable) && (
                          <p role="alert" className="app-alert-error rounded-xl border px-4 py-3 text-sm">{templateError || t.admin.templateMustIncludeVariable(`{{${templateMissingVariable}}}`)}</p>
                        )}
                        {!canManageTemplates && <p className="rounded-xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/80">{t.admin.templateSettingsPermissionDenied}</p>}

                        <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col-reverse gap-3 border-t border-white/[0.06] [background:var(--template-action-background)] px-5 pt-4 shadow-[0_-12px_28px_var(--template-action-shadow)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <button type="button" disabled={!selectedTemplate.isEditable || !canManageTemplates || saving || !templateDirty} onClick={resetTemplateBody} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-4 text-sm font-semibold text-white/78 transition-colors duration-200 hover:bg-white/[0.075] hover:text-white disabled:opacity-40"><Undo2 size={16} />{t.admin.resetToDefault}</button>
                          <Actions dirty={templateDirty} saving={saving} disabled={!selectedTemplate.isEditable || !canManageTemplates || Boolean(templateMissingVariable)} saveLabel={t.common.saveChanges} discardLabel={t.admin.discardChanges} onSave={() => saveTemplateBody()} onDiscard={() => { setTemplateDraft(selectedTemplate.body ?? ''); setEmailTemplateDraft(selectedEmailVariant ? { ...selectedEmailVariant } : null); setTemplateError(''); }} />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5">
                      <div className="rounded-xl border border-white/[0.07] bg-black/[0.16] p-4 text-sm leading-6 text-white/50">{t.admin.noEditableTemplates}</div>
                    </div>
                  )}
                </Card>}
                </div>
              )}

              {activeTab === 'notifications' && notificationSettings && (
                <div className="w-full min-w-0 max-w-full space-y-5 overflow-x-hidden">
                  <SettingsPanel title={t.admin.settingsNotifications} description={t.admin.adminNotificationSettingsDescription}>
                    <div className="flex w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border border-white/[0.075] bg-black/[0.14] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{t.admin.adminNotificationStatus}</p>
                        <p className="mt-1 text-sm leading-6 text-white/45">{notificationSettings.adminInAppAlertsEnabled ? t.admin.inAppAlertsActiveDescription : t.admin.inAppAlertsPausedDescription}</p>
                      </div>
                      <StatusPill tone={notificationSettings.adminInAppAlertsEnabled ? 'good' : 'warn'}>{notificationSettings.adminInAppAlertsEnabled ? t.admin.inAppAlertsActive : t.admin.inAppAlertsPaused}</StatusPill>
                    </div>
                    {!canManageNotifications && <p className="rounded-xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/80">{t.admin.notificationSettingsPermissionDenied}</p>}
                  </SettingsPanel>

                  <SettingsPanel title={t.admin.notificationDeliveryChannels} description={t.admin.notificationDeliveryChannelsDescription}>
                    <NotificationRow title={t.admin.adminInAppAlerts} description={t.admin.adminInAppAlertsDescription} compact>
                      <Toggle checked={notificationSettings.adminInAppAlertsEnabled} disabled={!canManageNotifications} onChange={(value) => updateNotification('adminInAppAlertsEnabled', value)} />
                    </NotificationRow>
                  </SettingsPanel>

                  <SettingsPanel title={t.admin.operationalAlerts} description={t.admin.operationalAlertsDescription}>
                    {!notificationSettings.adminInAppAlertsEnabled && (
                      <p className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm leading-6 text-white/52">{t.admin.enableInAppAlertsHelper}</p>
                    )}
                    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-white/[0.075] bg-black/[0.14]">
                      <NotificationRow muted={!notificationSettings.adminInAppAlertsEnabled} title={t.admin.emailDeliveryIssues} description={t.admin.emailDeliveryIssuesDescription} compact>
                        <Toggle checked={notificationSettings.emailDeliveryIssueAlertsEnabled} disabled={!canManageNotifications} onChange={(value) => updateNotification('emailDeliveryIssueAlertsEnabled', value)} />
                      </NotificationRow>
                      <NotificationRow muted={!notificationSettings.adminInAppAlertsEnabled} title={t.admin.registrationReview} description={t.admin.registrationReviewAlertsDescription} compact>
                        <Toggle checked={notificationSettings.registrationReviewAlertsEnabled} disabled={!canManageNotifications} onChange={(value) => updateNotification('registrationReviewAlertsEnabled', value)} />
                      </NotificationRow>
                      <NotificationRow muted={!notificationSettings.adminInAppAlertsEnabled} title={t.admin.passportExpiration} description={t.admin.passportExpirationAdminAlertsDescription} compact>
                        <Toggle checked={notificationSettings.passportExpirationAdminAlertsEnabled} disabled={!canManageNotifications} onChange={(value) => updateNotification('passportExpirationAdminAlertsEnabled', value)} />
                      </NotificationRow>
                      <NotificationRow muted={!notificationSettings.adminInAppAlertsEnabled} title={t.admin.reminderRunSummaries} description={t.admin.reminderRunSummaryAlertsDescription} compact>
                        <Toggle checked={notificationSettings.reminderRunSummaryAlertsEnabled} disabled={!canManageNotifications} onChange={(value) => updateNotification('reminderRunSummaryAlertsEnabled', value)} />
                      </NotificationRow>
                    </div>
                  </SettingsPanel>

                  <div className="flex w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border border-white/[0.075] bg-white/[0.03] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <p className="text-sm text-white/42">{notificationDirty ? t.admin.unsavedNotificationChanges : t.admin.noChangesToSave}</p>
                    <Actions dirty={notificationDirty} saving={saving} disabled={!canManageNotifications} saveLabel={t.common.saveChanges} discardLabel={t.admin.discardChanges} onSave={saveNotificationSettings} onDiscard={() => setNotificationSettings(savedNotificationSettings)} />
                  </div>
                </div>
              )}
              {activeTab === 'system-updates' && currentUser && (
                <SystemUpdatesSettings user={currentUser} />
              )}
              </div>
              </div>
            </main>
          </>
        )}
    </div>
  );
}

function SettingsPanel({ title, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="w-full min-w-0 max-w-full overflow-hidden rounded-[1.35rem] border-white/[0.075] bg-[#0a120e] p-0 shadow-[0_24px_70px_rgba(0,0,0,0.22)]">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-white md:text-base">{title}</h2>
      </div>
      <div className="w-full min-w-0 max-w-full space-y-4 p-5">{children}</div>
    </Card>
  );
}

function IntroPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[1.25rem] border border-white/[0.075] bg-white/[0.035] px-4 py-3">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-sm leading-6 text-white/48">{description}</p>
    </div>
  );
}

function SettingRow({ title, description, children, compact = false }: { title: React.ReactNode; description: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn('grid w-full min-w-0 max-w-full grid-cols-1 items-center gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(240px,390px)] lg:gap-8', compact ? 'border-b border-white/[0.055] py-4 last:border-b-0' : 'rounded-xl border border-white/[0.07] bg-black/[0.16] p-4')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-white/43">{description}</p>
      </div>
      <div className="w-full min-w-0 max-w-[390px] lg:justify-self-end">{children}</div>
    </div>
  );
}

function ReminderCard({ icon, title, description, children, className }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('w-full min-w-0 max-w-full overflow-hidden rounded-[1.25rem] border border-white/[0.075] bg-white/[0.035] shadow-[0_18px_50px_rgba(0,0,0,0.16)]', className)}>
      <div className="flex min-w-0 items-start gap-3 border-b border-white/[0.06] px-5 py-4">
        <span className="mt-0.5 shrink-0 text-emerald-300">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold leading-6 tracking-[-0.02em] text-white">{title}</h3>
          <p className="mt-1 max-w-[56ch] break-words text-sm leading-5 text-white/50">{description}</p>
        </div>
      </div>
      <div className="min-w-0 p-5">{children}</div>
    </section>
  );
}

function ReminderSettingRow({ title, description, children }: { title: React.ReactNode; description: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-3 border-t border-white/[0.055] py-4 first:border-t-0 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium leading-5 tracking-[-0.01em] text-white">{title}</p>
        <p className="mt-1 max-w-[52ch] break-words text-sm leading-5 text-white/48">{description}</p>
      </div>
      <div className="flex min-w-fit shrink-0 items-center justify-start gap-2 md:justify-end">{children}</div>
    </div>
  );
}

function NotificationRow({ title, description, children, compact = false, muted = false }: { title: string; description: string; children: React.ReactNode; compact?: boolean; muted?: boolean }) {
  return (
    <div className={cn('grid w-full min-w-0 max-w-full grid-cols-1 items-center gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(240px,390px)] lg:gap-8', compact ? 'border-b border-white/[0.055] p-4 last:border-b-0' : 'rounded-xl border border-white/[0.07] bg-black/[0.16] p-4', muted && 'opacity-55')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-white/43">{description}</p>
      </div>
      <div className="w-full min-w-0 max-w-[390px] lg:justify-self-end">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled = false, ariaLabel }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-55', checked ? 'border-accent/40 bg-accent/70' : 'border-white/12 bg-white/10')}>
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-lg transition', checked ? 'left-5' : 'left-0.5')} />
    </button>
  );
}

function NumberField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" min={0} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 w-20 rounded-xl border border-white/[0.08] bg-[#050907] px-3 text-center text-sm text-white outline-none transition focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/[0.12]" />;
}

function EmailField({ label, value, onChange, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
  return (
    <label>
      <span className="text-sm font-medium text-white/72">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/[0.08] bg-[#050907] px-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/[0.12]" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: React.ReactNode; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div className="block w-full min-w-0 md:w-80 xl:w-96">
      <span className="sr-only">{typeof label === 'string' ? label : undefined}</span>
      <span className="mb-2 hidden text-sm font-medium text-white/72 md:block">{label}</span>
      <AppSelect value={value} options={options} onChange={onChange} className="w-full min-w-0" />
    </div>
  );
}

function LabelWithHelp({ label, help, ariaLabel }: { label: string; help: string; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center gap-2">
      <span>{label}</span>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="rounded-full border border-white/10 bg-white/[0.035] p-1 text-white/45 transition hover:border-accent/35 hover:text-accent focus:border-accent/45 focus:text-accent focus:outline-none"
      >
        <HelpCircle size={16} />
      </button>
      {open && (
        <span className="absolute left-0 top-7 z-20 w-80 max-w-[calc(100vw-3rem)] rounded-xl border border-white/10 bg-[#07100d] p-3 text-sm font-normal leading-6 text-white/72 shadow-2xl shadow-black/40">
          {help}
        </span>
      )}
    </span>
  );
}

function InviteLinkCard({
  t,
  inviteLink,
  emailAvailable,
  recipientEmail,
  busy,
  onRecipientEmailChange,
  onGenerate,
  onRevoke,
  onCopy,
  onSend,
}: {
  t: ReturnType<typeof useI18n>['t'];
  inviteLink: InviteLinkSettings;
  emailAvailable: boolean;
  recipientEmail: string;
  busy: boolean;
  onRecipientEmailChange: (value: string) => void;
  onGenerate: () => void;
  onRevoke: () => void;
  onCopy: () => void;
  onSend: () => void;
}) {
  const status = inviteStatus(t, inviteLink);
  return (
    <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-black/15 p-4">
      <div className="flex w-full min-w-0 max-w-full flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{t.admin.invitationLink}</h3>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/48">{t.admin.invitationLinkDescription}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <LoadingButton loading={busy} onClick={onGenerate} className="bg-accent text-black hover:bg-[#74e4b1]">{inviteLink.exists ? t.admin.generateNewLink : t.admin.generateLink}</LoadingButton>
          {inviteLink.exists && inviteLink.status === 'active' && <button type="button" disabled={busy} onClick={onRevoke} className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/15 disabled:opacity-50">{t.admin.revokeLink}</button>}
        </div>
      </div>
      {inviteLink.exists && (
        <div className="mt-4 grid w-full min-w-0 max-w-full grid-cols-1 gap-3 text-sm text-white/56 sm:grid-cols-2 lg:grid-cols-3">
          {inviteLink.createdAt && <p>{t.admin.inviteCreatedAt}: <span className="text-white/76">{new Date(inviteLink.createdAt).toLocaleDateString()}</span></p>}
          {inviteLink.expiresAt && <p>{t.admin.inviteExpiresAt}: <span className="text-white/76">{new Date(inviteLink.expiresAt).toLocaleDateString()}</span></p>}
          <p>{t.admin.uses}: <span className="text-white/76">{inviteLink.useCount ?? 0}{inviteLink.maxUses ? ` / ${inviteLink.maxUses}` : ''}</span></p>
        </div>
      )}
      {inviteLink.inviteUrl && (
        <div className="mt-4 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-accent/15 bg-accent/10 p-3">
          <p className="text-sm leading-6 text-accent/90">{t.admin.saveInviteLinkNow}</p>
          <div className="mt-3 flex w-full min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input readOnly value={inviteLink.inviteUrl} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none" />
            <button type="button" onClick={onCopy} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"><Copy size={16} />{t.admin.copyLink}</button>
          </div>
        </div>
      )}
      <div className="mt-4 w-full min-w-0 max-w-full border-t border-white/10 pt-4">
        <div className="flex w-full min-w-0 max-w-full flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
          <TextField label={t.admin.recipientEmail} type="email" value={recipientEmail} onChange={onRecipientEmailChange} />
          <LoadingButton loading={busy} disabled={!emailAvailable || !recipientEmail.trim()} onClick={onSend} className="shrink-0">{t.admin.sendInvite}</LoadingButton>
        </div>
        {!emailAvailable && <p className="mt-2 text-sm text-amber-100/80">{t.admin.smtpNotReady}</p>}
      </div>
    </section>
  );
}

function inviteStatus(t: ReturnType<typeof useI18n>['t'], inviteLink: InviteLinkSettings): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  if (!inviteLink.exists) return { label: t.admin.noActiveLink, tone: 'neutral' };
  if (inviteLink.status === 'revoked') return { label: t.admin.revoked, tone: 'bad' };
  if (inviteLink.status === 'expired') return { label: t.admin.expired, tone: 'warn' };
  return { label: t.admin.activeLink, tone: 'good' };
}

function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block w-full min-w-0 md:w-80 xl:w-96">
      <span className="sr-only">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-white/[0.08] bg-[#050907] px-3 text-sm text-white outline-none transition placeholder:text-white/28 focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/[0.12]" />
    </label>
  );
}

function getTimezoneOptions() {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }).supportedValuesOf;
  const values = supportedValuesOf ? supportedValuesOf('timeZone') : ['Africa/Kinshasa', 'Africa/Lagos', 'Africa/Johannesburg', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Toronto'];
  return ['UTC', ...values.filter((value) => value !== 'UTC').sort((a, b) => a.localeCompare(b))];
}

function StatusPill({ tone = 'neutral', children }: { tone?: 'good' | 'warn' | 'bad' | 'neutral'; children: React.ReactNode }) {
  const toneClass = tone === 'good' ? 'border-accent/25 bg-accent/10 text-accent' : tone === 'warn' ? 'border-amber-300/25 bg-amber-300/10 text-amber-100' : tone === 'bad' ? 'border-rose-300/25 bg-rose-300/10 text-rose-100' : 'border-white/10 bg-white/[0.055] text-white/55';
  return <span className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]', toneClass)}>{children}</span>;
}

function emailStatusLabel(t: ReturnType<typeof useI18n>['t'], settings: EmailSettings) {
  if (!settings.enabled) return t.admin.emailDeliveryDisabled;
  if (!settings.configured) return t.admin.emailDeliveryNeedsConfiguration;
  if (settings.deliveryIssue) return t.admin.emailDeliveryIssue;
  if (settings.available) return t.admin.emailDeliveryReady;
  return t.admin.emailDeliveryNeedsConfiguration;
}

function emailStatusTone(settings: EmailSettings): 'good' | 'warn' | 'bad' | 'neutral' {
  if (!settings.enabled) return 'neutral';
  if (!settings.configured) return 'warn';
  if (settings.deliveryIssue) return 'bad';
  if (settings.available) return 'good';
  return 'warn';
}

function Actions({ dirty, saving, saveLabel, discardLabel, onSave, onDiscard, disabled = false }: { dirty: boolean; saving: boolean; saveLabel: string; discardLabel: string; onSave: () => void; onDiscard: () => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" disabled={!dirty || saving} onClick={onDiscard} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-4 text-sm font-semibold text-white/78 transition-colors duration-200 hover:bg-white/[0.075] hover:text-white disabled:opacity-40"><Undo2 size={16} />{discardLabel}</button>
      <LoadingButton loading={saving} disabled={!dirty || disabled} onClick={onSave}><Save size={16} />{saveLabel}</LoadingButton>
    </div>
  );
}

function TemplateField({ label, value, onChange, disabled, multiline = false }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; multiline?: boolean }) {
  const className = 'w-full rounded-xl border border-white/[0.08] bg-[#040806] px-3 py-2.5 text-sm leading-5 text-white outline-none transition focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-300/[0.12] disabled:cursor-not-allowed disabled:opacity-60';
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-sm font-semibold text-white">{label}</span>
      {multiline
        ? <textarea value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={cn(className, 'min-h-32 resize-y')} />
        : <input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={className} />}
    </label>
  );
}

function replaceMessageTemplate(groups: MessageTemplateGroups | null, updated: MessageTemplate): MessageTemplateGroups | null {
  if (!groups) return groups;
  return {
    notification: groups.notification.map((template) => template.key === updated.key ? updated : template),
    email: groups.email.map((template) => template.key === updated.key ? updated : template),
    system: groups.system.map((template) => template.key === updated.key ? updated : template),
  };
}

function replaceMessageTemplateVariant(groups: MessageTemplateGroups | null, key: string, variant: EmailTemplateVariant): MessageTemplateGroups | null {
  if (!groups) return groups;
  return {
    ...groups,
    email: groups.email.map((template) => template.key === key && template.variants
      ? { ...template, variants: { ...template.variants, [variant.locale]: variant } }
      : template),
  };
}

function templateContainsVariable(body: string, variable: string) {
  return new RegExp(`\\{\\{\\s*${escapeRegExp(variable)}\\s*\\}\\}`).test(body);
}

function templateValidationError(t: ReturnType<typeof useI18n>['t'], template: MessageTemplate, body: string) {
  if (!body.trim()) return t.admin.templateBodyRequired;
  if (body.length > 5000) return t.admin.templateBodyTooLong;
  const missing = template.requiredVariables.find((variable) => !templateContainsVariable(body, variable));
  return missing ? t.admin.templateMustIncludeVariable(`{{${missing}}}`) : '';
}

function templateChannelLabel(t: ReturnType<typeof useI18n>['t'], channel: MessageTemplateChannel) {
  if (channel === 'notification') return t.admin.notificationTemplates;
  if (channel === 'email') return t.admin.emailTemplates;
  return t.admin.systemMessages;
}

function templateDisplayName(t: ReturnType<typeof useI18n>['t'], template: MessageTemplate) {
  return t.admin.messageTemplateNames[template.key as keyof typeof t.admin.messageTemplateNames] ?? template.displayName;
}

function templateDescription(t: ReturnType<typeof useI18n>['t'], template: MessageTemplate) {
  return t.admin.messageTemplateDescriptions[template.key as keyof typeof t.admin.messageTemplateDescriptions] ?? template.description;
}

function previewMessageTemplate(template: string, standardValues: Record<string, string>, passportValues: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (match, key: string) => ({ ...standardValues, ...passportValues, eventTitle: 'Community town hall', inviteUrl: 'https://example.com/register?invite=...', resetUrl: 'https://example.com/reset-password?token=...' }[key] ?? match));
}

function previewTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(memberName|communityName|date|years|expirationDate|daysRemaining|stageLabel)\}\}/g, (_, key: string) => values[key] ?? '');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
