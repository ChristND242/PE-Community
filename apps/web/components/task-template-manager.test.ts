import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveSelectMenuPosition } from './app-select';

const managerUrl = new URL('./task-template-manager.tsx', import.meta.url);
const selectUrl = new URL('./app-select.tsx', import.meta.url);
const eventTaskBoardUrl = new URL('../app/admin/events/[id]/event-task-board.tsx', import.meta.url);
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

test('task board priority menus share contained portal and collision positioning', async () => {
  const [manager, select, eventTaskBoard] = await Promise.all([
    readFile(managerUrl, 'utf8'),
    readFile(selectUrl, 'utf8'),
    readFile(eventTaskBoardUrl, 'utf8'),
  ]);

  assert.match(manager, /ref=\{mobile \? mobileEditorBoundaryRef : desktopEditorBoundaryRef\}/);
  assert.match(manager, /ref=\{mobile \? mobileEditorPortalRef : desktopEditorPortalRef\}/);
  assert.match(manager, /<TemplateFormBody[\s\S]*containedPositioning=\{\{/);
  assert.match(manager, /boundaryRef: mobile \? mobileEditorBoundaryRef : desktopEditorBoundaryRef/);
  assert.match(manager, /portalRef: mobile \? mobileEditorPortalRef : desktopEditorPortalRef/);
  assert.match(manager, /<AppSelect value=\{item\.priority\}[\s\S]*containedPositioning=\{containedPositioning\}/);
  assert.match(eventTaskBoard, /<AppSelect value=\{form\.priority\}[\s\S]*containedPositioning=\{\{ boundaryRef: taskDialogBoundaryRef, portalRef: taskDialogRootRef \}\}/);
  assert.match(select, /triggerRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(select, /containedPositioning\?\.boundaryRef\.current\?\.getBoundingClientRect\(\)/);
  assert.match(select, /containedPositioning\?\.portalRef\.current/);
  assert.doesNotMatch(manager, /collisionBoundaryRef/);
  assert.doesNotMatch(eventTaskBoard, /collisionBoundaryRef/);
});

test('contained select geometry aligns to the trigger, flips, clamps, and uses portal coordinates', () => {
  const portal = { top: 100, right: 900, bottom: 700, left: 200, width: 700, height: 600 };
  const boundary = { top: 160, right: 840, bottom: 650, left: 240, width: 600, height: 490 };
  const trigger = { top: 260, right: 500, bottom: 300, left: 320, width: 180, height: 40 };
  const below = resolveSelectMenuPosition({
    trigger,
    boundary,
    portal,
    viewportWidth: 1200,
    viewportHeight: 800,
    menuHeight: 120,
    requestedWidth: 180,
  });

  assert.equal(below.placement, 'bottom');
  assert.equal(below.style.left, 120);
  assert.equal(below.style.top, 208);
  assert.equal(below.style.width, 180);
  assert.equal(below.style.maxHeight, 334);

  const nearBottom = { ...trigger, top: 570, bottom: 610 };
  const above = resolveSelectMenuPosition({
    trigger: nearBottom,
    boundary,
    portal,
    viewportWidth: 1200,
    viewportHeight: 800,
    menuHeight: 120,
    requestedWidth: 720,
  });

  assert.equal(above.placement, 'top');
  assert.equal(above.style.top, 342);
  assert.equal(above.style.left, 48);
  assert.equal(above.style.width, 584);
  assert.equal(above.style.maxHeight, 394);
});

test('event task dialogs use a body portal with a full-viewport overlay below dialog content', async () => {
  const eventTaskBoard = await readFile(eventTaskBoardUrl, 'utf8');

  assert.match(eventTaskBoard, /createPortal\(/);
  assert.match(eventTaskBoard, /data-task-board-dialog-root className="fixed inset-0 z-\[70\] grid h-dvh/);
  assert.match(eventTaskBoard, /data-task-board-dialog-overlay[\s\S]*className="fixed inset-0 z-0/);
  assert.match(eventTaskBoard, /className="relative z-10[^"]*" role="dialog" aria-modal="true"/);
  assert.match(eventTaskBoard, /document\.body/);
  assert.doesNotMatch(eventTaskBoard, /<div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black\/70 p-4"/);
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
