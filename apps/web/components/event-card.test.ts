import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { eventDescriptionOverflows } from './event-card';

const cardUrl = new URL('./event-card.tsx', import.meta.url);
const eventBrowseUrl = new URL('./event-browse-view.tsx', import.meta.url);
const adminEventsUrl = new URL('../app/admin/events/page.tsx', import.meta.url);

test('event card provides compact RSVP controls and bounded descriptions', async () => {
  const card = await readFile(cardUrl, 'utf8');
  assert.match(card, /event\.attendees\.slice\(0, 3\)/);
  assert.match(card, /aria-pressed=\{selected\}/);
  assert.match(card, /aria-label=\{pending \? savingLabel : label\}/);
  assert.match(card, /TooltipContent/);
  assert.equal(eventDescriptionOverflows(72, 72), false);
  assert.equal(eventDescriptionOverflows(120, 72), true);
  assert.match(card, /new ResizeObserver\(measure\)/);
  assert.match(card, /!descriptionExpanded && 'line-clamp-3'/);
});

test('admin Event modes are URL-backed and the View mode uses the shared browser', async () => {
  const [admin, browse] = await Promise.all([
    readFile(adminEventsUrl, 'utf8'),
    readFile(eventBrowseUrl, 'utf8'),
  ]);
  assert.match(admin, /searchParams\.get\('mode'\) === 'view' \? 'view' : 'create'/);
  assert.match(admin, /next\.set\('mode', mode\)/);
  assert.match(admin, /hidden=\{selectedMode !== 'create'\}/);
  assert.match(admin, /hidden=\{selectedMode !== 'view'\}><EventBrowseView/);
  assert.match(admin, /role="tab"/);
  assert.match(admin, /aria-selected=\{active\}/);
  assert.match(browse, /\['upcoming', 'past', 'all'\]/);
  assert.match(browse, /<EventCard/);
  assert.match(browse, /\/communities\/\$\{COMMUNITY_ID\}\/events\/\$\{eventId\}\/rsvp/);
});
