import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const chatWorkspaceUrl = new URL('./chat-workspace.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('restore-required status is the single recovery popup trigger', async () => {
  const source = await readFile(chatWorkspaceUrl, 'utf8');

  assert.match(source, /keyStatus === 'restore-required' \? \(\s*<button/);
  assert.match(source, /ref=\{recoveryTriggerRef\}/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /aria-expanded=\{recoveryPopupOpen\}/);
  assert.match(source, /onClick=\{\(\) => setRecoveryPopupOpen\(\(open\) => !open\)\}/);
  assert.equal((source.match(/t\.chat\.restoreEncryptedChatDescription/g) ?? []).length, 1);
  assert.doesNotMatch(source, /border-amber-300\/20 bg-amber-300\/\[0\.07\]/);
});

test('identity creation opens an application confirmation before rotation', async () => {
  const source = await readFile(chatWorkspaceUrl, 'utf8');

  assert.match(source, /function openRecoveryRestoreFlow\(\) \{\s*closeRecoveryPopup\(false\);\s*openKeyBackup\('import'\);/);
  assert.match(source, /function openRecoveryIdentityFlow\(\) \{\s*setIdentityConfirmationOpen\(true\);/);
  assert.doesNotMatch(source.slice(source.indexOf('async function rotateChatIdentity()'), source.indexOf('async function refreshChat()')), /window\.confirm/);
  assert.match(source, /onRestore=\{openRecoveryRestoreFlow\}/);
  assert.match(source, /onCreateIdentity=\{openRecoveryIdentityFlow\}/);
  assert.match(source, /onConfirmIdentity=\{\(\) => void rotateChatIdentity\(\)\}/);
  assert.match(source, /disabled=\{busy\}/);
});

test('confirmation cancel returns to recovery without invoking rotation', async () => {
  const source = await readFile(chatWorkspaceUrl, 'utf8');

  assert.match(source, /function cancelRecoveryIdentityFlow\(\) \{\s*if \(keyStatus === 'rotating'\) return;\s*setIdentityConfirmationOpen\(false\);/);
  assert.match(source, /confirmingIdentity \? \(/);
  assert.match(source, /onClick=\{onCancelIdentity\}/);
  assert.match(source, /else if \(wasConfirming\) createIdentityButtonRef\.current\?\.focus\(\)/);
});

test('rotation is single-flight, pending-safe, retryable, and uses localized feedback', async () => {
  const source = await readFile(chatWorkspaceUrl, 'utf8');
  const rotation = source.slice(source.indexOf('async function rotateChatIdentity()'), source.indexOf('async function refreshChat()'));

  assert.match(rotation, /identityRotationInFlightRef\.current/);
  assert.match(rotation, /identityRotationInFlightRef\.current = true/);
  assert.match(rotation, /identityRotationInFlightRef\.current = false/);
  assert.match(rotation, /setKeyStatus\('restore-required'\)/);
  assert.match(rotation, /toast\.success\(t\.chat\.newIdentityCreated\)/);
  assert.match(rotation, /toast\.error\(t\.chat\.newIdentityFailed\)/);
  assert.match(source, /busy \? t\.chat\.creatingNewIdentity : t\.chat\.createNewIdentityConfirmAction/);
});

test('recovery popup is compact, labelled, keyboard dismissible, and focus managed', async () => {
  const source = await readFile(chatWorkspaceUrl, 'utf8');

  assert.match(source, /function ChatRecoveryDialog/);
  assert.match(source, /return createPortal\(/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby=\{confirmingIdentity \? 'chat-identity-confirmation-title' : 'chat-recovery-popup-title'\}/);
  assert.match(source, /aria-describedby=\{confirmingIdentity \? 'chat-identity-confirmation-description' : 'chat-recovery-popup-description'\}/);
  assert.match(source, /if \(event\.key !== 'Escape'\) return;/);
  assert.match(source, /if \(busyRef\.current\) return;/);
  assert.match(source, /if \(confirmingIdentityRef\.current\) onCancelIdentityRef\.current\(\)/);
  assert.match(source, /restoreButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /cancelIdentityButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /createIdentityButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /recoveryTriggerRef\.current\?\.focus\(\)/);
  assert.match(source, /max-w-\[27rem\]/);
  assert.match(source, /grid gap-2/);
});

test('recovery copy remains localized with matching EN and FR structures', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');

  assert.equal((i18n.match(/restoreEncryptedChat:/g) ?? []).length, 2);
  assert.equal((i18n.match(/restoreEncryptedChatDescription:/g) ?? []).length, 2);
  assert.equal((i18n.match(/createNewIdentity:/g) ?? []).length, 2);
  assert.equal((i18n.match(/createNewIdentityConfirmTitle:/g) ?? []).length, 2);
  assert.equal((i18n.match(/createNewIdentityConfirmDescription:/g) ?? []).length, 2);
  assert.equal((i18n.match(/createNewIdentityConfirmAction:/g) ?? []).length, 2);
  assert.match(i18n, /Create a new encryption identity\?/);
  assert.match(i18n, /Créer une nouvelle identité de chiffrement \?/);
  assert.match(i18n, /Unable to create a new encryption identity\./);
  assert.match(i18n, /Impossible de créer une nouvelle identité de chiffrement\./);
});

test('conversation workspace remains the direct flex child after header feedback', async () => {
  const source = await readFile(chatWorkspaceUrl, 'utf8');

  assert.match(source, /<header[\s\S]*<\/header>\s*\{error \? \(/);
  assert.match(source, /<section className="grid min-h-0 flex-1 overflow-hidden/);
  assert.doesNotMatch(source, /apiFetch\(['"]\/chat\/keys\/(?:restore|rotate)[^'"]*['"]\)[\s\S]*ChatRecoveryDialog/);
});
