'use client';

import { ArrowLeft, ChevronRight, Eye, Pencil, Search, Send, Save, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, LoadingButton, TableEmptyState } from './ui';
import { GroupedButton } from './ui/grouped-button';
import { TaskBoardMasterDetailWorkspace } from './task-board-master-detail-workspace';
import { TemplateTokenCollapsible } from './template-token-collapsible';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/utils';

export type AutomationNotificationTemplate = {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  version: number;
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
  usedBy: string;
  channels: string[];
  languages: string[];
  placeholders: string[];
  updatedAt: string | null;
};

export type AutomationNotificationPreview = {
  locale: 'en' | 'fr';
  inApp: { title: string; body: string; actionUrl: string };
  email: { subject: string; title: string; body: string; html: string };
};

export type AutomationNotificationDetailMode = 'view' | 'edit';

export function AutomationNotificationTemplateWorkspace({
  templates,
  selectedTemplate,
  draft,
  locale,
  mode,
  mobileView,
  dirty,
  busy,
  error,
  preview,
  canManage,
  onSelect,
  onLocaleChange,
  onModeChange,
  onMobileBack,
  onDraftChange,
  onPreview,
  onSendTest,
  onDiscard,
  onSave,
}: {
  templates: AutomationNotificationTemplate[];
  selectedTemplate: AutomationNotificationTemplate | null;
  draft: AutomationNotificationTemplate | null;
  locale: 'en' | 'fr';
  mode: AutomationNotificationDetailMode;
  mobileView: 'table' | 'detail';
  dirty: boolean;
  busy: string;
  error: string;
  preview: AutomationNotificationPreview | null;
  canManage: boolean;
  onSelect: (template: AutomationNotificationTemplate) => void;
  onLocaleChange: (locale: 'en' | 'fr') => void;
  onModeChange: (mode: AutomationNotificationDetailMode) => void;
  onMobileBack: () => void;
  onDraftChange: (draft: AutomationNotificationTemplate) => void;
  onPreview: () => void;
  onSendTest: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredTemplates = useMemo(() => {
    if (!normalizedQuery) return templates;
    return templates.filter((template) => [
      template.name,
      template.description,
      template.key,
      t.admin.automationInApp,
      t.admin.automationEmail,
      `v${template.version}`,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }, [normalizedQuery, t.admin.automationEmail, t.admin.automationInApp, templates]);

  useEffect(() => {
    setPreviewOpen(false);
  }, [selectedTemplate?.id]);

  function renderTablePane(mobile: boolean) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-white/[0.07] px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold text-white sm:text-base">{t.admin.automationNotificationTemplates}</h2>
          <p className="mt-1 text-xs leading-5 text-white/45 sm:text-sm">{t.admin.automationTemplatesDescription}</p>
          <label className="relative mt-4 block">
            <span className="sr-only">{t.admin.searchAutomationNotificationTemplates}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.admin.searchAutomationNotificationTemplates} className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-300/40 focus:ring-2 focus:ring-emerald-300/10" />
          </label>
        </header>
        <div className="chat-scrollbar min-h-0 flex-1 overflow-auto">
          {filteredTemplates.length ? (
            <table className="w-full min-w-[700px] border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#07100c]/95 text-[11px] font-semibold uppercase text-white/42 backdrop-blur">
                <tr>
                  <th className="border-b border-white/[0.07] px-4 py-3">{t.admin.template}</th>
                  <th className="border-b border-white/[0.07] px-3 py-3">{t.admin.channels}</th>
                  <th className="border-b border-white/[0.07] px-3 py-3">{t.admin.languages}</th>
                  <th className="border-b border-white/[0.07] px-3 py-3">{t.admin.version}</th>
                  <th className="w-10 border-b border-white/[0.07] px-3 py-3"><span className="sr-only">{t.common.details}</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredTemplates.map((template) => {
                  const selected = selectedTemplate?.id === template.id;
                  return (
                    <tr key={template.id} tabIndex={0} aria-selected={selected} onClick={() => onSelect(template)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(template); } }} className={cn('cursor-pointer outline-none transition hover:bg-white/[0.045] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-300/40', selected && 'bg-emerald-400/[0.09] hover:bg-emerald-400/[0.11]')}>
                      <td className="border-b border-white/[0.055] px-4 py-3.5">
                        <p className={cn('font-semibold', selected ? 'text-emerald-200' : 'text-white')}>{template.name}</p>
                        <p className="mt-1 line-clamp-2 max-w-[36ch] text-xs leading-5 text-white/43">{template.description}</p>
                      </td>
                      <td className="border-b border-white/[0.055] px-3 py-3.5"><div className="flex flex-wrap gap-1">{template.channels.map((channel) => <TableBadge key={channel}>{channel === 'IN_APP' ? t.admin.automationInApp : channel === 'EMAIL' ? t.admin.automationEmail : channel}</TableBadge>)}</div></td>
                      <td className="border-b border-white/[0.055] px-3 py-3.5"><div className="flex gap-1">{template.languages.map((language) => <TableBadge key={language}>{language}</TableBadge>)}</div></td>
                      <td className="border-b border-white/[0.055] px-3 py-3.5"><TableBadge>v{template.version}</TableBadge></td>
                      <td className="border-b border-white/[0.055] px-3 py-3.5 text-white/35"><ChevronRight size={16} aria-hidden="true" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4"><TableEmptyState title={t.admin.noMatchingAutomationNotificationTemplates} /></div>
          )}
        </div>
        {mobile && <p className="shrink-0 border-t border-white/[0.06] px-4 py-3 text-xs text-white/38">{filteredTemplates.length} / {templates.length}</p>}
      </div>
    );
  }

  function renderDetailPane(mobile: boolean) {
    if (!selectedTemplate || !draft) {
      return <div className="grid h-full place-items-center p-6"><TableEmptyState title={t.admin.noAutomationNotificationTemplateSelected} /></div>;
    }
    const formId = `automation-notification-template-${draft.id}-${mobile ? 'mobile' : 'desktop'}`;
    const localized = localizedTemplate(draft, locale);
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-white/[0.07] px-4 py-4 sm:px-5">
          {mobile && <button type="button" onClick={onMobileBack} className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/65 hover:bg-white/[0.06]"><ArrowLeft size={14} />{t.admin.backToAutomationNotificationTemplates}</button>}
          <p className="text-[11px] font-semibold uppercase text-emerald-300/70">{mode === 'edit' ? t.admin.editAutomationNotificationTemplate : t.admin.automationNotificationDetails}</p>
          <div className="mt-1 min-w-0">
            <h3 className="text-base font-semibold text-white">{draft.name}</h3>
            <p className="mt-1 text-sm leading-5 text-white/45">{draft.description}</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><TableBadge>{t.admin.automationNotificationTemplates}</TableBadge><TableBadge>{t.admin.bodyEditable}</TableBadge><TableBadge>v{draft.version}</TableBadge><TableBadge>{t.admin.automationInApp}</TableBadge><TableBadge>{t.admin.automationEmail}</TableBadge></div>
        </header>

        <div className="chat-scrollbar min-h-0 flex-1 overflow-y-auto">
          <form id={formId} onSubmit={(event) => { event.preventDefault(); onSave(); }} className="space-y-5 p-4 sm:p-5">
            <LocaleSwitcher locale={locale} label={t.admin.languages} onChange={onLocaleChange} />
            {mode === 'edit' ? (
              <div className="grid gap-4">
                <TemplateField label={t.admin.subject} value={localized.subject} onChange={(value) => onDraftChange(updateLocalizedTemplate(draft, locale, 'subject', value))} />
                <TemplateField label={t.admin.buttonLabel} value={localized.buttonLabel} onChange={(value) => onDraftChange(updateLocalizedTemplate(draft, locale, 'buttonLabel', value))} />
                <TemplateField label={t.admin.inAppTitle} value={localized.inAppTitle} onChange={(value) => onDraftChange(updateLocalizedTemplate(draft, locale, 'inAppTitle', value))} />
                <TemplateField label={t.admin.emailTitle} value={localized.emailTitle} onChange={(value) => onDraftChange(updateLocalizedTemplate(draft, locale, 'emailTitle', value))} />
                <TemplateField textarea label={t.admin.inAppBody} value={localized.inAppBody} onChange={(value) => onDraftChange(updateLocalizedTemplate(draft, locale, 'inAppBody', value))} />
                <TemplateField textarea label={t.admin.emailBody} value={localized.emailBody} onChange={(value) => onDraftChange(updateLocalizedTemplate(draft, locale, 'emailBody', value))} />
              </div>
            ) : (
              <div className="space-y-3">
                <ReadOnlyField label={t.admin.subject} value={localized.subject} />
                <ReadOnlyField label={t.admin.buttonLabel} value={localized.buttonLabel} />
                <ReadOnlyField label={t.admin.inAppTitle} value={localized.inAppTitle} />
                <ReadOnlyField label={t.admin.emailTitle} value={localized.emailTitle} />
                <ReadOnlyField label={t.admin.inAppBody} value={localized.inAppBody} multiline />
                <ReadOnlyField label={t.admin.emailBody} value={localized.emailBody} multiline />
              </div>
            )}
            <TemplateTokenCollapsible key={draft.id} title={t.admin.availablePlaceholders} description={t.admin.availablePlaceholdersDescription} tokens={draft.placeholders.map((placeholder) => ({ value: `{{${placeholder}}}` }))} emptyLabel={t.admin.noPlaceholdersAvailable} copyLabel={t.admin.copyPlaceholder} copiedLabel={t.admin.copied} copyFailedLabel={t.admin.couldNotCopyToken} icon="placeholder" />
            <details open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)} className="rounded-xl border border-white/[0.08] bg-black/20 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white/75">{t.admin.preview}</summary>
              <div className="mt-4 grid gap-4"><PreviewPanel title={t.admin.inAppPreview} loading={busy === 'preview'} body={preview ? `${preview.inApp.title}\n\n${preview.inApp.body}` : t.admin.samplePreview} /><PreviewPanel title={t.admin.emailPreview} loading={busy === 'preview'} body={preview ? `${preview.email.subject}\n\n${preview.email.body}` : t.admin.samplePreview} /></div>
            </details>
            {error && <p role="alert" className="rounded-xl border border-rose-300/15 bg-rose-300/10 px-4 py-3 text-sm text-rose-100/80">{error}</p>}
            {!canManage && <p className="rounded-xl border border-amber-300/15 bg-amber-300/10 px-4 py-3 text-sm text-amber-100/80">{t.admin.templateSettingsPermissionDenied}</p>}
          </form>
        </div>

        {mode === 'view' ? (
          <footer className="flex shrink-0 items-center justify-end border-t border-white/[0.07] bg-[#07100b]/95 px-4 py-3 backdrop-blur sm:px-5">
            <GroupedButton actions={[
              { id: 'preview', label: t.admin.preview, icon: Eye, onClick: () => { setPreviewOpen(true); onPreview(); }, disabled: Boolean(busy && busy !== 'preview'), loading: busy === 'preview' },
              { id: 'send-test', label: t.admin.sendTest, icon: Send, onClick: onSendTest, disabled: Boolean(busy && busy !== 'test'), loading: busy === 'test' },
              { id: 'edit', label: t.admin.editTemplate, icon: Pencil, onClick: () => onModeChange('edit'), disabled: !canManage || Boolean(busy) },
            ]} />
          </footer>
        ) : (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-white/[0.07] bg-[#07100b]/95 px-4 py-3 backdrop-blur sm:px-5">
            <button type="button" disabled={Boolean(busy)} onClick={onDiscard} className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-4 text-sm font-semibold text-white/78 hover:bg-white/[0.075] hover:text-white disabled:opacity-40"><Undo2 size={16} />{t.admin.discardChanges}</button>
            <LoadingButton type="submit" form={formId} loading={busy === 'save'} loadingLabel={t.admin.savingSettings} disabled={!dirty || !canManage || Boolean(busy && busy !== 'save')}><Save size={16} />{t.common.saveChanges}</LoadingButton>
          </footer>
        )}
      </div>
    );
  }

  return <TaskBoardMasterDetailWorkspace mobileView={mobileView === 'table' ? 'list' : 'detail'} renderListPane={renderTablePane} renderDetailPane={renderDetailPane} resizeLabel={t.admin.resizeAutomationNotificationTemplatePanes} testId="automation-notification-templates" />;
}

