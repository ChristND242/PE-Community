import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const i18nUrl = new URL('./i18n.tsx', import.meta.url);
const bootstrapUrl = new URL('./instance-bootstrap.ts', import.meta.url);
const setupServiceUrl = new URL('../../api/src/setup/setup.service.ts', import.meta.url);
const shellUrl = new URL('../components/shell.tsx', import.meta.url);

test('public setup status exposes only safe instance language defaults', async () => {
  const [bootstrap, setupService] = await Promise.all([
    readFile(bootstrapUrl, 'utf8'),
    readFile(setupServiceUrl, 'utf8'),
  ]);

  assert.match(setupService, /communitySettings\.findFirst/);
  assert.match(setupService, /defaultLanguage: settings\?\.defaultLanguage === 'fr' \? 'fr' : 'en'/);
  assert.match(setupService, /timezone: settings\?\.timezone \?\? 'UTC'/);
  assert.match(bootstrap, /defaultLanguage: body\.defaultLanguage === 'fr' \? 'fr' : 'en'/);
  assert.match(bootstrap, /catch \{[\s\S]*return null;/);
  assert.doesNotMatch(bootstrap, /smtp|secret|token|permission|user/i);
});

test('explicit browser language wins and server defaults are not persisted as user choices', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');
  const applyDefaults = i18n.slice(i18n.indexOf('const applyCommunityDefaults'), i18n.indexOf('useEffect(() =>', i18n.indexOf('const applyCommunityDefaults')));

  assert.match(i18n, /const explicitLanguage = source === 'user' \? saved : null/);
  assert.match(i18n, /const explicitLanguage = storedSource === 'user' \? languageValue\(storedLanguage\) : null/);
  assert.match(i18n, /return explicitLanguage \?\? languageValue\(communityLanguage\) \?\? 'en'/);
  assert.doesNotMatch(applyDefaults, /localStorage\.setItem\(langStorageKey/);
  assert.doesNotMatch(applyDefaults, /localStorage\.setItem\(langSourceStorageKey/);
  assert.match(i18n, /localStorage\.setItem\(langSourceStorageKey, 'user'\)/);
});

test('anonymous application routes resolve the instance bootstrap without a distribution mode', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');

  assert.match(i18n, /const defaults = user\?\.community as CommunityDefaults \| undefined/);
  assert.match(i18n, /if \(defaults\) applyCommunityDefaults\(defaults\)/);
  assert.match(i18n, /if \(!defaults\) \{[\s\S]*loadPublicInstanceBootstrap/);
  assert.doesNotMatch(i18n, /NEXT_PUBLIC_PUBLIC_SITE_MODE|APP_DISTRIBUTION/);
  assert.match(i18n, /finally \{[\s\S]*setLanguageReady\(true\)/);
  assert.match(i18n, /languageReady \? children/);
});

test('logout changes only the authenticated session and route, not language preference', async () => {
  const shell = await readFile(shellUrl, 'utf8');
  const logout = shell.slice(shell.indexOf('async function logout()'), shell.indexOf('useEffect(() =>', shell.indexOf('async function logout()')));

  assert.match(logout, /fetch\(apiUrl\('\/auth\/logout'\)/);
  assert.match(logout, /window\.location\.replace\('\/login'\)/);
  assert.doesNotMatch(logout, /localStorage|pe-lang|setLang/);
});
