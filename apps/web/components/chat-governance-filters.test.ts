import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const governanceSourceUrl = new URL('./chat-governance-tables.tsx', import.meta.url);
const selectSourceUrl = new URL('./app-select.tsx', import.meta.url);
const uiSourceUrl = new URL('./ui.tsx', import.meta.url);
const i18nSourceUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('chat governance filters use the Rows per page platform select primitive', async () => {
  const [governance, select, ui] = await Promise.all([
    readFile(governanceSourceUrl, 'utf8'),
    readFile(selectSourceUrl, 'utf8'),
    readFile(uiSourceUrl, 'utf8'),
  ]);

  assert.match(governance, /import \{ AppSelect \} from '\.\/app-select'/);
  assert.equal((governance.match(/<FilterSelect /g) ?? []).length, 6);
  assert.doesNotMatch(governance, /<select|<option/);
  assert.match(governance, /return <AppSelect value=\{value\} ariaLabel=\{label\}/);

  assert.match(ui, /<AppSelect value=\{pageSize\}/);
  assert.match(select, /createPortal\([\s\S]+document\.body/);
  assert.match(select, /role="listbox"/);
  assert.match(select, /role="option"/);
  assert.match(select, /aria-selected=\{active\}/);
  assert.match(select, /active && <Check/);
  assert.match(select, /event\.key === 'ArrowDown'/);
  assert.match(select, /event\.key === 'Escape'/);
});

test('chat governance filter values and pagination reset effects remain unchanged', async () => {
  const source = await readFile(governanceSourceUrl, 'utf8');

  for (const value of [
    "'ACTIVE'",
    "'REVOKED'",
    "'DESKTOP'",
    "'MOBILE'",
    "'TABLET'",
    "'UNKNOWN'",
    "'lastSeenAt'",
    "'createdAt'",
    "'displayName'",
    "'memberName'",
    "'IMAGE'",
    "'VIDEO'",
    "'AUDIO'",
    "'DOCUMENT'",
    "'OTHER'",
    "'PENDING_DELETION'",
    "'DELETING'",
    "'DELETED'",
    "'DELETE_FAILED'",
    "'encryptedSize'",
    "'mediaCategory'",
    "'lifecycleStatus'",
  ]) {
    assert.match(source, new RegExp(value));
  }

  assert.match(source, /setPage\(1\); \}, \[debouncedSearch, status, deviceType, sortBy\]/);
  assert.match(source, /setPage\(1\); \}, \[debouncedSearch, category, status, sortBy\]/);
  assert.match(source, /sortOrder: 'desc'/);
});

test('chat governance filter accessible labels are present in English and French', async () => {
  const source = await readFile(i18nSourceUrl, 'utf8');
  for (const key of [
    'filterChatDevicesByStatus',
    'filterChatDevicesByType',
    'sortChatDevices',
    'filterChatMediaByType',
    'filterChatMediaByStatus',
    'sortChatMedia',
  ]) {
    assert.equal((source.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2);
  }
});
