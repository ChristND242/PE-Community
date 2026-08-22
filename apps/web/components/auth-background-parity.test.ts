import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const backgroundUrl = new URL('./auth-background.tsx', import.meta.url);
const globalsUrl = new URL('../app/globals.css', import.meta.url);
const loginUrl = new URL('../app/login/page.tsx', import.meta.url);
const setupUrl = new URL('../app/setup/page.tsx', import.meta.url);

test('login and setup reuse the same behavior-neutral auth background', async () => {
  const [background, login, setup] = await Promise.all([
    readFile(backgroundUrl, 'utf8'),
    readFile(loginUrl, 'utf8'),
    readFile(setupUrl, 'utf8'),
  ]);

  assert.match(login, /import \{ AuthBackground \}/);
  assert.match(setup, /import \{ AuthBackground \}/);
  assert.match(login, /<AuthBackground>/);
  assert.match(setup, /<AuthBackground contentClassName="px-4 py-8">/);
  assert.doesNotMatch(background, /apiUrl|fetch\(|useRouter|useI18n|useEffect|useState/);
  assert.doesNotMatch(setup, /circle_at_top_right,rgba\(94,210,156,0\.14\)/);
});

test('shared background layers remain non-interactive and naturally scrollable', async () => {
  const [background, globals] = await Promise.all([
    readFile(backgroundUrl, 'utf8'),
    readFile(globalsUrl, 'utf8'),
  ]);

  assert.match(background, /auth-background relative isolate min-h-dvh overflow-x-hidden/);
  assert.match(background, /relative z-10 flex min-h-dvh/);
  assert.doesNotMatch(background, /overflow-y-hidden|(?:className="| )h-dvh(?: |")|fixed inset-0/);
  assert.match(globals, /\.auth-background::before/);
  assert.match(globals, /pointer-events: none/);
  assert.match(globals, /radial-gradient\(circle, var\(--auth-dot\) 1px, transparent 1px\)/);
  assert.match(globals, /background-color: var\(--auth-background\)/);
  assert.doesNotMatch(globals, /mask-image|background-blend-mode|color-mix/);
});

test('setup form structure, validation, API request, and redirects remain wired', async () => {
  const setup = await readFile(setupUrl, 'utf8');

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
    assert.match(setup, new RegExp(field));
  }

  assert.match(setup, /<form onSubmit=\{handleSetupSubmit\} noValidate aria-busy=\{loading\}>/);
  assert.match(setup, /loadPublicInstanceBootstrap\(\)/);
  assert.match(setup, /fetch\(apiUrl\('\/setup'\)/);
  assert.match(setup, /slugPattern\.test\(form\.communitySlug\)/);
  assert.match(setup, /form\.ownerPassword !== form\.confirmPassword/);
  assert.match(setup, /form\.ownerPassword\.trim\(\)\.length < 8/);
  assert.match(setup, /router\.replace\('\/login'\)/);
  assert.match(setup, /router\.replace\('\/login\?setup=complete'\)/);
});

test('setup card and controls remain owned by SetupFrame', async () => {
  const setup = await readFile(setupUrl, 'utf8');

  assert.match(setup, /function SetupFrame/);
  assert.match(setup, /<Card className="w-full overflow-hidden rounded-2xl/);
  assert.match(setup, /<AuthHeaderControls \/>/);
  assert.match(setup, /<LoadingButton[\s\S]*loading=\{loading\}/);
  assert.doesNotMatch(setup, /absolute[^'"]*SetupFrame|position:\s*['"]absolute/);
});
