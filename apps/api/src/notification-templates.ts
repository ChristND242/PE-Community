import { BadRequestException } from '@nestjs/common';
import { NotificationTemplateKey, Prisma, PrismaClient } from '@prisma/client';
import { EmailLocale, renderBrandedEmail } from './email/email-template';

export const automationTemplateKeys = [
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_DUE_BEFORE,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_TEST,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_AUTO_COMPLETE,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_FLAG_UNASSIGNED,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_STALE_TASK_FOLLOW_UP,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_CHECKLIST_INCOMPLETE_BEFORE_DUE,
  NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE_ESCALATION,
] as const;

export const allowedNotificationTemplatePlaceholders = [
  'communityName',
  'boardName',
  'eventName',
  'taskTitle',
  'taskDueDate',
  'ruleName',
  'recipientName',
  'actionUrl',
  'taskStatus',
  'taskPriority',
  'automationRunId',
  'inactiveDays',
  'lastActivityAt',
  'hoursBeforeDue',
  'checklistDoneCount',
  'checklistTotalCount',
  'graceDays',
  'daysOverdue',
] as const;

type Locale = 'en' | 'fr';
type TemplateClient = Pick<PrismaClient, 'notificationTemplate' | 'community'>;
type TemplateRecord = Prisma.NotificationTemplateGetPayload<Record<string, never>>;

type TemplateDefinition = {
  key: NotificationTemplateKey;
  name: string;
  description: string;
  subjectEn: string;
  subjectFr: string;
  inAppTitleEn: string;
  inAppTitleFr: string;
  inAppBodyEn: string;
  inAppBodyFr: string;
  emailTitleEn: string;
  emailTitleFr: string;
  emailBodyEn: string;
  emailBodyFr: string;
  buttonLabelEn: string;
  buttonLabelFr: string;
};

