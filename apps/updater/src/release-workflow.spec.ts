import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateManifest } from './domain.js';

test('release workflow is SHA-pinned, least-privilege, draft-first, and inventory-gated', async () => {
  const [workflow, validator, publisher] = await Promise.all([
    readFile(
      new URL('../../../.github/workflows/publish-images.yml', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL(
        '../../../.github/scripts/validate-release-ref.sh',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL(
        '../../../.github/scripts/publish-release-draft.mjs',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);
  assert.match(workflow, /push:\s*\n\s*tags:/);
  assert.match(workflow, /node \.github\/scripts\/publish-release-draft\.mjs/);
  assert.match(workflow, /RELEASE_REF_TYPE: \$\{\{ github\.ref_type \}\}/);
  assert.match(workflow, /CHECKOUT_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /bash \.github\/scripts\/validate-release-ref\.sh/);
  assert.match(workflow, /fetch-tags: false/);
  assert.match(validator, /RELEASE_REF_TYPE.*== "tag"/);
  assert.match(validator, /RELEASE_REF.*== "refs\/tags\/\$RELEASE_TAG"/);
  assert.match(
    validator,
    /git fetch --force --no-tags origin "\$tag_ref:\$tag_ref"/,
  );
  assert.match(validator, /git cat-file -t "\$tag_ref"/);
  assert.match(validator, /git rev-parse "\$tag_ref\^\{commit\}"/);
  assert.match(validator, /git rev-parse "\$CHECKOUT_SHA\^\{commit\}"/);
  assert.match(
    validator,
    /git merge-base --is-ancestor "\$source_commit" "\$main_ref"/,
  );
  assert.match(validator, /\+refs\/heads\/main:\$main_ref/);
  assert.equal(
    (workflow.match(/actions\/attest-build-provenance@[a-f0-9]{40}/g) ?? [])
      .length,
    4,
  );
  const actionUses = [...workflow.matchAll(/uses:\s*[^\s@]+@([^\s#]+)/g)].map(
    (match) => match[1],
  );
  assert.ok(actionUses.length > 0);
  assert.ok(actionUses.every((reference) => /^[a-f0-9]{40}$/.test(reference)));
  assert.match(
    workflow,
    /attestationPolicy:\\?"GITHUB_PROVENANCE_REQUIRED\\?"/,
  );
  assert.match(workflow, /releaseContractVersion:1/);
  assert.match(workflow, /releaseTag:\$version/);
  assert.match(workflow, /subject-path: pe-community-update-manifest\.json/);
  assert.match(workflow, /needs: \[validate, image\]/);
  assert.match(publisher, /releases\?per_page=100/);
  assert.match(publisher, /releases\/\$\{releaseId\}/);
  assert.match(publisher, /RELEASE_ASSET_DIGEST_MISMATCH/);
  assert.match(publisher, /RELEASE_ASSET_UNEXPECTED/);
  assert.match(publisher, /draft: false/);
  assert.doesNotMatch(publisher, /releases\/tags/);
  assert.doesNotMatch(workflow, /release:\s*\n\s*types:\s*\[published\]/);
  assert.doesNotMatch(workflow, /--clobber/);
  assert.doesNotMatch(workflow, /ghcr\.io\/[^\s]+:latest/);
  const imageJob = workflow.slice(
    workflow.indexOf('  image:'),
    workflow.indexOf('  publish:'),
  );
  assert.doesNotMatch(imageJob, /contents:\s*write/);
  assert.equal((workflow.match(/contents:\s*write/g) ?? []).length, 1);
  assert.equal(
    (
      workflow.match(
        /APP_VERSION=\$\{\{ needs\.validate\.outputs\.version \}\}/g,
      ) ?? []
    ).length,
    3,
  );
  assert.equal(
    (
      workflow.match(
        /SOURCE_COMMIT=\$\{\{ needs\.validate\.outputs\.source_commit \}\}/g,
      ) ?? []
    ).length,
    3,
  );
  assert.equal(
    (
      workflow.match(
        /BUILD_DATE=\$\{\{ needs\.validate\.outputs\.build_date \}\}/g,
      ) ?? []
    ).length,
    3,
  );
  assert.equal(
    (
      workflow.match(
        /ref: \$\{\{ needs\.validate\.outputs\.source_commit \}\}/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(publisher, /target_commitish: input\.sourceCommit/);
  for (const dockerfilePath of [
    '../../api/Dockerfile',
    '../../web/Dockerfile',
    '../../worker/Dockerfile',
  ]) {
    const dockerfile = await readFile(
      new URL(dockerfilePath, import.meta.url),
      'utf8',
    );
    assert.match(
      dockerfile,
      /org\.opencontainers\.image\.version=\$\{APP_VERSION\}/,
    );
    assert.match(
      dockerfile,
      /org\.opencontainers\.image\.revision=\$\{SOURCE_COMMIT\}/,
    );
    assert.match(
      dockerfile,
      /org\.opencontainers\.image\.created=\$\{BUILD_DATE\}/,
    );
  }
});

test('workflow-shaped manifest fixture satisfies release contract version one', () => {
  const version = 'v1.2.3';
  const manifest = validateManifest({
    schemaVersion: 2,
    releaseContractVersion: 1,
    version,
    releaseTag: version,
    channel: 'stable',
    minimumVersion: 'v0.1.0',
    minimumUpdaterVersion: 'v1.3.0',
    sourceCommit: 'd'.repeat(40),
    buildDate: '2026-08-31T00:00:00Z',
    images: {
      api: {
        repository: 'ghcr.io/pona-ekolo/pe-community-api',
        digest: `sha256:${'a'.repeat(64)}`,
      },
      web: {
        repository: 'ghcr.io/pona-ekolo/pe-community-web',
        digest: `sha256:${'b'.repeat(64)}`,
      },
      worker: {
        repository: 'ghcr.io/pona-ekolo/pe-community-worker',
        digest: `sha256:${'c'.repeat(64)}`,
      },
    },
    database: { migrationCompatibility: 'FORWARD_ONLY' },
    supplyChain: { attestationPolicy: 'GITHUB_PROVENANCE_REQUIRED' },
    requiresManualAction: false,
  });
  assert.equal(manifest.releaseContractVersion, 1);
});

test('unsupported future release contracts fail closed', () => {
  assert.throws(
    () =>
      validateManifest({
        schemaVersion: 2,
        releaseContractVersion: 2,
        version: 'v1.2.3',
        releaseTag: 'v1.2.3',
        channel: 'stable',
        minimumVersion: 'v0.1.0',
        minimumUpdaterVersion: 'v1.3.0',
        sourceCommit: 'd'.repeat(40),
        images: {
          api: {
            repository: 'ghcr.io/pona-ekolo/pe-community-api',
            digest: `sha256:${'a'.repeat(64)}`,
          },
          web: {
            repository: 'ghcr.io/pona-ekolo/pe-community-web',
            digest: `sha256:${'b'.repeat(64)}`,
          },
          worker: {
            repository: 'ghcr.io/pona-ekolo/pe-community-worker',
            digest: `sha256:${'c'.repeat(64)}`,
          },
        },
        database: { migrationCompatibility: 'FORWARD_ONLY' },
        supplyChain: { attestationPolicy: 'GITHUB_PROVENANCE_REQUIRED' },
        requiresManualAction: false,
      }),
    /RELEASE_CONTRACT_UNSUPPORTED/,
  );
});
