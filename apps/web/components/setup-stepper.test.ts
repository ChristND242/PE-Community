import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSetupAvatarSeed, dicebearDataUri } from '../lib/avatar';

const setupUrl = new URL('../app/setup/page.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('setup uses exactly three ordered frontend-only steps and retains every existing field', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const stepDefinitions = [...setup.matchAll(/\{ id: '(community|owner|review)', number: (\d) \}/g)];

  assert.deepEqual(stepDefinitions.map((match) => [match[1], Number(match[2])]), [
    ['community', 1],
    ['owner', 2],
    ['review', 3],
  ]);

  for (const field of [
    'communityName',
    'communitySlug',
    'ownerFullName',
    'ownerEmail',
    'ownerPassword',
    'confirmPassword',
    'defaultLanguage',
    'timezone',
  ]) {
    assert.match(setup, new RegExp(`\\b${field}\\b`));
  }

  const forbiddenReferenceCopy = [
    ['User', 'Details'].join(' '),
    ['Workspace', 'setup'].join(' '),
    ['Network', 'setup'].join(' '),
    ['handle', 'Re', 'set'].join(''),
    ['Re', 'set'].join(''),
  ];
  for (const value of forbiddenReferenceCopy) assert.equal(setup.includes(value), false);
});

test('community and owner validation gate navigation while completed steps remain revisitable', async () => {
  const setup = await readFile(setupUrl, 'utf8');

  assert.match(setup, /function validateCommunityStep/);
  assert.match(setup, /function validateOwnerStep/);
  assert.match(setup, /if \(!validation\.valid\) return;/);
  assert.match(setup, /setHighestCompletedStepIndex\(\(current\) => Math\.max\(current, activeStepIndex\)\)/);
  assert.match(setup, /stepIndex > highestCompletedStepIndex/);
  assert.match(setup, /disabled=\{disabled \|\| \(!isActive && !isCompleted\)\}/);
  assert.match(setup, /focusField\(firstInvalidField\)/);
  assert.match(setup, /moveToStep\(activeStepIndex - 1\)/);
});

test('review is grouped from safe current values without rendering password or token values', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const review = setup.slice(setup.indexOf('function SetupReviewSummary'), setup.indexOf('function ReviewGroup'));

  assert.match(review, /form\.communityName/);
  assert.match(review, /form\.communitySlug/);
  assert.match(review, /form\.defaultLanguage/);
  assert.match(review, /form\.timezone/);
  assert.match(review, /form\.ownerFullName/);
  assert.match(review, /form\.ownerEmail/);
  assert.match(review, /t\.setup\.passwordConfigured/);
  assert.doesNotMatch(review, /form\.ownerPassword|form\.confirmPassword|setupToken|window\.location/);
});