export const automationNotificationTemplateDefinitions: TemplateDefinition[] = [
  {
    key: NotificationTemplateKey.TASK_BOARD_AUTOMATION_DUE_BEFORE,
    name: 'Task due soon',
    description: 'Used for due-soon reminder automation.',
    subjectEn: 'Task reminder: {{taskTitle}}',
    subjectFr: 'Rappel de tâche : {{taskTitle}}',
    inAppTitleEn: 'Task due soon',
    inAppTitleFr: 'Tâche bientôt due',
    inAppBodyEn: '{{taskTitle}} is due on {{taskDueDate}}.',
    inAppBodyFr: '{{taskTitle}} est prévue le {{taskDueDate}}.',
    emailTitleEn: 'Task due soon',
    emailTitleFr: 'Tâche bientôt due',
    emailBodyEn: '{{taskTitle}} is due on {{taskDueDate}}.\nBoard: {{boardName}}\nRule: {{ruleName}}',
    emailBodyFr: '{{taskTitle}} est prévue le {{taskDueDate}}.\nTableau : {{boardName}}\nRègle : {{ruleName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE,
    name: 'Task overdue',
    description: 'Used for overdue task automation.',
    subjectEn: 'Overdue task: {{taskTitle}}',
    subjectFr: 'Tâche en retard : {{taskTitle}}',
    inAppTitleEn: 'Task overdue',
    inAppTitleFr: 'Tâche en retard',
    inAppBodyEn: '{{taskTitle}} is overdue.',
    inAppBodyFr: '{{taskTitle}} est en retard.',
    emailTitleEn: 'Task overdue',
    emailTitleFr: 'Tâche en retard',
    emailBodyEn: '{{taskTitle}} is overdue.\nBoard: {{boardName}}\nRule: {{ruleName}}',
    emailBodyFr: '{{taskTitle}} est en retard.\nTableau : {{boardName}}\nRègle : {{ruleName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: NotificationTemplateKey.TASK_BOARD_AUTOMATION_TEST,
    name: 'Test automation notification',
    description: 'Used for admin-only automation notification tests.',
    subjectEn: 'Test automation email',
    subjectFr: 'E-mail de test d’automatisation',
    inAppTitleEn: 'Test automation notification',
    inAppTitleFr: 'Notification de test d’automatisation',
    inAppBodyEn: 'This is a test for "{{ruleName}}" on "{{boardName}}".',
    inAppBodyFr: 'Ceci est un test pour « {{ruleName}} » sur « {{boardName}} ».',
    emailTitleEn: 'Test automation notification',
    emailTitleFr: 'Notification de test d’automatisation',
    emailBodyEn: 'This is a test email for "{{ruleName}}" on "{{boardName}}".',
    emailBodyFr: 'Ceci est un e-mail de test pour « {{ruleName}} » sur « {{boardName}} ».',
    buttonLabelEn: 'Open automation',
    buttonLabelFr: 'Ouvrir l’automatisation',
  },
  {
    key: NotificationTemplateKey.TASK_BOARD_AUTOMATION_AUTO_COMPLETE,
    name: 'Task auto-completed',
    description: 'Available for automation that moves a task to Done.',
    subjectEn: 'Task completed: {{taskTitle}}',
    subjectFr: 'Tâche terminée : {{taskTitle}}',
    inAppTitleEn: 'Task completed',
    inAppTitleFr: 'Tâche terminée',
    inAppBodyEn: '{{taskTitle}} was moved to Done by {{ruleName}}.',
    inAppBodyFr: '{{taskTitle}} a été déplacée vers Terminé par {{ruleName}}.',
    emailTitleEn: 'Task completed',
    emailTitleFr: 'Tâche terminée',
    emailBodyEn: '{{taskTitle}} was moved to Done.\nBoard: {{boardName}}\nRule: {{ruleName}}',
    emailBodyFr: '{{taskTitle}} a été déplacée vers Terminé.\nTableau : {{boardName}}\nRègle : {{ruleName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: NotificationTemplateKey.TASK_BOARD_AUTOMATION_FLAG_UNASSIGNED,
    name: 'Unassigned task flagged',
    description: 'Available for automation that flags unassigned tasks.',
    subjectEn: 'Unassigned task: {{taskTitle}}',
    subjectFr: 'Tâche non assignée : {{taskTitle}}',
    inAppTitleEn: 'Unassigned task',
    inAppTitleFr: 'Tâche non assignée',
    inAppBodyEn: '{{taskTitle}} has no assignee.',
    inAppBodyFr: '{{taskTitle}} n’a pas d’assigné.',
    emailTitleEn: 'Unassigned task',
    emailTitleFr: 'Tâche non assignée',
    emailBodyEn: '{{taskTitle}} has no assignee.\nBoard: {{boardName}}\nRule: {{ruleName}}',
    emailBodyFr: '{{taskTitle}} n’a pas d’assigné.\nTableau : {{boardName}}\nRègle : {{ruleName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: NotificationTemplateKey.TASK_BOARD_AUTOMATION_STALE_TASK_FOLLOW_UP,
    name: 'Stale task follow-up',
    description: 'Used when an assigned task has had no recent activity.',
    subjectEn: 'Task follow-up needed: {{taskTitle}}',
    subjectFr: 'Relance nécessaire : {{taskTitle}}',
    inAppTitleEn: 'Task follow-up needed: {{taskTitle}}',
    inAppTitleFr: 'Relance nécessaire : {{taskTitle}}',
    inAppBodyEn: 'No activity for {{inactiveDays}} days.',
    inAppBodyFr: 'Aucune activité depuis {{inactiveDays}} jours.',
    emailTitleEn: 'Task follow-up needed',
    emailTitleFr: 'Relance de tâche nécessaire',
    emailBodyEn: '{{taskTitle}} has had no activity for {{inactiveDays}} days.\nLast activity: {{lastActivityAt}}\nBoard: {{boardName}}',
    emailBodyFr: '{{taskTitle}} est sans activité depuis {{inactiveDays}} jours.\nDernière activité : {{lastActivityAt}}\nTableau : {{boardName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: NotificationTemplateKey.TASK_BOARD_AUTOMATION_CHECKLIST_INCOMPLETE_BEFORE_DUE,
    name: 'Checklist incomplete before due',
    description: 'Used when a task is near its due date with checklist items still open.',
    subjectEn: 'Checklist incomplete: {{taskTitle}}',
    subjectFr: 'Checklist incomplète : {{taskTitle}}',
    inAppTitleEn: 'Checklist incomplete: {{taskTitle}}',
    inAppTitleFr: 'Checklist incomplète : {{taskTitle}}',
    inAppBodyEn: 'Due in {{hoursBeforeDue}} hours with checklist items still open.',
    inAppBodyFr: 'Échéance dans {{hoursBeforeDue}} heures avec des éléments encore ouverts.',
    emailTitleEn: 'Checklist incomplete',
    emailTitleFr: 'Checklist incomplète',
    emailBodyEn: '{{taskTitle}} has {{checklistDoneCount}} of {{checklistTotalCount}} checklist items complete.\nDue: {{taskDueDate}}\nBoard: {{boardName}}',
    emailBodyFr: '{{taskTitle}} a {{checklistDoneCount}} éléments terminés sur {{checklistTotalCount}}.\nÉchéance : {{taskDueDate}}\nTableau : {{boardName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
  {
    key: NotificationTemplateKey.TASK_BOARD_AUTOMATION_OVERDUE_ESCALATION,
    name: 'Overdue task escalation',
    description: 'Used when a task remains overdue beyond its configured grace period.',
    subjectEn: 'Overdue task escalation: {{taskTitle}}',
    subjectFr: 'Escalade de tâche en retard : {{taskTitle}}',
    inAppTitleEn: 'Overdue task escalation: {{taskTitle}}',
    inAppTitleFr: 'Escalade de retard : {{taskTitle}}',
    inAppBodyEn: 'This task is {{daysOverdue}} days overdue.',
    inAppBodyFr: 'Cette tâche a {{daysOverdue}} jours de retard.',
    emailTitleEn: 'Overdue task escalation',
    emailTitleFr: 'Escalade de tâche en retard',
    emailBodyEn: '{{taskTitle}} is {{daysOverdue}} days overdue after a {{graceDays}}-day grace period.\nDue: {{taskDueDate}}\nBoard: {{boardName}}',
    emailBodyFr: '{{taskTitle}} a {{daysOverdue}} jours de retard après une période de grâce de {{graceDays}} jours.\nÉchéance : {{taskDueDate}}\nTableau : {{boardName}}',
    buttonLabelEn: 'Open task',
    buttonLabelFr: 'Ouvrir la tâche',
  },
];

export async function ensureAutomationNotificationTemplates(prisma: TemplateClient, communityId: string) {
  const community = await prisma.community.findUnique({ where: { id: communityId }, select: { name: true } });
  await Promise.all(automationNotificationTemplateDefinitions.map((definition) => prisma.notificationTemplate.upsert({
    where: { communityId_key: { communityId, key: definition.key } },
    update: {
      name: definition.name,
      description: definition.description,
      channelScope: templateChannelScope(),
    },
    create: {
      communityId,
      key: definition.key,
      name: definition.name,
      description: definition.description,
      channelScope: templateChannelScope(),
      subjectEn: definition.subjectEn,
      subjectFr: definition.subjectFr,
      inAppTitleEn: definition.inAppTitleEn,
      inAppTitleFr: definition.inAppTitleFr,
      inAppBodyEn: definition.inAppBodyEn,
      inAppBodyFr: definition.inAppBodyFr,
      emailTitleEn: definition.emailTitleEn,
      emailTitleFr: definition.emailTitleFr,
      emailBodyEn: definition.emailBodyEn,
      emailBodyFr: definition.emailBodyFr,
      buttonLabelEn: definition.buttonLabelEn,
      buttonLabelFr: definition.buttonLabelFr,
    },
  })));
  return { communityName: community?.name ?? 'PE Community' };
}

export function notificationTemplateDefinition(key: NotificationTemplateKey) {
  return automationNotificationTemplateDefinitions.find((definition) => definition.key === key);
}

export function validateNotificationTemplatePlaceholders(input: Record<string, unknown>) {
  const fields = ['subjectEn', 'subjectFr', 'inAppTitleEn', 'inAppTitleFr', 'inAppBodyEn', 'inAppBodyFr', 'emailTitleEn', 'emailTitleFr', 'emailBodyEn', 'emailBodyFr', 'buttonLabelEn', 'buttonLabelFr'];
  for (const field of fields) {
    const value = stringValue(input[field]);
    if (!value) continue;
    const unknown = unknownPlaceholders(value);
    if (unknown.length) throw new BadRequestException(`Unknown placeholder: {{${unknown[0]}}}`);
  }
}

export function renderNotificationTemplate(template: TemplateRecord, locale: string | null | undefined, variables: Record<string, string | null | undefined>) {
  const requested: Locale = locale === 'fr' ? 'fr' : 'en';
  const requestedVariant = notificationTemplateVariant(template, requested);
  const englishVariant = notificationTemplateVariant(template, 'en');
  const variant = completeNotificationVariant(requestedVariant)
    ? requestedVariant
    : completeNotificationVariant(englishVariant)
      ? englishVariant
      : null;
  if (!variant) throw new BadRequestException(`Email template ${template.key} has no complete localized variant.`);
  const values = normalizeVariables(variables);
  return {
    locale: variant.locale,
    subject: renderControlledTemplate(variant.subject, values),
    inAppTitle: renderControlledTemplate(variant.inAppTitle, values),
    inAppBody: renderControlledTemplate(variant.inAppBody, values),
    emailTitle: renderControlledTemplate(variant.emailTitle, values),
    emailBody: renderControlledTemplate(variant.emailBody, values),
    buttonLabel: renderControlledTemplate(variant.buttonLabel, values),
  };
}

function notificationTemplateVariant(template: TemplateRecord, locale: Locale) {
  return locale === 'fr'
    ? {
        locale,
        subject: template.subjectFr ?? '',
        inAppTitle: template.inAppTitleFr,
        inAppBody: template.inAppBodyFr,
        emailTitle: template.emailTitleFr ?? '',
        emailBody: template.emailBodyFr ?? '',
        buttonLabel: template.buttonLabelFr ?? '',
      }
    : {
        locale,
        subject: template.subjectEn ?? '',
        inAppTitle: template.inAppTitleEn,
        inAppBody: template.inAppBodyEn,
        emailTitle: template.emailTitleEn ?? '',
        emailBody: template.emailBodyEn ?? '',
        buttonLabel: template.buttonLabelEn ?? '',
      };
}

function completeNotificationVariant(variant: ReturnType<typeof notificationTemplateVariant>) {
  return Object.entries(variant).every(([key, value]) => key === 'locale' || value.trim().length > 0);
}

export function sampleTemplateVariables(locale: string | null | undefined) {
  const french = locale === 'fr';
  return {
    communityName: 'PE Community',
    boardName: french ? 'Réorganisation communautaire' : 'Community reorganization',
    eventName: french ? 'Assemblée communautaire' : 'Community assembly',
    taskTitle: french ? 'Préparer les documents' : 'Prepare materials',
    taskDueDate: new Intl.DateTimeFormat(french ? 'fr-FR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-08-15T09:00:00Z')),
    ruleName: french ? 'Notifier avant la date limite' : 'Notify before due date',
    recipientName: 'Exaud',
    actionUrl: `${frontendOrigin().replace(/\/$/, '')}/admin/task-boards/sample?section=board`,
    taskStatus: french ? 'À faire' : 'To do',
    taskPriority: french ? 'Moyenne' : 'Medium',
    automationRunId: 'sample-run',
  };
}

