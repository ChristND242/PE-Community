import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const presentationUrl = new URL('./dashboard-shell-presentation.tsx', import.meta.url);
const shellUrl = new URL('./shell.tsx', import.meta.url);
const loginUrl = new URL('../app/login/page.tsx', import.meta.url);
const setupUrl = new URL('../app/setup/page.tsx', import.meta.url);

test('authenticated admin and member shell branding is non-interactive', async () => {
  const [presentation, shell] = await Promise.all([
    readFile(presentationUrl, 'utf8'),
    readFile(shellUrl, 'utf8'),
  ]);
  const appShellSidebarCall = shell.slice(
    shell.indexOf('<DashboardDesktopSidebar'),
    shell.indexOf('</DashboardDesktopSidebar>'),
  );
  const appShellTopbarCall = shell.slice(
    shell.indexOf('<DashboardTopbar'),
    shell.indexOf('mobileControls=', shell.indexOf('<DashboardTopbar')),
  );
  const topbar = presentation.slice(
    presentation.indexOf('export function DashboardTopbar'),
    presentation.indexOf('export function DashboardShellIdentity'),
  );

  assert.doesNotMatch(appShellSidebarCall, /brandHref=/);
  assert.doesNotMatch(appShellTopbarCall, /homeHref=|brandHref=/);
  assert.doesNotMatch(topbar, /<Link|href=|homeHref/);
  assert.match(topbar, /<div className="flex min-w-0 items-center gap-3 rounded-xl py-1 lg:hidden">/);
  assert.match(presentation, /<ShellLogoMark alt="" size="md" \/>/);
  assert.match(presentation, /t\.brand\.short/);
  assert.doesNotMatch(presentation, /NEXT_PUBLIC_PUBLIC_SITE_MODE|PUBLIC_SITE_MODE/);
});

test('the application shell keeps optional presentation links out of authenticated calls', async () => {
  const presentation = await readFile(presentationUrl, 'utf8');
  assert.match(presentation, /brandHref\s*\?\s*<Link href=\{brandHref\}/);
  assert.doesNotMatch(presentation, /NEXT_PUBLIC_PUBLIC_SITE_MODE|APP_DISTRIBUTION/);
});

test('login and setup do not consume the authenticated dashboard shell presentation', async () => {
  const [login, setup] = await Promise.all([
    readFile(loginUrl, 'utf8'),
    readFile(setupUrl, 'utf8'),
  ]);

  assert.doesNotMatch(login, /DashboardDesktopSidebar|DashboardTopbar|DashboardShellPresentation/);
  assert.doesNotMatch(setup, /DashboardDesktopSidebar|DashboardTopbar|DashboardShellPresentation/);
});
