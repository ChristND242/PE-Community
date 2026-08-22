import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/admin/settings/page.tsx', import.meta.url);
const workspaceUrl = new URL('./automation-notification-template-workspace.tsx', import.meta.url);
const tokenCollapsibleUrl = new URL('./template-token-collapsible.tsx', import.meta.url);
const groupedButtonUrl = new URL('./ui/grouped-button.tsx', import.meta.url);
const buttonGroupUrl = new URL('./ui/button-group.tsx', import.meta.url);
const tooltipUrl = new URL('./ui/tooltip.tsx', import.meta.url);
const splitterUrl = new URL('./task-board-master-detail-workspace.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('template group tabs use clarified bilingual copy and real loaded counts', async () => {
  const [page, i18n] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(i18nUrl, 'utf8')]);

  assert.match(page, /label: t\.admin\.automationNotificationTemplates, count: automationTemplates\?\.length \?\? 0/);
  assert.match(page, /label: t\.admin\.emailTemplates, count: messageTemplates\.email\.length/);
  assert.match(page, /role="tab" aria-selected=\{active\}/);
  assert.match(i18n, /automationNotificationTemplates: 'Automation Notification templates'/);
  assert.match(i18n, /automationNotificationTemplates: 'Modèles de notification d’automatisation'/);
});

