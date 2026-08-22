import { useI18n } from './i18n';

export type AutomationValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';
export type AutomationValidationItem = {
  code: string;
  severity: AutomationValidationSeverity;
  field?: string;
};
export type AutomationValidationResult = {
  valid: boolean;
  items: AutomationValidationItem[];
};

export function automationValidationMessage(code: string, t: ReturnType<typeof useI18n>['t']) {
  if (code === 'NO_RECIPIENTS') return t.admin.automationValidationNoRecipients;
  if (code === 'NO_SUPPORTED_DELIVERY_CHANNEL') return t.admin.automationNoSupportedChannel;
  if (code === 'EMAIL_SMTP_UNAVAILABLE') return t.admin.automationEmailSmtpUnavailable;
  if (code === 'DUPLICATE_DUE_BEFORE_RULE') return t.admin.automationDuplicateDueBefore;
  if (code === 'DUPLICATE_OVERDUE_RULE') return t.admin.automationDuplicateOverdue;
  if (code === 'DUPLICATE_STALE_TASK_RULE') return t.admin.automationDuplicateStaleTask;
  if (code === 'DUPLICATE_CHECKLIST_DUE_RULE') return t.admin.automationDuplicateChecklistDue;
  if (code === 'DUPLICATE_OVERDUE_ESCALATION_RULE') return t.admin.automationDuplicateOverdueEscalation;
  if (code === 'INVALID_DUE_WINDOW') return t.admin.automationInvalidDueWindow;
  if (code === 'INVALID_INACTIVE_DAYS') return t.admin.automationInvalidInactiveDays;
  if (code === 'INVALID_GRACE_DAYS') return t.admin.automationInvalidGraceDays;
  if (code === 'LONG_DUE_WINDOW') return t.admin.automationLongDueWindow;
  if (code === 'LONG_INACTIVE_WINDOW') return t.admin.automationLongInactiveWindow;
  if (code === 'NO_CURRENT_MATCHES') return t.admin.automationNoCurrentMatches;
  if (code === 'DEFAULT_TEMPLATE_FALLBACK') return t.admin.automationDefaultTemplateFallback;
  if (code === 'TEMPLATE_UNAVAILABLE') return t.admin.automationTemplateUnavailable;
  if (code === 'UNASSIGNED_TASK_RECIPIENTS') return t.admin.automationUnassignedRecipientReadiness;
  if (code === 'NO_ELIGIBLE_ADMINS') return t.admin.automationNoEligibleAdmins;
  if (code === 'OVERDUE_REPEATS_DAILY') return t.admin.automationOverdueRepeatNotice;
  if (code === 'ESCALATION_REPEATS_DAILY') return t.admin.automationEscalationRepeatNotice;
  if (code === 'SIMILAR_RULE_EXISTS') return t.admin.similarAutomationRuleExists;
  return t.admin.automationRuleCheckFailed;
}