test('only final initialization submits the existing fields once with the optional avatar extension', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const submit = setup.slice(setup.indexOf('async function handleSetupSubmit'), setup.indexOf('if (!status && !error)'));

  assert.equal((setup.match(/fetch\(apiUrl\('\/setup'\)/g) ?? []).length, 1);
  assert.match(setup, /type="submit"[\s\S]*t\.setup\.initializeCommunity/);
  assert.match(setup, /type="button"[\s\S]*onClick=\{handleContinue\}/);
  assert.match(submit, /if \(loading\) return;/);
  assert.match(submit, /const setupToken = new URLSearchParams\(window\.location\.search\)\.get\('token'\) \?\? undefined/);

  for (const payloadField of [
    "setupBody.append('communityName', form.communityName)",
    "setupBody.append('communitySlug', form.communitySlug)",
    "setupBody.append('ownerFullName', form.ownerFullName)",
    "setupBody.append('ownerEmail', form.ownerEmail)",
    "setupBody.append('ownerPassword', form.ownerPassword)",
    "setupBody.append('defaultLanguage', form.defaultLanguage)",
    "setupBody.append('timezone', form.timezone)",
  ]) {
    assert.match(submit, new RegExp(payloadField.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(submit, /router\.replace\('\/login\?setup=complete'\)/);
});

test('Step 1 contains only its fields without the removed installation callout', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const communityStep = setup.slice(setup.indexOf('function CommunityStep'), setup.indexOf('function OwnerStep'));

  assert.doesNotMatch(communityStep, /selfHostedInstallation|firstOwnerAccount|rounded-xl border border-accent/);
  assert.match(communityStep, /form\.communityName/);
  assert.match(communityStep, /form\.communitySlug/);
  assert.match(communityStep, /form\.defaultLanguage/);
  assert.match(communityStep, /form\.timezone/);
  assert.match(setup, /function validateCommunityStep/);
});

test('Owner avatar stays in memory until final setup and Review exposes no file details', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const review = setup.slice(setup.indexOf('function SetupReviewSummary'), setup.indexOf('function ReviewGroup'));

  assert.match(setup, /const \[ownerAvatarFile, setOwnerAvatarFile\] = useState<File \| null>\(null\)/);
  assert.match(setup, /URL\.revokeObjectURL/);
  assert.match(setup, /avatarUploadMimeTypes\.includes/);
  assert.match(setup, /file\.size > avatarUploadMaxBytes/);
  assert.match(setup, /canDecodeImage\(file\)/);
  assert.match(setup, /setupBody\.append\('ownerAvatar', ownerAvatarFile\)/);
  assert.doesNotMatch(setup, /localStorage.*ownerAvatar|sessionStorage.*ownerAvatar/);
  assert.match(review, /ownerAvatarMode === 'upload'/);
  assert.doesNotMatch(review, /ownerAvatarFile|file\.name|originalname|storage path/i);
});

test('generated Owner avatar uses stable explicit state instead of the mutable name field', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const updateField = setup.slice(setup.indexOf('function updateField'), setup.indexOf('function focusField'));
  const ownerAvatarField = setup.slice(setup.indexOf('function OwnerAvatarField'), setup.indexOf('function SetupReviewSummary'));
  const review = setup.slice(setup.indexOf('function SetupReviewSummary'), setup.indexOf('function ReviewGroup'));
  const submit = setup.slice(setup.indexOf('async function handleSetupSubmit'), setup.indexOf('if (!status && !error)'));

  assert.match(setup, /const \[ownerAvatarSeed, setOwnerAvatarSeed\] = useState\(\(\) => createSetupAvatarSeed\(''\)\)/);
  assert.doesNotMatch(updateField, /ownerAvatarSeed|setOwnerAvatarSeed|createSetupAvatarSeed/);
  assert.match(ownerAvatarField, /dicebearSeed=\{mode === 'generated' \? generatedSeed : undefined\}/);
  assert.doesNotMatch(ownerAvatarField, /dicebearSeed=.*\bname\b/);
  assert.match(review, /dicebearSeed=\{ownerAvatarMode === 'generated' \? ownerAvatarSeed : undefined\}/);
  assert.match(submit, /setupBody\.append\('ownerAvatarSeed', ownerAvatarSeed\)/);
  assert.doesNotMatch(setup, /generatedOwnerAvatarSeed\(form\.ownerFullName\)/);
});

test('Generate creates distinct name-aware local seeds without changing Owner form state', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const generate = setup.slice(setup.indexOf('function generateOwnerAvatar'), setup.indexOf('function removeOwnerAvatarUpload'));

  const first = createSetupAvatarSeed('Sample Owner', 'first-identifier');
  const second = createSetupAvatarSeed('Sample Owner', 'second-identifier');
  const unnamed = createSetupAvatarSeed('', 'empty-name-identifier');

  assert.notEqual(first, second);
  assert.match(first, /^Sample Owner:/);
  assert.match(unnamed, /^Owner:/);
  assert.notEqual(dicebearDataUri('notionists', first), dicebearDataUri('notionists', second));
  assert.match(generate, /clearOwnerAvatarUpload\(\)/);
  assert.match(generate, /setOwnerAvatarSeed\(createSetupAvatarSeed\(form\.ownerFullName\)\)/);
  assert.match(generate, /setOwnerAvatarMode\('generated'\)/);
  assert.doesNotMatch(generate, /setForm|ownerEmail|ownerPassword|confirmPassword/);
});

