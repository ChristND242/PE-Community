import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const file = (path: string) => new URL(path, import.meta.url);

function relativeLuminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: string, second: string) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

test('one central provider follows system appearance and persists explicit choices', async () => {
  const [layout, provider, tailwind] = await Promise.all([
    readFile(file('../app/layout.tsx'), 'utf8'),
    readFile(file('./appearance-provider.tsx'), 'utf8'),
    readFile(file('../tailwind.config.ts'), 'utf8'),
  ]);

  assert.equal((layout.match(/<AppearanceProvider>/g) ?? []).length, 1);
  assert.match(layout, /<html lang="en" suppressHydrationWarning>/);
  assert.match(layout, /themeColor:/);
  assert.match(provider, /attribute="class"/);
  assert.match(provider, /defaultTheme="system"/);
  assert.match(provider, /enableSystem/);
  assert.match(provider, /disableTransitionOnChange/);
  assert.match(provider, /storageKey="pe-appearance"/);
  assert.match(provider, /resolvedTheme === 'dark'/);
  assert.match(tailwind, /darkMode: \['class'\]/);
});

test('toggle uses provider state, remains hydration-safe, and exposes the action icon', async () => {
  const toggle = await readFile(file('./theme-toggle.tsx'), 'utf8');

  assert.match(toggle, /useTheme\(\)/);
  assert.match(toggle, /resolvedTheme/);
  assert.match(toggle, /setTheme\(isDark \? 'light' : 'dark'\)/);
  assert.match(toggle, /disabled=!\{mounted\}|disabled=\{!mounted\}/);
  assert.match(toggle, /isDark \? t\.common\.switchToLightMode : t\.common\.switchToDarkMode/);
  assert.match(toggle, /isDark \? <Sun/);
  assert.match(toggle, /: <Moon/);
  assert.match(toggle, /h-9 w-9/);
  assert.match(toggle, /size=\{17\}/);
  assert.match(toggle, /focus-visible:ring-2/);
  assert.doesNotMatch(toggle, /const \[(?:theme|isDark|appearance),/);
});

test('Admin, Member, and authentication shells expose the shared toggle without changing language controls', async () => {
  const [shell, shellPresentation, authControls, login, register, setup] = await Promise.all([
    readFile(file('./shell.tsx'), 'utf8'),
    readFile(file('./dashboard-shell-presentation.tsx'), 'utf8'),
    readFile(file('./auth-header-controls.tsx'), 'utf8'),
    readFile(file('../app/login/page.tsx'), 'utf8'),
    readFile(file('../app/register/page.tsx'), 'utf8'),
    readFile(file('../app/setup/page.tsx'), 'utf8'),
  ]);

  assert.match(shell, /href: '\/admin'/);
  assert.match(shell, /href: '\/dashboard'/);
  assert.match(shell, /<ThemeToggle \/>\s*<LanguageSwitcher \/>/);
  assert.match(shellPresentation, /hidden items-center gap-3 lg:flex/);
  assert.match(shell, /lg:hidden/);
  assert.match(authControls, /<ThemeToggle \/><LanguageSwitcher \/>/);
  for (const source of [login, register, setup]) {
    assert.match(source, /import \{ AuthHeaderControls \}/);
    assert.match(source, /<AuthHeaderControls \/>/);
  }
});

test('appearance tokens cover dark preservation, low-glare light surfaces, forms, selection, and autofill', async () => {
  const globals = await readFile(file('../app/globals.css'), 'utf8');

  assert.match(globals, /:root \{[\s\S]*color-scheme: light/);
  assert.match(globals, /--app-background: #edf2ee/);
  assert.match(globals, /--app-card: #f8faf7/);
  assert.match(globals, /\.dark \{[\s\S]*color-scheme: dark/);
  assert.match(globals, /--app-background: #070b0a/);
  assert.match(globals, /--app-foreground: #f4fff9/);
  assert.match(globals, /--auth-background: #020604/);
  assert.match(globals, /::selection/);
  assert.match(globals, /\.dark ::selection/);
  assert.match(globals, /input:-webkit-autofill/);
  assert.match(globals, /-webkit-text-fill-color: var\(--app-foreground\)/);
  assert.match(globals, /caret-color: var\(--app-accent\)/);
  assert.match(globals, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
});

test('core light text and primary action colors meet the normal-text contrast target', async () => {
  const globals = await readFile(file('../app/globals.css'), 'utf8');
  const token = (name: string) => {
    const value = globals.match(new RegExp(`--${name}:\\s*(#[a-f\\d]{6})`, 'i'))?.[1];
    assert.ok(value, `${name} must be a six-digit hex token`);
    return value;
  };

  const background = token('app-background');
  assert.ok(contrastRatio(token('app-foreground'), background) >= 4.5);
  assert.ok(contrastRatio(token('app-muted-foreground'), background) >= 4.5);
  assert.ok(contrastRatio(token('app-accent'), token('app-accent-foreground')) >= 4.5);
});

test('charts, automation canvas, dialogs, and toasts use appearance-aware surfaces', async () => {
  const [charts, emailCharts, automation, ui, toaster] = await Promise.all([
    readFile(file('./charts.tsx'), 'utf8'),
    readFile(file('./email-operations-charts.tsx'), 'utf8'),
    readFile(file('./automation-canvas-view.tsx'), 'utf8'),
    readFile(file('./ui.tsx'), 'utf8'),
    readFile(file('./ui/sonner.tsx'), 'utf8'),
  ]);

  for (const source of [charts, emailCharts]) {
    assert.match(source, /var\(--chart-grid\)/);
    assert.match(source, /var\(--chart-axis/);
  }
  assert.match(automation, /var\(--automation-canvas\)/);
  assert.match(automation, /var\(--automation-canvas-dot\)/);
  assert.match(ui, /bg-\[var\(--app-overlay\)\]/);
  assert.match(toaster, /resolvedTheme === 'light' \? 'light' : 'dark'/);
  assert.doesNotMatch(toaster, /theme="dark"/);
});

test('appearance actions are localized in English and French', async () => {
  const i18n = await readFile(file('../lib/i18n.tsx'), 'utf8');

  for (const copy of [
    'Light mode',
    'Dark mode',
    'Switch to light mode',
    'Switch to dark mode',
    'Mode clair',
    'Mode sombre',
    'Passer au mode clair',
    'Passer au mode sombre',
  ]) {
    assert.match(i18n, new RegExp(copy));
  }
});

test('light interactions use distinct hover, open, and selected treatments with keyboard parity', async () => {
  const [globals, shell, select, rowMenu] = await Promise.all([
    readFile(file('../app/globals.css'), 'utf8'),
    readFile(file('./dashboard-shell-presentation.tsx'), 'utf8'),
    readFile(file('./app-select.tsx'), 'utf8'),
    readFile(file('./row-action-menu.tsx'), 'utf8'),
  ]);

  assert.match(globals, /--app-interactive-hover: rgba\(22, 138, 97, 0\.07\)/);
  assert.match(globals, /--app-interactive-open: rgba\(22, 138, 97, 0\.1\)/);
  assert.match(globals, /--app-selected: rgba\(22, 138, 97, 0\.13\)/);
  assert.match(globals, /\.dark \{[\s\S]*--app-interactive-hover: rgba\(255, 255, 255, 0\.055\)/);
  assert.match(shell, /hover:bg-\[var\(--app-interactive-hover\)\]/);
  assert.match(shell, /open \? 'border-accent\/10 bg-\[var\(--app-interactive-open\)\]/);
  assert.match(shell, /focus-visible:ring-2/);
  assert.match(select, /focus:bg-\[var\(--app-interactive-hover\)\]/);
  assert.match(rowMenu, /focus-visible:bg-\[var\(--app-interactive-hover\)\]/);
});

test('admin and member task boards share light surface tokens while preserving role-specific controls', async () => {
  const [globals, adminBoard, memberBoard, adminRoute] = await Promise.all([
    readFile(file('../app/globals.css'), 'utf8'),
    readFile(file('./task-board-kanban-view.tsx'), 'utf8'),
    readFile(file('../app/dashboard/events/[id]/event-tasks.tsx'), 'utf8'),
    readFile(file('../app/admin/task-boards/[boardId]/page.tsx'), 'utf8'),
  ]);

  for (const token of ['task-board-workspace', 'task-board-column', 'task-board-card']) {
    assert.match(globals, new RegExp(`--${token}:`));
    assert.match(adminBoard, new RegExp(`var\\(--${token}`));
  }
  assert.match(memberBoard, /var\(--task-board-workspace\)/);
  assert.match(memberBoard, /var\(--task-board-column\)/);
  assert.match(memberBoard, /var\(--task-board-member-card\)/);
  assert.match(adminRoute, /canManage=\{board\.canManageTasks\}/);
  assert.match(memberBoard, /task\.canUpdateStatus/);
  assert.match(globals, /\.dark \{[\s\S]*--task-board-card: #07100c/);
});

test('automation canvas, connectors, nodes, and warning statuses use appearance-aware contrast tokens', async () => {
  const [globals, canvas, automation] = await Promise.all([
    readFile(file('../app/globals.css'), 'utf8'),
    readFile(file('./automation-canvas-view.tsx'), 'utf8'),
    readFile(file('./task-board-automation.tsx'), 'utf8'),
  ]);

  for (const token of [
    'automation-canvas',
    'automation-canvas-dot',
    'automation-connector-start',
    'automation-connector-end',
    'automation-root',
    'automation-group',
    'automation-node',
  ]) assert.match(globals, new RegExp(`--${token}:`));
  assert.match(canvas, /stopColor="var\(--automation-connector-start\)"/);
  assert.match(canvas, /\[background:var\(--automation-root\)\]/);
  assert.match(canvas, /\[background:var\(--automation-node\)\]/);
  assert.match(automation, /app-warning-foreground/);
  assert.match(globals, /\.dark \{[\s\S]*--automation-canvas: #050c09/);
});

test('template actions, task dates, social controls, and auth dots use scoped light contrast tokens', async () => {
  const [globals, settings, board, memberBoard, links, profile] = await Promise.all([
    readFile(file('../app/globals.css'), 'utf8'),
    readFile(file('../app/admin/settings/page.tsx'), 'utf8'),
    readFile(file('./task-board-kanban-view.tsx'), 'utf8'),
    readFile(file('../app/dashboard/events/[id]/event-tasks.tsx'), 'utf8'),
    readFile(file('./profile-link-display.tsx'), 'utf8'),
    readFile(file('../app/dashboard/members/[id]/page.tsx'), 'utf8'),
  ]);

  assert.match(settings, /\[background:var\(--template-action-background\)\]/);
  assert.doesNotMatch(settings, /sticky bottom-0[^\n]*bg-gradient-to-t/);
  for (const source of [board, memberBoard]) {
    assert.match(source, /var\(--task-overdue\)/);
    assert.match(source, /var\(--task-due-soon\)/);
    assert.match(source, /var\(--task-date\)/);
  }
  assert.match(links, /var\(--app-icon-muted\)/);
  assert.match(links, /hover:bg-\[var\(--app-interactive-open\)\]/);
  assert.match(links, /focus-visible:ring-2/);
  assert.match(profile, /CalendarDays[^\n]*var\(--app-icon-muted\)/);
  assert.match(globals, /--auth-dot: rgba\(22, 138, 97, 0\.32\)/);
  assert.match(globals, /\.dark \{[\s\S]*--auth-dot: rgba\(255, 255, 255, 0\.1\)/);
  assert.match(globals, /background-size: 30px 30px, 100% 100%/);
});