function TableBadge({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.045] px-2 py-1 text-[11px] font-semibold text-white/58">{children}</span>;
}

function LocaleSwitcher({ locale, label, onChange }: { locale: 'en' | 'fr'; label: string; onChange: (locale: 'en' | 'fr') => void }) {
  return <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1" role="group" aria-label={label}>{(['en', 'fr'] as const).map((option) => <button key={option} type="button" onClick={() => onChange(option)} className={cn('rounded-full px-3 py-1.5 text-xs font-bold uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40', locale === option ? 'bg-accent text-background' : 'text-white/55 hover:text-white')}>{option}</button>)}</div>;
}

function TemplateField({ label, value, onChange, textarea = false }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean }) {
  return <label className="block"><span className="text-sm font-semibold text-white/78">{label}</span>{textarea ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={5} className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-accent/50" /> : <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white outline-none focus:border-accent/50" />}</label>;
}

function ReadOnlyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return <div className="rounded-xl border border-white/[0.07] bg-black/15 px-3.5 py-3"><p className="text-xs font-semibold uppercase text-white/38">{label}</p><p className={cn('mt-1 text-sm leading-6 text-white/72', multiline && 'whitespace-pre-wrap')}>{value}</p></div>;
}

function PreviewPanel({ title, body, loading }: { title: string; body: string; loading: boolean }) {
  return <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4"><p className="text-sm font-semibold text-white">{title}</p><p className="mt-3 min-h-28 whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#040806] p-3 text-sm leading-6 text-white/62">{loading ? '...' : body}</p></div>;
}