test('upload replacement and mode changes revoke object URLs with stable removal semantics', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const clearUpload = setup.slice(setup.indexOf('function clearOwnerAvatarUpload'), setup.indexOf('function generateOwnerAvatar'));
  const removeUpload = setup.slice(setup.indexOf('function removeOwnerAvatarUpload'), setup.indexOf('async function handleOwnerAvatarSelected'));
  const selectUpload = setup.slice(setup.indexOf('async function handleOwnerAvatarSelected'), setup.indexOf('function validateCommunityStep'));

  assert.match(clearUpload, /setOwnerAvatarFile\(null\)/);
  assert.match(clearUpload, /URL\.revokeObjectURL\(previewUrl\)/);
  assert.match(removeUpload, /clearOwnerAvatarUpload\(\)/);
  assert.match(removeUpload, /setOwnerAvatarMode\('generated'\)/);
  assert.doesNotMatch(removeUpload, /setOwnerAvatarSeed/);
  assert.ok(selectUpload.indexOf('const previewUrl = URL.createObjectURL(file)') < selectUpload.indexOf('URL.revokeObjectURL(previousPreviewUrl)'));
  assert.match(setup, /if \(ownerAvatarPreviewRef\.current\) URL\.revokeObjectURL\(ownerAvatarPreviewRef\.current\)/);
});

test('generated and uploaded setup payloads remain mutually exclusive and token handling is unchanged', async () => {
  const setup = await readFile(setupUrl, 'utf8');
  const submit = setup.slice(setup.indexOf('async function handleSetupSubmit'), setup.indexOf('if (!status && !error)'));

  assert.equal((setup.match(/fetch\(apiUrl\('\/setup'\)/g) ?? []).length, 1);
  assert.match(submit, /if \(setupToken\) setupBody\.append\('setupToken', setupToken\)/);
  assert.match(submit, /if \(ownerAvatarMode === 'upload' && ownerAvatarFile\)[\s\S]*setupBody\.append\('ownerAvatar', ownerAvatarFile\)[\s\S]*else[\s\S]*setupBody\.append\('ownerAvatarStyle', 'notionists'\)[\s\S]*setupBody\.append\('ownerAvatarSeed', ownerAvatarSeed\)/);
});

test('field-specific server errors return to Owner and general errors remain in the setup card', async () => {
  const setup = await readFile(setupUrl, 'utf8');

  assert.match(setup, /setupError === t\.setup\.emailAlreadyInUse/);
  assert.match(setup, /moveToStep\(1\)/);
  assert.match(setup, /focusField\('ownerEmail'\)/);
  assert.match(setup, /role="alert"/);
  assert.match(setup, /setError\(t\.setup\.setupFailed\)/);
});

test('stepper has desktop and mobile progress, semantic state, and reduced-motion content replacement', async () => {
  const setup = await readFile(setupUrl, 'utf8');

  assert.match(setup, /<nav[\s\S]*aria-label=\{navigationLabel\}/);
  assert.match(setup, /<ol className="mt-4 grid grid-cols-3 gap-2">/);
  assert.match(setup, /<ol className="hidden items-center md:flex">/);
  assert.match(setup, /aria-current=\{isActive \? 'step' : undefined\}/);
  assert.match(setup, /<ChevronRight/);
  assert.match(setup, /<Check size=\{17\} aria-hidden="true"/);
  assert.match(setup, /<AnimatePresence mode="wait" initial=\{false\}>/);
  assert.match(setup, /useReducedMotion\(\)/);
  assert.match(setup, /shouldReduceMotion \? \{ opacity: 0 \} : \{ opacity: 0, x: navigationDirection \* 12 \}/);
});

test('English and French setup stepper structures stay in parity', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');
  const setupSections = [...i18n.matchAll(/\n    setup: \{([\s\S]*?)\n    \},\n    security: \{/g)].map((match) => match[1]);
  assert.equal(setupSections.length, 2);

  for (const key of [
    'stepCommunity',
    'stepCommunityDescription',
    'stepOwner',
    'stepOwnerDescription',
    'stepReview',
    'stepReviewDescription',
    'communityHeading',
    'ownerHeading',
    'reviewHeading',
    'stepProgress',
    'continue',
    'initializeCommunity',
    'initializingCommunity',
    'passwordConfigured',
    'requiredField',
    'invalidEmail',
    'ownerAvatar',
    'generateAvatar',
    'uploadImage',
    'changeImage',
    'removeImage',
    'generatedAvatar',
    'customAvatar',
    'avatarPreview',
    'invalidAvatar',
    'invalidAvatarType',
    'avatarTooLarge',
  ]) {
    for (const section of setupSections) assert.match(section, new RegExp(`\\b${key}:`), `${key} must exist in both locales`);
  }
});
