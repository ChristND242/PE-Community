import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const managerUrl = new URL('./automation-preset-manager.tsx', import.meta.url);
const pageUrl = new URL('../app/admin/task-boards/page.tsx', import.meta.url);
const taskTemplatesUrl = new URL('./task-template-manager.tsx', import.meta.url);
const workspaceUrl = new URL('./task-board-master-detail-workspace.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('presets use a real master-detail table while the secondary switcher and task templates remain isolated', async () => {
  const [manager, page, taskTemplates] = await Promise.all([
    readFile(managerUrl, 'utf8'),
    readFile(pageUrl, 'utf8'),
    readFile(taskTemplatesUrl, 'utf8'),
  ]);

  assert.match(page, /key: 'automation-presets', label: t\.admin\.automationPresets/);
  assert.match(page, /key: 'task-templates', label: t\.admin\.taskTemplates/);
  assert.match(page, /selectedTemplateTab === 'automation-presets'/);
  assert.match(page, /<AutomationPresetManager onDirtyChange=\{onWorkspaceDirtyChange\} \/>/);
  assert.match(page, /<TaskTemplateManager[\s\S]*onDirtyChange=\{onWorkspaceDirtyChange\}/);
  assert.match(page, /params\.get\('templateTab'\) === 'task-templates'/);
  assert.match(page, /params\.set\('templateTab', tab\)/);

  assert.match(manager, /<TaskBoardMasterDetailWorkspace/);
  assert.match(manager, /testId="automation-presets"/);
  assert.match(manager, /<table className=/);
  assert.match(manager, /t\.admin\.automationPresetColumn/);
  assert.match(manager, /t\.admin\.automationRules/);
  assert.match(manager, /t\.admin\.updated/);
  assert.match(manager, /t\.admin\.createdBy/);
  assert.doesNotMatch(taskTemplates, /data-automation-presets-(workspace|split-pane)/);
});

test('row selection, detail modes, preview, and archive preserve existing API contracts', async () => {
  const manager = await readFile(managerUrl, 'utf8');

  assert.match(manager, /onClick=\{\(\) => handleSelectPreset\(preset\.id\)\}/);
  assert.match(manager, /aria-selected=\{selected\}/);
  assert.match(manager, /bg-accent\/\[0\.09\] hover:bg-accent\/\[0\.11\]/);
  assert.match(manager, /setDetailMode\('edit'\)/);
  assert.match(manager, /setDetailMode\('apply'\)/);
  assert.doesNotMatch(manager, /createPortal|role="dialog" aria-modal="true"/);

  assert.match(manager, /method: 'PATCH'/);
  assert.match(manager, /description: editForm\.description \|\| null/);
  assert.match(manager, /automation-presets\/\$\{selectedPreset\.id\}\/preview/);
  assert.match(manager, /duplicateStrategy: 'SKIP_DUPLICATES'/);
  assert.match(manager, /applyMode/);
  assert.match(manager, /method: 'DELETE'/);
  assert.match(manager, /<ConfirmDialog/);
  assert.match(manager, /open=\{Boolean\(archivePreset\)\}/);
});

test('desktop resizing and mobile navigation are accessible and bounded', async () => {
  const [manager, workspace] = await Promise.all([
    readFile(managerUrl, 'utf8'),
    readFile(workspaceUrl, 'utf8'),
  ]);

  assert.match(workspace, /useState\(60\)/);
  assert.match(workspace, /Math\.min\(70, Math\.max\(42/);
  assert.match(workspace, /role="separator"/);
  assert.match(workspace, /aria-valuenow=\{Math\.round\(listPanePercent\)\}/);
  assert.match(workspace, /event\.key !== 'ArrowLeft' && event\.key !== 'ArrowRight'/);
  assert.match(workspace, /gridTemplateColumns: `\$\{listPanePercent\}% 12px minmax\(0, 1fr\)`/);
  assert.match(workspace, /mobileView === 'list' \? renderListPane\(true\) : renderDetailPane\(true\)/);
  assert.match(manager, /setMobileView\('detail'\)/);
  assert.match(manager, /setMobileView\('list'\)/);
  assert.match(manager, /t\.admin\.automationPresetBack/);
  assert.match(manager, /chat-scrollbar min-h-0 flex-1 overflow/);
});

test('preset edit containment, validation, fallback, and balanced apply action stay explicit', async () => {
  const [manager, page, workspace] = await Promise.all([
    readFile(managerUrl, 'utf8'),
    readFile(pageUrl, 'utf8'),
    readFile(workspaceUrl, 'utf8'),
  ]);

  assert.match(manager, /type DetailMode = 'view' \| 'edit' \| 'apply'/);
  assert.match(manager, /flex h-full min-h-0 flex-col overflow-hidden/);
  assert.match(manager, /chat-scrollbar min-h-0 flex-1 overflow-y-auto/);
  assert.match(manager, /<footer className="flex shrink-0/);
  assert.match(manager, /disabled=\{!editDirty \|\| !editValid\}/);
  assert.match(manager, /setEditMutationError\(t\.admin\.automationPresetSaveValidationFailed\)/);
  assert.match(manager, /requestDiscard\(resetToView\)/);
  assert.match(manager, /open=\{Boolean\(discardAction\)\}/);
  assert.match(manager, /h-10 min-w-\[9rem\][\s\S]*rounded-lg/);
  assert.match(manager, /`automation-preset-edit-\$\{selectedPreset\.id\}-\$\{mobile \? 'mobile' : 'desktop'\}`/);
  assert.match(manager, /<form[\s\S]*id=\{editFormId\}[\s\S]*onSubmit=/);
  assert.match(manager, /type="submit"[\s\S]*form=\{editFormId\}/);
  assert.equal((manager.match(/<form/g) ?? []).length, 1);
  assert.equal((manager.match(/<\/form>/g) ?? []).length, 1);
  assert.match(workspace, /h-full min-h-0 overflow-hidden md:hidden/);
  assert.equal(
    (workspace.match(/h-full min-h-0 min-w-0 overflow-hidden/g) ?? []).length,
    2,
  );
  assert.match(page, /templateWorkspaceDirty/);
  assert.match(page, /setPendingTemplateTab\(tab\)/);
});

test('preset workspace copy is bilingual and contains no reference demo data', async () => {
  const [manager, i18n] = await Promise.all([
    readFile(managerUrl, 'utf8'),
    readFile(i18nUrl, 'utf8'),
  ]);

  for (const copy of [
    'Search automation presets...',
    'Select a preset',
    'Resize automation preset panes',
    'Rechercher des préréglages d’automatisation...',
    'Sélectionner un préréglage',
    'Redimensionner les volets des préréglages d’automatisation',
  ]) {
    assert.match(i18n, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(manager, /customer|ecommerce|January|February/i);
  assert.doesNotMatch(manager, /fetch\(/);
  assert.match(manager, /apiFetch<\{ items: PresetListItem\[\] \}>/);
  assert.match(manager, /apiFetch<PresetDetail>/);
});
