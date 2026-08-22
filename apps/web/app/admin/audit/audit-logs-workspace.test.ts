import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../../../../..');
const page = readFileSync(join(root, 'apps/web/app/admin/audit/logs/page.tsx'), 'utf8');
const shell = readFileSync(join(root, 'apps/web/components/shell.tsx'), 'utf8');
const select = readFileSync(join(root, 'apps/web/components/app-select.tsx'), 'utf8');
const i18n = readFileSync(join(root, 'apps/web/lib/i18n.tsx'), 'utf8');

test('Audit navigation is permission-gated and routes to the Logs workspace', () => {
  assert.match(shell, /PERMISSIONS\.auditLogsRead/);
  assert.match(shell, /href: '\/admin\/audit\/logs'/);
});

test('audit selection and filters are URL-backed while data remains server-filtered', () => {
  assert.match(page, /params\.get\('logId'\)/);
  assert.match(page, /window\.history\[mode === 'push'/);
  assert.match(page, /addEventListener\('popstate'/);
  assert.match(page, /audit-logs\?\$\{params\}/);
  assert.match(page, /pageSize: \[10, 20, 50\]/);
});

test('audit workspace renders projected sections and no mutation request', () => {
  assert.match(page, /auditLogsRequestContext/);
  assert.match(page, /auditLogsApprovedMetadata/);
  assert.doesNotMatch(page, /method:\s*'(POST|PATCH|PUT|DELETE)'/);
  assert.doesNotMatch(page, /JSON\.stringify\(detail/);
});

test('audit rows use the centralized compact current-user avatar with safe fallbacks', () => {
  assert.match(page, /<ProfilePhoto name=\{auditActorAvatarName\(item\.actor\)\} avatarUrl=\{auditUserAvatarValue\(item\.actor, 'avatarUrl'\)\} dicebearStyle=\{auditUserAvatarValue\(item\.actor, 'dicebearStyle'\)\} dicebearSeed=\{auditUserAvatarValue\(item\.actor, 'dicebearSeed'\)\}/);
  assert.match(page, /className="h-6 w-6 rounded-full/);
  assert.match(page, /actor\.type\?\.toUpperCase\(\) === 'USER' \? actor\[field\] \?\? null : null/);
  assert.match(page, /actor\.type\?\.toUpperCase\(\) === 'SYSTEM' \? 'S'/);
  assert.match(page, /actor\.name \|\| 'User'/);
  assert.doesNotMatch(page, /\/users\/\$\{item\.actor\.id\}/);
});

test('audit filters provide localized labels and a readable long-action menu', () => {
  assert.match(page, /auditLogsAllCategories/);
  assert.match(page, /auditLogsAllActions/);
  assert.match(page, /displayLabel=\{\(action\) => actionLabel\(action, t\)\}/);
  assert.match(page, /menuWidth=\{360\} wrapOptions/);
  assert.match(select, /window\.innerWidth - 16/);
  assert.match(select, /\[scrollbar-gutter:stable\]/);
  assert.match(select, /whitespace-normal break-words leading-5/);
  for (const label of ['All categories', 'All actions', 'All actors', 'Toutes les catégories', 'Toutes les actions', 'Tous les acteurs']) {
    assert.match(i18n, new RegExp(label));
  }
});
