import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const generator = resolve(
  import.meta.dirname,
  '../../scripts/write-build-metadata.mjs',
);

function generate(version: string, sourceCommit: string, buildDate: string) {
  const directory = mkdtempSync(join(tmpdir(), 'pe-build-metadata-'));
  const output = join(directory, 'build-metadata.ts');
  const result = spawnSync(process.execPath, [generator], {
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_VERSION: version,
      SOURCE_COMMIT: sourceCommit,
      BUILD_DATE: buildDate,
      BUILD_METADATA_OUTPUT: output,
    },
  });
  return {
    directory,
    result,
    metadata: result.status === 0 ? readMetadata(output) : null,
  };
}

function readMetadata(path: string) {
  const source = readFileSync(path, 'utf8');
  const match = source.match(/Object\.freeze\((\{[\s\S]*\}) as const\)/);
  if (!match) throw new Error('Generated build metadata is invalid.');
  return JSON.parse(match[1]) as {
    version: string;
    sourceCommit: string | null;
    buildDate: string | null;
    channel: string;
  };
}

test('build metadata accepts strict stable, development, and CI validation identities only', () => {
  const sourceCommit = 'a'.repeat(40);
  const buildDate = '2026-09-02T19:29:32Z';
  const fixtures = [
    ['v1.2.4', sourceCommit, buildDate, 'stable'],
    ['v0.0.0-dev', 'development', 'unknown', 'development'],
    ['v0.0.0-validation.33673603612', sourceCommit, buildDate, 'validation'],
  ] as const;
  for (const [version, commit, date, channel] of fixtures) {
    const result = generate(version, commit, date);
    try {
      assert.equal(result.result.status, 0, result.result.stderr);
      assert.equal(result.metadata?.version, version);
      assert.equal(result.metadata?.channel, channel);
    } finally {
      rmSync(result.directory, { recursive: true, force: true });
    }
  }
});

test('build metadata rejects the failed validation label and arbitrary release-like input', () => {
  for (const version of [
    'validation-33673603612',
    'main',
    'latest',
    'v1.2.4-rc.1',
  ]) {
    const result = generate(version, 'a'.repeat(40), '2026-09-02T19:29:32Z');
    try {
      assert.notEqual(result.result.status, 0);
      assert.match(result.result.stderr, /APP_VERSION must be strict/);
    } finally {
      rmSync(result.directory, { recursive: true, force: true });
    }
  }
});
