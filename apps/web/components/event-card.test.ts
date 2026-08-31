import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { eventImageValidation, initialEventImageSelection, validEventImageUrl } from './event-image-field';
import { eventDescriptionOverflows } from './event-card';

const cardUrl = new URL('./event-card.tsx', import.meta.url);
const imageFieldUrl = new URL('./event-image-field.tsx', import.meta.url);
const memberEventsUrl = new URL('../app/dashboard/events/page.tsx', import.meta.url);
const eventBrowseUrl = new URL('./event-browse-view.tsx', import.meta.url);
const memberDetailUrl = new URL('../app/dashboard/events/[id]/page.tsx', import.meta.url);
const adminEventsUrl = new URL('../app/admin/events/page.tsx', import.meta.url);
const adminDetailUrl = new URL('../app/admin/events/[id]/page.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('event image form supports legacy no-image state, valid URLs, and explicit validation', () => {
  assert.deepEqual(initialEventImageSelection(), { mode: 'NONE', file: null, url: '', changed: false });
  assert.equal(validEventImageUrl('https://images.example.test/event.jpg'), true);
  assert.equal(validEventImageUrl('http://images.example.test/event.jpg'), true);
  assert.equal(validEventImageUrl('file:///tmp/event.jpg'), false);
  assert.equal(eventImageValidation({ mode: 'EXTERNAL', file: null, url: 'bad', changed: true }, { fileRequired: 'file', invalidUrl: 'url' }), 'url');
  assert.equal(eventImageValidation({ mode: 'UPLOAD', file: null, url: '', changed: true }, { fileRequired: 'file', invalidUrl: 'url' }), 'file');
});

test('event card renders image and fallback, localized date tile, attendance, and compact RSVP controls', async () => {
  const card = await readFile(cardUrl, 'utf8');
  assert.match(card, /aspect-\[16\/9\]/);
  assert.match(card, /onError=\{\(\) => setImageFailed\(true\)\}/);
  assert.match(card, /<CalendarDays[\s\S]*aria-hidden="true"/);
  assert.match(card, /month: 'short', timeZone: timezone/);
  assert.match(card, /event\.attendees\.slice\(0, 3\)/);
  assert.match(card, /aria-pressed=\{selected\}/);
  assert.match(card, /aria-label=\{pending \? savingLabel : label\}/);
  for (const icon of ['UserCheck', 'CircleHelp', 'UserX']) assert.match(card, new RegExp(icon));
  assert.match(card, /TooltipContent/);
  assert.match(card, /app-status-success/);
  assert.match(card, /app-status-warning/);
  assert.match(card, /app-status-neutral/);
  assert.equal(eventDescriptionOverflows(72, 72), false);
  assert.equal(eventDescriptionOverflows(120, 72), true);
  assert.match(card, /eventDescriptionOverflows\(description\.scrollHeight, description\.clientHeight\)/);
  assert.match(card, /new ResizeObserver\(measure\)/);
  assert.match(card, /const \[descriptionExpanded, setDescriptionExpanded\] = useState\(false\)/);
  assert.match(card, /!descriptionExpanded && 'line-clamp-3'/);
  assert.match(card, /aria-expanded=\{descriptionExpanded\}/);
  assert.match(card, /aria-controls=\{`event-description-\$\{event\.id\}`\}/);
  assert.match(card, /descriptionExpanded \? labels\.less : labels\.more/);
});

test('member list and detail reuse compact RSVP behavior without changing mutation status values', async () => {
  const [list, browse, detail, card] = await Promise.all([readFile(memberEventsUrl, 'utf8'), readFile(eventBrowseUrl, 'utf8'), readFile(memberDetailUrl, 'utf8'), readFile(cardUrl, 'utf8')]);
  assert.match(list, /<EventBrowseView/);
  assert.match(browse, /<EventCard/);
  assert.match(detail, /<EventRsvpControls/);
  for (const source of [browse, detail]) {
    assert.match(source, /events\/\$\{(?:eventId|id)\}\/rsvp/);
  }
  for (const status of ['GOING', 'MAYBE', 'DECLINED']) assert.match(card, new RegExp(`status="${status}"`));
});

test('admin create and edit forms share one image field and multipart-capable request builder', async () => {
  const [create, edit, field] = await Promise.all([readFile(adminEventsUrl, 'utf8'), readFile(adminDetailUrl, 'utf8'), readFile(imageFieldUrl, 'utf8')]);
  for (const source of [create, edit]) {
    assert.match(source, /<EventImageField/);
    assert.match(source, /eventRequestBody\(form, eventImage\)/);
    assert.match(source, /eventImageValidation/);
  }
  assert.match(field, /body\.append\('eventImage', image\.file\)/);
  assert.match(field, /image\/jpeg/);
  assert.match(field, /image\/png/);
  assert.match(field, /image\/webp/);
  assert.match(field, /eventImageMaxBytes = 5 \* 1024 \* 1024/);
});

test('event image and RSVP copy is available in English and French', async () => {
  const i18n = await readFile(i18nUrl, 'utf8');
  for (const key of ['eventImageLabel', 'eventImageNone', 'eventImageUpload', 'eventImageUrl', 'eventImageReplace', 'eventImageRemove', 'eventImagePreview', 'eventImageInvalidType', 'eventImageTooLarge', 'eventImageInvalidUrl', 'eventImageRequired', 'inPersonEvent']) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2, `${key} should have EN and FR values`);
  }
  for (const key of ['eventDescriptionMore', 'eventDescriptionLess', 'eventsCreateMode', 'eventsViewMode']) {
    assert.equal((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2, `${key} should have EN and FR values`);
  }
});

test('member and admin Event views share browsing, filtering, cards, and the normal RSVP path', async () => {
  const [member, admin, browse, controller] = await Promise.all([
    readFile(memberEventsUrl, 'utf8'),
    readFile(adminEventsUrl, 'utf8'),
    readFile(eventBrowseUrl, 'utf8'),
    readFile(new URL('../../api/src/communities/communities.controller.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(member, /<EventBrowseView/);
  assert.match(admin, /<EventBrowseView/);
  assert.equal((member.match(/<EventCard/g) ?? []).length, 0);
  assert.equal((admin.match(/<EventCard/g) ?? []).length, 0);
  assert.match(browse, /\['upcoming', 'past', 'all'\]/);
  assert.match(browse, /<EventCard/);
  assert.match(browse, /\/communities\/\$\{COMMUNITY_ID\}\/events\/\$\{eventId\}\/rsvp/);
  assert.match(controller, /@Post\('events\/:eventId\/rsvp'\)[\s\S]*requireUser\([\s\S]*this\.communities\.rsvp\(communityId, eventId, user\.id/);
});

test('admin Events mode is URL-backed, defaults safely to Create, and keeps Create state mounted', async () => {
  const admin = await readFile(adminEventsUrl, 'utf8');
  assert.match(admin, /searchParams\.get\('mode'\) === 'view' \? 'view' : 'create'/);
  assert.match(admin, /next\.set\('mode', mode\)/);
  assert.match(admin, /router\.replace\(`\/admin\/events\?\$\{next\.toString\(\)\}`/);
  assert.match(admin, /hidden=\{selectedMode !== 'create'\}[\s\S]*<EventImageField/);
  assert.match(admin, /hidden=\{selectedMode !== 'view'\}><EventBrowseView/);
  assert.match(admin, /aria-selected=\{active\}/);
});
