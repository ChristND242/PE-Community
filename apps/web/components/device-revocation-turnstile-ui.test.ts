import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const settingsUrl = new URL('../app/dashboard/settings/page.tsx', import.meta.url);
const captchaUrl = new URL('./registration-captcha.tsx', import.meta.url);
const uiUrl = new URL('./ui.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('device revocation uses a localized application confirmation boundary', async () => {
  const [settings, ui, i18n] = await Promise.all([
    readFile(settingsUrl, 'utf8'),
    readFile(uiUrl, 'utf8'),
    readFile(i18nUrl, 'utf8'),
  ]);
  const revokeFlow = settings.slice(settings.indexOf('function requestDeviceRevocation'), settings.indexOf('async function renameDevice'));

  assert.doesNotMatch(revokeFlow, /window\.(confirm|alert)/);
  assert.match(revokeFlow, /setRevokeTarget\(device\)/);
  assert.match(revokeFlow, /deviceRevocationInFlight\.current/);
  assert.match(revokeFlow, /await apiFetch\(`\/chat\/devices\/\$\{device\.id\}\/revoke`/);
  assert.match(revokeFlow, /await loadDevices\(devicePage\)/);
  assert.match(revokeFlow, /setRevokeTarget\(null\)/);
  assert.match(settings, /<ConfirmDialog[\s\S]*open=\{Boolean\(revokeTarget\)\}/);
  assert.match(settings, /loadingLabel=\{t\.security\.revokingDevice\}/);
  assert.match(settings, /if \(!deviceRevocationInFlight\.current\) setRevokeTarget\(null\)/);
  assert.equal((i18n.match(/revokeDeviceConfirmTitle:/g) ?? []).length, 2);
  assert.match(i18n, /Revoke this device\?/);
  assert.match(i18n, /Révoquer cet appareil \?/);

  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /aria-labelledby=\{titleId\}/);
  assert.match(ui, /aria-describedby=\{descriptionId\}/);
  assert.match(ui, /event\.key === 'Escape'/);
  assert.match(ui, /event\.key !== 'Tab'/);
  assert.match(ui, /previousFocusRef\.current\?\.focus\(\)/);
});

test('registration CAPTCHA keeps provider behavior in a compact undecorated field', async () => {
  const captcha = await readFile(captchaUrl, 'utf8');
  const rendering = captcha.slice(captcha.indexOf('return ('), captcha.indexOf('function ensureProviderScript'));

  assert.match(captcha, /window\.turnstile\.render/);
  assert.match(captcha, /'expired-callback': expire/);
  assert.match(captcha, /action: security\.action \?\? undefined/);
  assert.match(captcha, /onToken\(''\)/);
  assert.match(rendering, /data-registration-captcha/);
  assert.match(rendering, /max-w-\[300px\]/);
  assert.match(rendering, /min-h-\[65px\]/);
  assert.match(rendering, /!widgetRendered && status === 'loading'/);
  assert.match(rendering, /status === 'error'.*role="status"/s);
  assert.doesNotMatch(rendering, /border border-white\/10/);
  assert.doesNotMatch(rendering, /bg-black\/15/);
  assert.doesNotMatch(rendering, /shadow/);
  assert.doesNotMatch(rendering, /checkbox/i);
});
