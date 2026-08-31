import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const validator = resolve(import.meta.dirname, '../../../.github/scripts/validate-release-ref.sh');

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pe-release-tag-'));
  const origin = join(root, 'origin.git');
  const source = join(root, 'source');
  const checkout = join(root, 'checkout');
  git(root, 'init', '--bare', '--initial-branch=main', origin);
  git(root, 'init', '-b', 'main', source);
  git(source, 'config', 'user.name', 'Release Test');
  git(source, 'config', 'user.email', 'release-test@example.invalid');
  writeFileSync(join(source, 'release.txt'), 'release\n');
  git(source, 'add', 'release.txt');
  git(source, 'commit', '-m', 'release source');
  git(source, 'remote', 'add', 'origin', origin);
  git(source, 'push', '-u', 'origin', 'main');
  git(origin, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  git(root, 'clone', '--no-tags', origin, checkout);
  return { root, source, checkout, commit: git(source, 'rev-parse', 'HEAD') };
}

function runValidator(checkout: string, tag: string, checkoutSha: string) {
  const output = join(checkout, 'github-output');
  const result = spawnSync('bash', [validator], {
    cwd: checkout,
    encoding: 'utf8',
    env: {
      ...process.env,
      RELEASE_TAG: tag,
      RELEASE_REF: `refs/tags/${tag}`,
      RELEASE_REF_TYPE: 'tag',
      CHECKOUT_SHA: checkoutSha,
      GITHUB_OUTPUT: output,
    },
  });
  return { ...result, output: result.status === 0 ? readFileSync(output, 'utf8') : '' };
}

test('peeled checkout commit accepts the authoritative annotated remote tag', () => {
  const f = fixture();
  try {
    git(f.source, 'tag', '-a', 'v1.2.1', '-m', 'v1.2.1', f.commit);
    git(f.source, 'push', 'origin', 'refs/tags/v1.2.1');
    git(f.checkout, 'tag', 'v1.2.1', f.commit);
    assert.equal(git(f.checkout, 'cat-file', '-t', 'v1.2.1'), 'commit');
    const result = runValidator(f.checkout, 'v1.2.1', f.commit);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.output, new RegExp(`source_commit=${f.commit}`));
    assert.equal(git(f.checkout, 'cat-file', '-t', 'refs/tags/v1.2.1'), 'tag');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('lightweight remote tags remain rejected', () => {
  const f = fixture();
  try {
    git(f.source, 'tag', 'v1.2.1', f.commit);
    git(f.source, 'push', 'origin', 'refs/tags/v1.2.1');
    const result = runValidator(f.checkout, 'v1.2.1', f.commit);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /require an annotated tag/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('malformed release tags fail before any fetch', () => {
  const f = fixture();
  try {
    git(f.checkout, 'remote', 'set-url', 'origin', join(f.root, 'unavailable.git'));
    for (const tag of ['v1.2', 'release-1.2.1', 'v1.2.1-rc1']) {
      const result = runValidator(f.checkout, tag, f.commit);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /strict stable semver/);
      assert.doesNotMatch(result.stderr, /could not be fetched/);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('annotated tags outside main history are rejected', () => {
  const f = fixture();
  try {
    git(f.source, 'checkout', '--orphan', 'outside');
    git(f.source, 'rm', '-rf', '.');
    writeFileSync(join(f.source, 'outside.txt'), 'outside\n');
    git(f.source, 'add', 'outside.txt');
    git(f.source, 'commit', '-m', 'outside source');
    const outside = git(f.source, 'rev-parse', 'HEAD');
    git(f.source, 'tag', '-a', 'v1.2.1', '-m', 'v1.2.1', outside);
    git(f.source, 'push', 'origin', 'refs/tags/v1.2.1');
    const result = runValidator(f.checkout, 'v1.2.1', outside);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /protected main history/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('unavailable tag refs fail closed', () => {
  const f = fixture();
  try {
    const result = runValidator(f.checkout, 'v1.2.9', f.commit);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /could not be fetched/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('annotated tags that do not resolve to commits fail closed', () => {
  const f = fixture();
  try {
    const blob = git(f.source, 'hash-object', '-w', 'release.txt');
    git(f.source, 'tag', '-a', 'v1.2.1', '-m', 'v1.2.1', blob);
    git(f.source, 'push', 'origin', 'refs/tags/v1.2.1');
    const result = runValidator(f.checkout, 'v1.2.1', f.commit);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /did not resolve to a commit/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