function localizedTemplate(template: AutomationNotificationTemplate, locale: 'en' | 'fr') {
  return locale === 'fr'
    ? { subject: template.subjectFr, buttonLabel: template.buttonLabelFr, inAppTitle: template.inAppTitleFr, emailTitle: template.emailTitleFr, inAppBody: template.inAppBodyFr, emailBody: template.emailBodyFr }
    : { subject: template.subjectEn, buttonLabel: template.buttonLabelEn, inAppTitle: template.inAppTitleEn, emailTitle: template.emailTitleEn, inAppBody: template.inAppBodyEn, emailBody: template.emailBodyEn };
}

function updateLocalizedTemplate(template: AutomationNotificationTemplate, locale: 'en' | 'fr', field: 'subject' | 'buttonLabel' | 'inAppTitle' | 'emailTitle' | 'inAppBody' | 'emailBody', value: string): AutomationNotificationTemplate {
  const fieldMap = locale === 'fr'
    ? { subject: 'subjectFr', buttonLabel: 'buttonLabelFr', inAppTitle: 'inAppTitleFr', emailTitle: 'emailTitleFr', inAppBody: 'inAppBodyFr', emailBody: 'emailBodyFr' } as const
    : { subject: 'subjectEn', buttonLabel: 'buttonLabelEn', inAppTitle: 'inAppTitleEn', emailTitle: 'emailTitleEn', inAppBody: 'inAppBodyEn', emailBody: 'emailBodyEn' } as const;
  return { ...template, [fieldMap[field]]: value };
}
