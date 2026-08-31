import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { detectEventImageMime, eventRequestBody, initialEventImageFieldWorkflow, initialEventImageSelection, normalizeEventImageFile, transitionEventImageField } from './event-image-field';

const fieldUrl = new URL('./event-image-field.tsx', import.meta.url);
const createUrl = new URL('../app/admin/events/page.tsx', import.meta.url);
const editUrl = new URL('../app/admin/events/[id]/page.tsx', import.meta.url);
const i18nUrl = new URL('../lib/i18n.tsx', import.meta.url);

test('event image workflow covers empty, upload, URL, selection, replacement, and removal', () => {
  const empty = initialEventImageFieldWorkflow(initialEventImageSelection());
  assert.deepEqual(empty, { phase: 'EMPTY', replacing: false });
  assert.deepEqual(transitionEventImageField(empty, 'START_UPLOAD', false), { phase: 'UPLOAD_SELECTING', replacing: false });
  assert.deepEqual(transitionEventImageField(empty, 'START_URL', false), { phase: 'URL_ENTERING', replacing: false });
  assert.deepEqual(transitionEventImageField({ phase: 'URL_ENTERING', replacing: false }, 'CANCEL', false), empty);

  const selected = transitionEventImageField({ phase: 'UPLOAD_SELECTING', replacing: false }, 'SELECT', true);
  assert.deepEqual(selected, { phase: 'IMAGE_SELECTED', replacing: false });
  assert.deepEqual(transitionEventImageField(selected, 'START_REPLACE', true), { phase: 'IMAGE_SELECTED', replacing: true });
  assert.deepEqual(transitionEventImageField({ phase: 'URL_ENTERING', replacing: false }, 'CANCEL', true), selected);
  assert.deepEqual(transitionEventImageField(selected, 'REMOVE', true), empty);
});

test('an existing uploaded or external image starts in the shared selected preview state', () => {
  assert.deepEqual(initialEventImageFieldWorkflow(initialEventImageSelection('/uploads/event-images/example.webp', 'UPLOAD')), { phase: 'IMAGE_SELECTED', replacing: false });
  assert.deepEqual(initialEventImageFieldWorkflow(initialEventImageSelection('https://images.example.test/event.webp', 'EXTERNAL')), { phase: 'IMAGE_SELECTED', replacing: false });
});

test('upload serialization normalizes supported image bytes and never persists a blob preview URL', async () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(detectEventImageMime(pngBytes), 'image/png');
  const mislabeled = new File([pngBytes], 'event.jpg', { type: 'image/jpeg' });
  const normalized = await normalizeEventImageFile(mislabeled);
  assert.ok(normalized);
  assert.equal(normalized.type, 'image/png');
  assert.equal(normalized.name, 'event.png');

  const body = eventRequestBody(
    { title: 'Event', description: 'Description', startsAt: '2026-09-01T10:00', location: 'Hall', onlineUrl: '', capacity: '' },
    { mode: 'UPLOAD', file: normalized, url: 'blob:http://localhost:3000/preview-only', changed: true },
  );
  assert.ok(body instanceof FormData);
  assert.equal(body.get('imageMode'), 'UPLOAD');
  assert.equal(body.has('imageUrl'), false);
  assert.equal([...body.values()].some((value) => String(value).startsWith('blob:')), false);
  const serializedFile = body.get('eventImage');
  assert.ok(serializedFile instanceof File);
  assert.equal(serializedFile.type, 'image/png');
  assert.deepEqual(new Uint8Array(await serializedFile.arrayBuffer()), pngBytes);
});

test('JSON serialization distinguishes no image, external URL, keep, and explicit removal', () => {
  const fields = { title: 'Event' };
  assert.deepEqual(JSON.parse(eventRequestBody(fields, initialEventImageSelection()) as string), fields);
  assert.deepEqual(JSON.parse(eventRequestBody(fields, { mode: 'EXTERNAL', file: null, url: ' https://images.example.test/event.png ', changed: true }) as string), { title: 'Event', imageMode: 'EXTERNAL', imageUrl: 'https://images.example.test/event.png' });
  assert.deepEqual(JSON.parse(eventRequestBody(fields, { mode: 'NONE', file: null, url: '', changed: true }) as string), { title: 'Event', imageMode: 'NONE' });
  assert.deepEqual(JSON.parse(eventRequestBody(fields, initialEventImageSelection('https://api.example.test/uploads/event-images/id.png', 'UPLOAD')) as string), fields);
});

test('field source keeps empty choices out of selected preview and provides controlled image failure UI', async () => {
  const source = await readFile(fieldUrl, 'utf8');
  assert.match(source, /workflow\.phase === 'EMPTY'/);
  assert.match(source, /workflow\.phase === 'UPLOAD_SELECTING'/);
  assert.match(source, /workflow\.phase === 'URL_ENTERING'/);
  assert.match(source, /workflow\.phase === 'IMAGE_SELECTED' && !workflow\.replacing/);
  assert.match(source, /onError=\{onPreviewFailed\}/);
  assert.match(source, /labels\.loadFailed/);
  assert.match(source, /aria-label=\{labels\.remove\}/);
  assert.match(source, /<TooltipContent[^>]*>\{labels\.remove\}<\/TooltipContent>/);
  assert.match(source, /aspect-\[16\/9\]/);
  assert.match(source, /bg-\[var\(--app-dialog\)\]/);
  assert.match(source, /text-\[var\(--app-control-foreground\)\]/);
  assert.doesNotMatch(source, /bottom-3 right-3[^\n]*bg-black/);
});

test('create and edit forms share the field and expose upload loading without changing request construction', async () => {
  const [create, edit] = await Promise.all([readFile(createUrl, 'utf8'), readFile(editUrl, 'utf8')]);
  for (const source of [create, edit]) {
    assert.match(source, /<EventImageField/);
    assert.match(source, /disabled=\{/);
    assert.match(source, /loading=\{saving && eventImage\.mode === 'UPLOAD'\}/);
    assert.match(source, /eventRequestBody\(form, eventImage\)/);
    assert.match(source, /eventSubmissionError/);
    assert.match(source, /errorMessage=\{fieldErrors\.image\}/);
    assert.match(source, /toast\.error\([^\n]+\{ description:/);
  }
});

test('professional Event image labels exist in English and French', async () => {
  const source = await readFile(i18nUrl, 'utf8');
  const keys = ['eventImageOptional', 'eventImageDescription', 'eventImageNone', 'eventImageEmptyDescription', 'eventImageUpload', 'eventImageUseUrl', 'eventImageChooseFile', 'eventImageReplace', 'eventImageRemove', 'eventImageApply', 'eventImageLoadFailed'];
  for (const key of keys) assert.equal((source.match(new RegExp(`${key}:`, 'g')) ?? []).length, 2, `${key} should have EN and FR labels`);
  assert.match(source, /eventImageNone: 'No event image'/);
  assert.match(source, /eventImageNone: 'Aucune image pour l’événement'/);
});
