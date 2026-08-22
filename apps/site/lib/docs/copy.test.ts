import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getDocsCopyLabels, writeClipboardText } from './copy';

test('copy helper writes the exact requested value and propagates clipboard rejection safely', async () => {
  let copied = '';
  await writeClipboardText('pnpm --filter @pe/site build', {
    writeText: async (value) => {
      copied = value;
    },
  });
  assert.equal(copied, 'pnpm --filter @pe/site build');

  await assert.rejects(
    () =>
      writeClipboardText('safe value', {
        writeText: async () => {
          throw new Error('clipboard unavailable');
        },
      }),
    /clipboard unavailable/,
  );
});

test('copy feedback is localized and the component owns cleanup and failure state', async () => {
  assert.deepEqual(getDocsCopyLabels('en'), {
    idle: { text: 'Copy', ariaLabel: 'Copy code' },
    copied: { text: 'Copied', ariaLabel: 'Code copied' },
    failed: { text: 'Failed', ariaLabel: 'Copy failed' },
  });
  assert.deepEqual(getDocsCopyLabels('fr'), {
    idle: { text: 'Copier', ariaLabel: 'Copier le code' },
    copied: { text: 'Copié', ariaLabel: 'Code copié' },
    failed: { text: 'Échec', ariaLabel: 'Échec de la copie' },
  });

  const source = await readFile(
    new URL('../../components/docs/docs-copy-button.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /window\.clearTimeout\(timeoutRef\.current\)/);
  assert.match(source, /setState\('failed'\)/);
  assert.match(source, /pendingRef\.current/);
  assert.match(source, /aria-label=\{label\.ariaLabel\}/);
  assert.match(source, /aria-hidden="true"/);
});
