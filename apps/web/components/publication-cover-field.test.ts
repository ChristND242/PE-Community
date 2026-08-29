import assert from 'node:assert/strict';
import test from 'node:test';
import { initialPublicationCoverSelection, publicationRequestBody } from './publication-cover-field';

test('publication cover serialization preserves optional, external, removal, and upload states', () => {
  const fields = { title: 'Update', body: 'Details', authorMode: 'USER' };
  assert.deepEqual(JSON.parse(publicationRequestBody(fields, initialPublicationCoverSelection()) as string), fields);
  assert.deepEqual(
    JSON.parse(publicationRequestBody(fields, { mode: 'EXTERNAL', file: null, url: ' https://images.example.test/cover.webp ', changed: true }) as string),
    { ...fields, coverMode: 'EXTERNAL', coverUrl: 'https://images.example.test/cover.webp' },
  );
  assert.deepEqual(
    JSON.parse(publicationRequestBody(fields, { mode: 'NONE', file: null, url: '', changed: true }) as string),
    { ...fields, coverMode: 'NONE' },
  );
});

test('publication uploads use multipart data without persisting preview URLs', () => {
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'cover.png', { type: 'image/png' });
  const body = publicationRequestBody(
    { title: 'Update', body: 'Details' },
    { mode: 'UPLOAD', file, url: 'blob:http://localhost/preview-only', changed: true },
  );
  assert.ok(body instanceof FormData);
  assert.equal(body.get('coverMode'), 'UPLOAD');
  assert.equal(body.get('coverImage'), file);
  assert.equal([...body.values()].some((value) => String(value).startsWith('blob:')), false);
});