test('automation notifications reuse the approved resizable Task Board workspace', async () => {
  const [page, workspace, splitter] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(workspaceUrl, 'utf8'),
    readFile(splitterUrl, 'utf8'),
  ]);

  assert.match(page, /<AutomationNotificationTemplateWorkspace/);
  assert.match(workspace, /<TaskBoardMasterDetailWorkspace/);
  assert.match(workspace, /testId="automation-notification-templates"/);
  assert.match(splitter, /useState\(60\)/);
  assert.match(splitter, /Math\.min\(70, Math\.max\(42/);
  assert.match(splitter, /role="separator"/);
  assert.match(splitter, /cursor-col-resize/);
  assert.doesNotMatch(workspace, /grid-cols-\[minmax\(250px,320px\)/);
});

test('left pane is a searchable real-data table with selected rows', async () => {
  const workspace = await readFile(workspaceUrl, 'utf8');

  assert.match(workspace, /<table className=/);
  for (const header of ['t.admin.template', 't.admin.channels', 't.admin.languages', 't.admin.version']) {
    assert.match(workspace, new RegExp(header.replaceAll('.', '\\.')));
  }
  assert.match(workspace, /filteredTemplates\.map\(\(template\) =>/);
  assert.match(workspace, /template\.channels\.map/);
  assert.match(workspace, /template\.languages\.map/);
  assert.match(workspace, /aria-selected=\{selected\}/);
  assert.match(workspace, /selected && 'bg-emerald-400\/\[0\.09\]/);
  assert.match(workspace, /t\.admin\.searchAutomationNotificationTemplates/);
  assert.match(workspace, /template\.key/);
});

test('detail pane separates view and edit while preserving localized actions', async () => {
  const [page, workspace] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(workspaceUrl, 'utf8')]);

  assert.match(workspace, /type AutomationNotificationDetailMode = 'view' \| 'edit'/);
  assert.match(workspace, /mode === 'edit'/);
  assert.match(workspace, /onModeChange\('edit'\)/);
  assert.match(workspace, /localizedTemplate\(draft, locale\)/);
  assert.match(workspace, /updateLocalizedTemplate\(draft, locale/);
  assert.match(workspace, /onPreview/);
  assert.match(workspace, /onSendTest/);
  assert.match(workspace, /onDiscard/);
  assert.match(workspace, /type="submit" form=\{formId\}/);
  assert.match(page, /setAutomationTemplateMode\('view'\)/);
  assert.match(page, /settings\/notification-templates\/\$\{automationTemplateDraft\.id\}/);
  assert.match(page, /settings\/notification-templates\/\$\{template\.id\}\/preview/);
  assert.match(page, /settings\/notification-templates\/\$\{template\.id\}\/test/);
});

test('view actions live only in the fixed footer and edit keeps its own footer', async () => {
  const workspace = await readFile(workspaceUrl, 'utf8');
  const detailStart = workspace.indexOf('function renderDetailPane');
  const headerStart = workspace.indexOf('<header className="shrink-0', detailStart);
  const headerEnd = workspace.indexOf('</header>', headerStart);
  const header = workspace.slice(headerStart, headerEnd);
  const viewFooterStart = workspace.indexOf("{mode === 'view' ? (");
  const editFooterEnd = workspace.indexOf('</footer>', workspace.indexOf('</footer>', viewFooterStart) + 1);
  const footers = workspace.slice(viewFooterStart, editFooterEnd);

  assert.ok(headerStart >= 0 && headerEnd > headerStart);
  assert.doesNotMatch(header, /t\.admin\.editTemplate|t\.admin\.preview|t\.admin\.sendTest/);
  assert.match(footers, /t\.admin\.preview[\s\S]*t\.admin\.sendTest[\s\S]*t\.admin\.editTemplate/);
  assert.match(footers, /shrink-0[\s\S]*border-t/);
  assert.match(footers, /mode === 'view'/);
  assert.match(footers, /type="submit" form=\{formId\}/);
});

test('view footer uses one generic grouped icon control without changing action behavior', async () => {
  const [workspace, groupedButton, buttonGroup, tooltip] = await Promise.all([
    readFile(workspaceUrl, 'utf8'),
    readFile(groupedButtonUrl, 'utf8'),
    readFile(buttonGroupUrl, 'utf8'),
    readFile(tooltipUrl, 'utf8'),
  ]);

  const viewFooterStart = workspace.indexOf("{mode === 'view' ? (");
  const viewFooterEnd = workspace.indexOf('</footer>', viewFooterStart);
  const viewFooter = workspace.slice(viewFooterStart, viewFooterEnd);

  assert.match(viewFooter, /<GroupedButton actions=\{\[/);
  assert.match(viewFooter, /id: 'preview'[\s\S]*id: 'send-test'[\s\S]*id: 'edit'/);
  assert.match(viewFooter, /setPreviewOpen\(true\); onPreview\(\);/);
  assert.match(viewFooter, /onClick: onSendTest/);
  assert.match(viewFooter, /onModeChange\('edit'\)/);
  assert.match(viewFooter, /loading: busy === 'preview'/);
  assert.match(viewFooter, /loading: busy === 'test'/);
  assert.match(viewFooter, /disabled: !canManage \|\| Boolean\(busy\)/);
  assert.doesNotMatch(viewFooter, /<LoadingButton|>\{t\.admin\.(preview|sendTest|editTemplate)\}<\/Button>/);

  assert.match(groupedButton, /export function GroupedButton/);
  assert.match(groupedButton, /actions: GroupedButtonAction\[\]/);
  assert.match(groupedButton, /<ButtonGroup/);
  assert.match(groupedButton, /aria-label=\{action\.ariaLabel \?\? action\.label\}/);
  assert.match(groupedButton, /<TooltipContent side="top">\{action\.label\}<\/TooltipContent>/);
  assert.match(groupedButton, /action\.loading \? <LoaderCircle/);
  assert.match(groupedButton, /action\.destructive/);
  assert.doesNotMatch(groupedButton, /preview|send-test|template|notification/i);
  assert.match(buttonGroup, /inline-flex[\s\S]*rounded-xl[\s\S]*border/);
  assert.match(tooltip, /group-hover\/tooltip:opacity-100/);
  assert.match(tooltip, /group-focus-within\/tooltip:opacity-100/);
});

test('template tokens share a collapsed copy-only component with safe feedback', async () => {
  const [page, workspace, tokens] = await Promise.all([
    readFile(pageUrl, 'utf8'),
    readFile(workspaceUrl, 'utf8'),
    readFile(tokenCollapsibleUrl, 'utf8'),
  ]);

  assert.match(workspace, /<TemplateTokenCollapsible key=\{draft\.id\}/);
  assert.match(workspace, /draft\.placeholders\.map\(\(placeholder\) => \(\{ value: `\{\{\$\{placeholder\}\}\}` \}\)\)/);
  assert.match(page, /<TemplateTokenCollapsible key=\{`email-template-variables-/);
  assert.match(page, /selectedTemplate\.variables\.map\(\(variable\) => \(\{ value: `\{\{\$\{variable\}\}\}` \}\)\)/);
  assert.match(tokens, /useState\(false\)/);
  assert.match(tokens, /aria-expanded=\{open\}/);
  assert.match(tokens, /tokens\.length/);
  assert.match(tokens, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(tokens, /setCopiedValue\(value\)/);
  assert.match(tokens, /clearTimeout\(resetTimerRef\.current\)/);
  assert.match(tokens, /toast\.error\(copyFailedLabel\)/);
  assert.match(tokens, /truncate[\s\S]*title=\{token\.value\}/);
  assert.doesNotMatch(tokens, /setTemplateDraft|setEmailTemplateDraft/);
});

test('dirty switching, mobile navigation, and email isolation remain explicit', async () => {
  const [page, workspace] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(workspaceUrl, 'utf8')]);

  assert.match(page, /window\.confirm\(t\.admin\.unsavedTemplateSwitch\)/);
  assert.match(page, /window\.addEventListener\('beforeunload', preventUnload\)/);
  assert.match(page, /setNotificationTemplateMobileView\('detail'\)/);
  assert.match(page, /setNotificationTemplateMobileView\('table'\)/);
  assert.match(workspace, /mobileView === 'table' \? 'list' : 'detail'/);
  assert.match(workspace, /backToAutomationNotificationTemplates/);
  assert.match(page, /activeTemplateGroup === 'email' && <Card/);
  assert.match(page, /previewEmailTemplate/);
  assert.match(page, /setTemplateChannel\('email'\)/);
});

test('new workspace labels and states are bilingual', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');

  for (const copy of [
    'Search automation notification templates...',
    'Automation notification details',
    'Edit automation notification template',
    'No automation notification templates match your search.',
    'Placeholders available for this template.',
    'No placeholders available.',
    'Could not copy the template token.',
    'Rechercher des modèles de notification d’automatisation...',
    'Détails de la notification d’automatisation',
    'Modifier le modèle de notification d’automatisation',
    'Aucun modèle de notification d’automatisation ne correspond à votre recherche.',
    'Espaces réservés disponibles pour ce modèle.',
    'Aucun espace réservé disponible.',
    'Impossible de copier le jeton du modèle.',
  ]) {
    assert.match(i18n, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('template examples use Exaud and template API errors are normalized', async () => {
  const [page, i18n] = await Promise.all([readFile(pageUrl, 'utf8'), readFile(i18nUrl, 'utf8')]);

  assert.match(page, /userFacingApiError\(error, t\.admin\.couldNotSaveTemplate\)/);
  assert.match(page, /userFacingApiError\(error, sendTest \? t\.admin\.couldNotSendTest : t\.admin\.couldNotPreviewTemplate\)/);
  assert.doesNotMatch(page, /toast\.error\(error instanceof Error \? error\.message/);
  assert.match(i18n, /templatePreviewValues: \{ memberName: 'Exaud'/);
  assert.match(i18n, /passportTemplatePreviewValues: \{ memberName: 'Exaud'/);
  assert.doesNotMatch(i18n, /Nadia Chen/);
});
