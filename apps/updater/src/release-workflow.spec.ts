import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateManifest } from './domain.js';

test('release workflow is SHA-pinned, least-privilege, draft-first, and inventory-gated', async () => {
  const workflow = await readFile(
    new URL('../../../.github/workflows/publish-images.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /push:\s*\n\s*tags:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /mode=release/);
  assert.match(workflow, /mode=validation/);
  assert.match(workflow, /image_tag=validation-\$RUN_ID/);
  assert.match(
    workflow,
    /Supply-chain validation must run from an existing annotated release tag/,
  );
  assert.match(workflow, /gh release create[^\n]+--draft/);
  assert.match(workflow, /git cat-file -t/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /git fetch --no-tags origin main/);
  assert.match(workflow, /refs\/remotes\/origin\/main/);
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
  assert.match(workflow, /Release asset inventory mismatch/);
  assert.match(workflow, /Release asset digest mismatch/);
  assert.match(
    workflow,
    /pe-community-updater-\$\{VERSION\}-linux-amd64\.tar\.gz/,
  );
  assert.match(
    workflow,
    /pe-community-updater-\$\{VERSION\}-linux-arm64\.tar\.gz/,
  );
  assert.match(workflow, /verifyPinnedArchive/);
  assert.match(workflow, /verifyUpstreamArchiveEntries/);
  assert.match(workflow, /verifyBundleEntries/);
  assert.match(workflow, /verify-bundled-provenance\.mjs/);
  assert.match(
    workflow,
    /Verify generated bundled CLI against live image provenance/,
  );
  assert.match(workflow, /Verify provenance policy rejects a wrong repository/);
  assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /github-cli-MIT\.txt/);
  assert.match(
    workflow,
    /tar --owner=0 --group=0 --numeric-owner --mode='u=rwX,go=rX'/,
  );
  assert.match(workflow, /GH_VERSION=2\.93\.0/);
  assert.match(workflow, /gh_\$\{GH_VERSION\}_linux_amd64\.tar\.gz/);
  assert.match(workflow, /gh_\$\{GH_VERSION\}_linux_arm64\.tar\.gz/);
  assert.match(workflow, /gh release edit[^\n]+--draft=false/);
  assert.match(
    workflow,
    /publish-release:\s*\n\s*if: github\.event_name == 'push'/,
  );
  assert.match(workflow, /if: needs\.validate\.outputs\.mode == 'validation'/);
  assert.doesNotMatch(workflow, /release:\s*\n\s*types:\s*\[published\]/);
  assert.doesNotMatch(workflow, /--clobber/);
  assert.doesNotMatch(workflow, /ghcr\.io\/[^\s]+:latest/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /\/usr\/bin\/gh/);
  const imageJob = workflow.slice(
    workflow.indexOf('  image:'),
    workflow.indexOf('  artifacts:'),
  );
  assert.doesNotMatch(imageJob, /contents:\s*write/);
  const sharedValidationJobs = workflow.slice(
    workflow.indexOf('  image:'),
    workflow.indexOf('  publish-release:'),
  );
  assert.doesNotMatch(
    sharedValidationJobs,
    /gh release (?:create|upload|edit)/,
  );
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
