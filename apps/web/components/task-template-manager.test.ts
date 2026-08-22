import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const managerUrl = new URL('./task-template-manager.tsx', import.meta.url);
const pageUrl = new URL('../app/admin/task-boards/page.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('task templates use an independent real-data table and selected detail pane', async () => {
  const [manager, page] = await Promise.all([
    readFile(managerUrl, 'utf8'),
    readFile(pageUrl, 'utf8'),
  ]);

  assert.match(manager, /<TaskBoardMasterDetailWorkspace/);
  assert.match(manager, /testId="task-templates"/);
  assert.match(manager, /<table className=/);
  assert.match(manager, /t\.admin\.taskTemplateColumn/);
  assert.match(manager, /t\.admin\.templateItems/);
  assert.match(manager, /t\.common\.status/);
  assert.match(manager, /t\.admin\.updated/);
  assert.match(manager, /aria-selected=\{selected\}/);
  assert.match(manager, /selectedTemplateId === template\.id/);
  assert.match(page, /selectedTemplateTab === 'automation-presets'/);
});

test('task template inline view, edit, and create preserve current mutation contracts', async () => {
  const manager = await readFile(managerUrl, 'utf8');

  assert.match(manager, /type TaskTemplateDetailMode = 'view' \| 'edit' \| 'create'/);
  assert.doesNotMatch(manager, /createPortal|role="dialog" aria-modal="true"/);
  assert.match(manager, /method: mode === 'edit' \? 'PATCH' : 'POST'/);
  assert.match(manager, /description: form\.description \|\| null/);
  assert.match(manager, /dueOffsetDays: item\.dueOffsetDays === '' \? null : Number/);
  assert.match(manager, /method: 'DELETE'/);
  assert.match(manager, /open=\{Boolean\(archiveTemplate\)\}/);
  assert.match(manager, /setSelectedTemplateId\(saved\.id\)/);
});

test('task template forms have fixed containment, validation, dirty protection, and mobile fallback', async () => {
  const manager = await readFile(managerUrl, 'utf8');

  assert.match(manager, /flex h-full min-h-0 flex-col overflow-hidden/);
  assert.match(manager, /chat-scrollbar min-h-0 flex-1 overflow-y-auto/);
  assert.match(manager, /<footer className="flex shrink-0/);
  assert.match(manager, /disabled=\{!dirty \|\| !valid\}/);
  assert.match(manager, /validateTemplateForm\(form, t\)/);
  assert.match(manager, /setFormError\(t\.admin\.taskTemplateMutationFailed\)/);
  assert.match(manager, /requestDiscard\(restoreView\)/);
  assert.match(manager, /open=\{Boolean\(discardAction\)\}/);
  assert.match(manager, /mode === 'view' \? setMobileView\('list'\) : cancelForm\(\)/);
  assert.match(manager, /window\.addEventListener\('beforeunload'/);
  assert.match(manager, /`task-template-\$\{mode\}-\$\{selectedTemplateId \?\? 'new'\}-\$\{mobile \? 'mobile' : 'desktop'\}`/);
  assert.match(manager, /<form[\s\S]*id=\{formId\}[\s\S]*onSubmit=/);
  assert.match(manager, /type="submit"[\s\S]*form=\{formId\}/);
  assert.equal((manager.match(/<form/g) ?? []).length, 1);
  assert.equal((manager.match(/<\/form>/g) ?? []).length, 1);
  assert.match(manager, /mt-3 grid min-w-0 gap-3/);
});

test('task template copy is bilingual and no unsupported creator or demo field is invented', async () => {
  const [manager, i18n] = await Promise.all([
    readFile(managerUrl, 'utf8'),
    readFile(i18nUrl, 'utf8'),
  ]);

  for (const copy of [
    'Search task templates...',
    'Select a task template',
    'Resize task template panes',
    'Rechercher des modèles de tâches...',
    'Sélectionner un modèle de tâches',
    'Redimensionner les volets des modèles de tâches',
  ]) {
    assert.match(i18n, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(manager, /createdBy|customer|ecommerce|January|February/i);
  assert.doesNotMatch(manager, /fetch\(/);
  assert.match(manager, /apiFetch<TaskTemplate\[\]>/);
  assert.match(manager, /apiFetch<TaskTemplate>/);
});
