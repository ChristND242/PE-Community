import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const calendarUrl = new URL('./admin-operations-calendar.tsx', import.meta.url);
const shellPresentationUrl = new URL('./dashboard-shell-presentation.tsx', import.meta.url);
const globalsUrl = new URL('../app/globals.css', import.meta.url);

test('Calendar details use a body portal with a viewport-fixed modal stack', async () => {
  const calendar = await readFile(calendarUrl, 'utf8');

  assert.match(calendar, /import \{ createPortal \} from 'react-dom'/);
  assert.match(calendar, /return createPortal\([\s\S]*document\.body/);
  assert.match(calendar, /data-calendar-dialog-root className="fixed inset-0 z-\[80\] grid place-items-center p-4"/);
  assert.match(calendar, /data-calendar-dialog-overlay[\s\S]*className="fixed inset-0 z-0 bg-black\/70 backdrop-blur-sm"/);
  assert.match(calendar, /data-calendar-dialog-content className="chat-scrollbar relative z-10/);
  assert.doesNotMatch(calendar, /data-calendar-dialog-overlay[\s\S]{0,220}className="absolute inset-0/);
});

test('Calendar modal remains above the unchanged Admin header layer', async () => {
  const [calendar, shellPresentation] = await Promise.all([
    readFile(calendarUrl, 'utf8'),
    readFile(shellPresentationUrl, 'utf8'),
  ]);

  assert.match(calendar, /data-calendar-dialog-root className="[^"]*z-\[80\]/);
  assert.match(shellPresentation, /<header className="sticky top-0 z-20/);
  assert.doesNotMatch(shellPresentation, /z-\[80\]|z-\[999/);
});

test('existing Calendar details, API loading, and close behavior remain present', async () => {
  const calendar = await readFile(calendarUrl, 'utf8');

  assert.match(calendar, /apiFetch<CalendarResponse>\(`\/admin\/\$\{COMMUNITY_ID\}\/operations\/calendar\?month=/);
  assert.match(calendar, /if \(event\.key === 'Escape'\) \{ setSelectedEntry\(null\); setExpandedDay\(null\); \}/);
  assert.match(calendar, /data-calendar-dialog-overlay[\s\S]*onClick=\{onClose\}/);
  assert.match(calendar, /<button type="button" onClick=\{onClose\} aria-label=\{closeLabel\}/);
  assert.match(calendar, /selectedEntry\.description/);
  assert.match(calendar, /selectedEntry\.metadata\.map/);
  assert.match(calendar, /selectedEntry\.actionHref/);
  assert.match(calendar, /max-h-\[min\(38rem,calc\(100dvh-2rem\)\)\] w-full max-w-lg/);
});

test('the existing backdrop remains theme-compatible without changing its opacity or blur', async () => {
  const [calendar, globals] = await Promise.all([
    readFile(calendarUrl, 'utf8'),
    readFile(globalsUrl, 'utf8'),
  ]);

  assert.match(calendar, /bg-black\/70 backdrop-blur-sm/);
  assert.match(globals, /html:not\(\.dark\)[\s\S]*\[class~="bg-black\/70"\][\s\S]*background-color: var\(--app-overlay\) !important/);
  assert.match(globals, /\.dark \{[\s\S]*--app-overlay: rgba\(0, 0, 0, 0\.7\)/);
});