export function brandedAutomationEmail(input: { communityName: string; title: string; body: string; actionUrl?: string | null; buttonLabel?: string | null; accentColor?: string | null; locale?: EmailLocale }) {
  const locale = input.locale ?? 'en';
  return renderBrandedEmail({
    subject: input.title,
    title: input.title,
    body: input.body,
    action: input.actionUrl ? { label: input.buttonLabel || (locale === 'fr' ? 'Ouvrir le lien' : 'Open link'), url: input.actionUrl } : undefined,
    communityName: input.communityName,
    locale,
    align: 'left',
    eyebrow: locale === 'fr' ? 'Automatisation' : 'Automation',
  });
}

export function templateContentChanged(existing: TemplateRecord, input: Record<string, unknown>) {
  const fields = ['subjectEn', 'subjectFr', 'inAppTitleEn', 'inAppTitleFr', 'inAppBodyEn', 'inAppBodyFr', 'emailTitleEn', 'emailTitleFr', 'emailBodyEn', 'emailBodyFr', 'buttonLabelEn', 'buttonLabelFr', 'enabled'];
  return fields.some((field) => input[field] !== undefined && normalizeComparable((existing as unknown as Record<string, unknown>)[field]) !== normalizeComparable(input[field]));
}

export function templateChannelScope(): Prisma.InputJsonObject {
  return { usedBy: 'AUTOMATION', channels: ['IN_APP', 'EMAIL'] };
}

function renderControlledTemplate(value: string, variables: Record<string, string>) {
  return value.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (_match, key: string) => allowedNotificationTemplatePlaceholders.includes(key as never) ? variables[key] ?? '' : '');
}

function unknownPlaceholders(value: string) {
  const unknown = new Set<string>();
  for (const match of value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
    const key = String(match[1] ?? '').trim();
    if (!/^[a-zA-Z0-9]+$/.test(key) || !allowedNotificationTemplatePlaceholders.includes(key as never)) unknown.add(key);
  }
  return Array.from(unknown);
}

function normalizeVariables(values: Record<string, string | null | undefined>) {
  return Object.fromEntries(allowedNotificationTemplatePlaceholders.map((key) => [key, String(values[key] ?? '')]));
}

function stringValue(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeComparable(value: unknown) {
  if (typeof value === 'string') return value.trim();
  return value;
}

function frontendOrigin() {
  return process.env.WEB_ORIGIN ?? 'http://localhost:3000';
}
