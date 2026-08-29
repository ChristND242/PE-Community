import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { browserSupportsConditionalPasskeyAuthentication } from '../lib/passkey-authentication';

const componentUrl = new URL('./passkey-settings-card.tsx', import.meta.url);
const loginUrl = new URL('../app/login/page.tsx', import.meta.url);
const profileTabsUrl = new URL('./profile-account-security.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);
const passkeyAuthenticationUrl = new URL('../lib/passkey-authentication.ts', import.meta.url);
const stepUpDialogUrl = new URL('./step-up-authentication-dialog.tsx', import.meta.url);
const twoFactorUrl = new URL('./two-factor-card.tsx', import.meta.url);
const adminMemberUrl = new URL('../app/admin/members/[id]/page.tsx', import.meta.url);
const adminRolesUrl = new URL('../app/admin/roles/page.tsx', import.meta.url);
const changePasswordUrl = new URL('../app/change-password/page.tsx', import.meta.url);

test('Passkeys security tab is shared by member and administrator profile security', async () => {
  const tabs = await readFile(profileTabsUrl, 'utf8');
  assert.match(tabs, /'passkeys'/);
  assert.match(tabs, /label: t\.security\.passkeys/);
});

test('enrollment is explicit, feature-detected, and uses only WebAuthn registration', async () => {
  const source = await readFile(componentUrl, 'utf8');
  assert.match(source, /browserSupportsWebAuthn\(\)/);
  assert.match(source, /startRegistration\(\{ optionsJSON: registration\.options \}\)/);
  assert.match(source, /\/auth\/passkeys\/registration\/options/);
  assert.match(source, /\/auth\/passkeys\/registration\/verify/);
  assert.doesNotMatch(source, /startAuthentication|navigator\.credentials\.get|useAutoRegister/);
});

test('multiple passkeys, rename, step-up protected removal, and last-passkey warning are rendered', async () => {
  const source = await readFile(componentUrl, 'utf8');
  assert.match(source, /passkeys\.map/);
  assert.match(source, /method: 'PATCH'/);
  assert.match(source, /method: 'DELETE'/);
  assert.match(source, /stepUp\.run\(\(\) => apiFetch/);
  assert.doesNotMatch(source, /currentPassword: removePassword/);
  assert.match(source, /passkeys\.length === 1 \? t\.security\.removeLastPasskeyWarning/);
});

test('shared step-up dialog supports explicit passkey or password and retries only the retained action', async () => {
  const source = await readFile(stepUpDialogUrl, 'utf8');
  assert.match(source, /startAuthentication\(\{ optionsJSON: authentication\.options, useBrowserAutofill: false \}\)/);
  assert.match(source, /\/auth\/step-up\/passkey\/options/);
  assert.match(source, /\/auth\/step-up\/passkey\/verify/);
  assert.match(source, /\/auth\/step-up\/password/);
  assert.match(source, /pendingRef\.current = null/);
  assert.equal((source.match(/const result = await pending\.run\(\)/g) ?? []).length, 1);
  assert.match(source, /StepUpCancelledError/);
  assert.match(source, /if \(!isWebAuthnCancellation\(caught\)\)/);
});

test('sensitive account and administrator flows use the shared controlled step-up retry', async () => {
  const [profile, passkeys, twoFactor, adminMember, adminRoles, forcedPassword] = await Promise.all([
    readFile(profileTabsUrl, 'utf8'),
    readFile(componentUrl, 'utf8'),
    readFile(twoFactorUrl, 'utf8'),
    readFile(adminMemberUrl, 'utf8'),
    readFile(adminRolesUrl, 'utf8'),
    readFile(changePasswordUrl, 'utf8'),
  ]);
  assert.ok((profile.match(/stepUp\.run/g) ?? []).length >= 2);
  assert.ok((passkeys.match(/stepUp\.run/g) ?? []).length >= 2);
  assert.ok((twoFactor.match(/stepUp\.run/g) ?? []).length >= 4);
  assert.ok((adminMember.match(/stepUp\.run/g) ?? []).length >= 4);
  assert.match(adminRoles, /stepUp\.run/);
  assert.match(forcedPassword, /stepUp\.run/);
});

test('step-up copy is present in equivalent English and French forms', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');
  for (const key of ['verifyIdentity', 'stepUpDescription', 'continueWithPasskey', 'verifyingIdentity', 'stepUpFailed', 'stepUpExpired']) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2);
  }
});

