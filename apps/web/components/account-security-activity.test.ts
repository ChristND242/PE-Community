import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ApiRequestError, isApiRequestError } from '../lib/api';

const component = readFileSync(new URL('./account-security-activity.tsx', import.meta.url), 'utf8');
const profileTabs = readFileSync(new URL('./profile-account-security.tsx', import.meta.url), 'utf8');

test('account security UI lists bounded sessions/activity without exposing session secrets', () => {
  assert.match(component, /apiFetch<\{ sessions: AccountSession\[\] \}>\('\/auth\/sessions'\)/);
  assert.match(component, /security-activity\?page=\$\{requestedPage\}&pageSize=10/);
  assert.match(component, /session\.ipAddress/);
  assert.match(component, /session\.country/);
  assert.match(component, /break-all font-mono/);
  assert.doesNotMatch(component, /tokenHash|sessionToken|rawUserAgent/);
});

test('session revocation reuses the shared Phase 4 step-up flow', () => {
  assert.match(component, /useStepUpAuthentication/);
  assert.match(component, /\{stepUp\.dialog\}/);
  assert.match(component, /await stepUp\.run\(async \(\) =>/);
  assert.match(component, /await apiFetch\(path, \{ method: 'DELETE' \}\)/);
  assert.match(component, /\/auth\/sessions\/others/);
  assert.match(component, /encodeURIComponent\(session\.id\)/);
});

test('revocation loading is scoped to each actual request and pending step-up blocks duplicate clicks', () => {
  assert.match(component, /revokePendingRef\.current/);
  assert.match(component, /if \(revokePendingRef\.current\) return/);
  assert.match(component, /setBusy\(busyKey\)[\s\S]*await apiFetch\(path, \{ method: 'DELETE' \}\)[\s\S]*finally \{\s*setBusy\(''\)/);
  assert.match(component, /revokePendingRef\.current = false/);
  assert.match(component, /setRevokePending\(false\)/);
  assert.ok((component.match(/disabled=\{revokePending\}/g) ?? []).length >= 2);
  assert.match(component, /disabled=\{!otherSessionCount \|\| revokePending\}/);
});

test('step-up detection requires the structured 403 response code', () => {
  assert.equal(isApiRequestError(new ApiRequestError(403, JSON.stringify({ code: 'STEP_UP_REQUIRED', message: 'localized text' })), 403, 'STEP_UP_REQUIRED'), true);
  assert.equal(isApiRequestError(new ApiRequestError(403, JSON.stringify({ code: 'FORBIDDEN', message: 'Verify your identity to continue.' })), 403, 'STEP_UP_REQUIRED'), false);
  assert.equal(isApiRequestError(new ApiRequestError(403, JSON.stringify({ message: 'STEP_UP_REQUIRED' })), 403, 'STEP_UP_REQUIRED'), false);
  assert.equal(isApiRequestError(new ApiRequestError(401, JSON.stringify({ code: 'STEP_UP_REQUIRED' })), 403, 'STEP_UP_REQUIRED'), false);
});

test('shared profile navigation exposes one sessions and activity tab', () => {
  assert.match(profileTabs, /'sessions'/);
  assert.match(profileTabs, /t\.security\.sessionsAndActivity/);
  assert.match(profileTabs, /MonitorSmartphone/);
});

test('security activity export offers only retained CSV timeframes and custom UTC dates', () => {
  assert.match(component, /t\.security\.exportLogs/);
  assert.match(component, /t\.security\.exportSecurityLogs/);
  for (const range of ["'7'", "'30'", "'90'", "'180'", "'custom'"]) assert.match(component, new RegExp(`value: ${range}`));
  assert.match(component, /option\.days <= retentionDays/);
  assert.match(component, /type="date"[\s\S]*min=\{minimumDate\}[\s\S]*max=\{maximumDate\}/);
  assert.match(component, /format: 'csv'/);
  assert.doesNotMatch(component, /PDF|format: 'json'|all time|1 year/i);
});

test('file export reuses controlled step-up and scopes loading to the actual download request', () => {
  assert.match(component, /const download = await stepUp\.run\(async \(\) =>/);
  assert.match(component, /setExportLoading\(true\)[\s\S]*apiDownload\(`\/auth\/security-activity\/export\?\$\{query\.toString\(\)\}`\)[\s\S]*finally \{\s*setExportLoading\(false\)/);
  assert.match(component, /isStepUpCancellation/);
  assert.match(component, /SECURITY_EXPORT_TOO_LARGE/);
  assert.match(component, /SECURITY_EXPORT_INVALID_RANGE/);
  assert.match(component, /revokePendingRef\.current/);
  assert.equal((component.match(/saveDownload\(download\.blob/g) ?? []).length, 1);
});

test('download helper parses structured errors before reading successful responses as blobs', () => {
  const api = readFileSync(new URL('../lib/api.ts', import.meta.url), 'utf8');
  const download = api.slice(api.indexOf('export async function apiDownload'), api.indexOf('export class ApiRequestError'));
  assert.match(download, /if \(!response\.ok\)/);
  assert.match(download, /throw new ApiRequestError\(response\.status, await response\.text\(\)\)/);
  assert.match(download, /blob: await response\.blob\(\)/);
  assert.ok(download.indexOf('response.text()') < download.indexOf('response.blob()'));
});

test('export copy is complete in English and French', () => {
  const i18n = readFileSync(new URL('../lib/i18n.tsx', import.meta.url), 'utf8');
  for (const key of ['exportLogs', 'exportSecurityLogs', 'timeRange', 'last7Days', 'last30Days', 'last90Days', 'last180Days', 'customRange', 'securityHistoryRetentionNotice']) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2);
  }
});
