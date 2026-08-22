import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const globalsUrl = new URL('../app/globals.css', import.meta.url);
const settingsUrl = new URL('../app/admin/settings/page.tsx', import.meta.url);
const twoFactorUrl = new URL('./two-factor-card.tsx', import.meta.url);
const shellUrl = new URL('./shell.tsx', import.meta.url);

test('template validation uses a semantic alert with distinct light and dark colors', async () => {
  const [globals, settings] = await Promise.all([
    readFile(globalsUrl, 'utf8'),
    readFile(settingsUrl, 'utf8'),
  ]);

  assert.match(settings, /role="alert" className="app-alert-error/);
  assert.match(globals, /--app-error-soft: rgba\(225, 29, 72, 0\.08\)/);
  assert.match(globals, /--app-error-foreground: #8f1d3d/);
  assert.match(
    globals,
    /\.dark[\s\S]*--app-error-foreground: rgba\(255, 228, 230, 0\.8\)/,
  );
});

test('2FA recovery controls use readable light surfaces and retain explicit dark variants', async () => {
  const card = await readFile(twoFactorUrl, 'utf8');

  assert.match(card, /bg-amber-50\/85[\s\S]*dark:bg-amber-300\/10/);
  assert.match(card, /text-amber-950 dark:text-amber-100/);
  assert.match(card, /text-stone-700 dark:text-amber-100\/70/);
  assert.match(
    card,
    /bg-white\/75[\s\S]*text-amber-950[\s\S]*dark:bg-black\/20[\s\S]*dark:text-amber-50/,
  );
  assert.match(
    card,
    /select-all[\s\S]*text-stone-950[\s\S]*dark:text-amber-50/,
  );
  assert.match(card, /text-stone-800 dark:text-amber-50\/80/);
  assert.match(
    card,
    /navigator\.clipboard\.writeText[\s\S]*backupCodesCopied[\s\S]*catch[\s\S]*backupCodesCopyFailed/,
  );
});

test('authenticated light controls have hover, focus, invalid, disabled, and readonly states', async () => {
  const [globals, shell] = await Promise.all([
    readFile(globalsUrl, 'utf8'),
    readFile(shellUrl, 'utf8'),
  ]);

  assert.match(shell, /className="app-authenticated min-h-screen/);
  assert.match(
    globals,
    /\.app-authenticated input[\s\S]*:not\(:disabled\):not\(\[readonly\]\):hover/,
  );
  assert.match(globals, /\.app-authenticated textarea[^,{\n]*:focus/);
  assert.match(globals, /border-color: var\(--app-accent\) !important/);
  assert.match(
    globals,
    /box-shadow: 0 0 0 3px var\(--app-input-focus-ring\) !important/,
  );
  assert.match(
    globals,
    /input\[aria-invalid="true"\][\s\S]*var\(--app-input-invalid-ring\)/,
  );
  assert.match(globals, /input\[readonly\][\s\S]*var\(--app-panel-muted\)/);
  assert.match(globals, /html:not\(\.dark\) input:disabled/);
  assert.doesNotMatch(globals, /\.dark \.app-authenticated .*box-shadow/);
});