test('cancellation and unsupported browser states are localized in English and French', async () => {
  const [source, i18n] = await Promise.all([readFile(componentUrl, 'utf8'), readFile(i18nUrl, 'utf8')]);
  assert.match(source, /ERROR_CEREMONY_ABORTED/);
  assert.match(source, /NotAllowedError/);
  assert.equal((i18n.match(/passkeysUnsupported:/g) ?? []).length, 2);
  assert.equal((i18n.match(/passkeySetupCancelled:/g) ?? []).length, 2);
  assert.equal((i18n.match(/removeLastPasskeyWarning:/g) ?? []).length, 2);
});

test('conditional passkey capability detection fails quietly unless both capabilities exist', async () => {
  let autofillChecks = 0;
  assert.equal(await browserSupportsConditionalPasskeyAuthentication({
    webAuthn: () => false,
    autofill: async () => { autofillChecks += 1; return true; },
  }), false);
  assert.equal(autofillChecks, 0);
  assert.equal(await browserSupportsConditionalPasskeyAuthentication({
    webAuthn: () => true,
    autofill: async () => false,
  }), false);
  assert.equal(await browserSupportsConditionalPasskeyAuthentication({
    webAuthn: () => true,
    autofill: async () => true,
  }), true);
});

test('login offers explicit and conditional usernameless passkey authentication through one completion path', async () => {
  const [source, helper] = await Promise.all([readFile(loginUrl, 'utf8'), readFile(passkeyAuthenticationUrl, 'utf8')]);
  assert.match(source, /browserSupportsWebAuthn\(\)/);
  assert.match(source, /browserSupportsConditionalPasskeyAuthentication\(\)/);
  assert.match(source, /\/auth\/passkeys\/authentication\/options/);
  assert.match(source, /startAuthentication\(\{ optionsJSON: options, useBrowserAutofill \}\)/);
  assert.match(source, /beginPasskeyAuthentication\(true, authenticationAbort\.signal\)/);
  assert.match(source, /beginPasskeyAuthentication\(false\)/);
  assert.match(source, /\/auth\/passkeys\/authentication\/verify/);
  assert.match(source, /body: JSON\.stringify\(\{ attemptId, response \}\)/);
  assert.equal((source.match(/async function finishPasskeyAuthentication/g) ?? []).length, 1);
  assert.match(source, /redirectAfterLogin\(user\)/);
  assert.match(helper, /ERROR_CEREMONY_ABORTED/);
  assert.match(helper, /NotAllowedError/);
});

test('conditional UI uses the correct autocomplete contract and remains non-blocking', async () => {
  const source = await readFile(loginUrl, 'utf8');
  const passwordForm = source.slice(source.indexOf('<form action={submit}'), source.indexOf('</form>', source.indexOf('<form action={submit}')));
  assert.match(passwordForm, /autoComplete="username webauthn"/);
  assert.match(passwordForm, /autoComplete="current-password"/);
  assert.doesNotMatch(passwordForm, /disabled=\{passkeyLoading|disabled=\{conditional/);
  assert.doesNotMatch(source, /setPasskeyLoading\(true\)[\s\S]*beginPasskeyAuthentication\(true/);
});

test('conditional cleanup prevents races and ignores background cancellation', async () => {
  const source = await readFile(loginUrl, 'utf8');
  assert.match(source, /conditionalAuthenticationAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /WebAuthnAbortService\.cancelCeremony\(\)/);
  assert.match(source, /if \(!conditionalAuthenticationActiveRef\.current \|\| isPasskeyAuthenticationCancellation\(caught\)\) return/);
  assert.match(source, /if \(assertionSelected\) setError\(t\.security\.passkeySignInFailed\)/);
  assert.match(source, /finishPasskeyAuthentication\([\s\S]*authenticationAbort\.signal/);
  assert.match(source, /if \(signal\?\.aborted \|\| \(signal && !conditionalAuthenticationActiveRef\.current\)\) return/);
  assert.match(source, /async function submit\([\s\S]*cancelConditionalAuthentication\(\)/);
  assert.match(source, /async function signInWithPasskey\([\s\S]*cancelConditionalAuthentication\(\)/);
});
