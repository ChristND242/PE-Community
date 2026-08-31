import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  GitHubReleaseApi,
  publishReleaseDraftWithPolicy,
} from '../publish-release-draft.mjs';

const PRODUCTION_REPOSITORY = 'Pona-Ekolo/PE-Community';
const INTEGRATION_REPOSITORY = 'Pona-Ekolo/PE-Community-Release-Test';
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,63}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;

function fail(code) {
  throw new Error(code);
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function normalizeRepository(value) {
  if (typeof value !== 'string' || !REPOSITORY_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

export function testTagPrefix(runId) {
  return `release-test-${runId}-`;
}
export function isOwnedTestTag(tag, runId) {
  return new RegExp(
    `^${escapeRegex(testTagPrefix(runId))}[a-z][a-z0-9-]{0,31}$`,
  ).test(tag);
}

export function validateIntegrationConfig(config) {
  if (!config.token) fail('INTEGRATION_TOKEN_REQUIRED');
  const normalizedRepository = normalizeRepository(config.repository);
  if (!normalizedRepository) fail('INTEGRATION_REPOSITORY_INVALID');
  if (normalizedRepository === PRODUCTION_REPOSITORY.toLowerCase())
    fail('INTEGRATION_PRODUCTION_REPOSITORY_FORBIDDEN');
  if (normalizedRepository !== INTEGRATION_REPOSITORY.toLowerCase())
    fail('INTEGRATION_REPOSITORY_NOT_ALLOWED');
  if (!RUN_ID_PATTERN.test(config.runId ?? ''))
    fail('INTEGRATION_RUN_ID_INVALID');
  if (!COMMIT_PATTERN.test(config.sourceCommit ?? ''))
    fail('INTEGRATION_SOURCE_COMMIT_INVALID');
  if (config.cleanup && config.confirmRunId !== config.runId)
    fail('INTEGRATION_CLEANUP_CONFIRMATION_REQUIRED');
  return {
    ...config,
    tagPrefix: testTagPrefix(config.runId),
    tagPattern: new RegExp(
      `^${escapeRegex(testTagPrefix(config.runId))}[a-z][a-z0-9-]{0,31}$`,
    ),
  };
}

function artifact(name, content) {
  const bytes = Buffer.isBuffer(content)
    ? Buffer.from(content)
    : Buffer.from(content, 'utf8');
  return {
    name,
    content: bytes,
    size: bytes.length,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
}

export function createIntegrationArtifacts(runId) {
  return [
    artifact('release-test-manifest.json', `manifest:${runId}\n`),
    artifact('release-test-attestation.json', `attestation:${runId}\n`),
    artifact('release-test-updater.tar.gz', `updater:${runId}\n`),
  ];
}

export function createCollisionArtifact(expected) {
  const content = Buffer.from(expected.content);
  if (content.length === 0) fail('INTEGRATION_COLLISION_FIXTURE_INVALID');
  content[0] ^= 1;
  const collision = artifact(expected.name, content);
  if (
    collision.name !== expected.name ||
    collision.size !== expected.size ||
    collision.digest === expected.digest ||
    collision.content.equals(expected.content)
  ) {
    fail('INTEGRATION_COLLISION_FIXTURE_INVALID');
  }
  return collision;
}

export function safeResult(result) {
  return {
    name: result.name,
    status: result.status,
    tag: result.tag,
    releaseId: result.releaseId,
    releaseUrl: result.releaseUrl,
    assets: result.assets,
    error: result.error,
  };
}

async function createAnnotatedTag(api, config, tag) {
  if (!isOwnedTestTag(tag, config.runId)) fail('INTEGRATION_TAG_INVALID');
  const tagResponse = await api.request(
    `https://api.github.com/repos/${config.repository}/git/tags`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag,
        message: `PE Community release integration ${config.runId}`,
        object: config.sourceCommit,
        type: 'commit',
      }),
    },
  );
  const tagObject = await tagResponse.json();
  if (!COMMIT_PATTERN.test(tagObject.sha ?? ''))
    fail('INTEGRATION_TAG_OBJECT_INVALID');
  await api.request(
    `https://api.github.com/repos/${config.repository}/git/refs`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/tags/${tag}`, sha: tagObject.sha }),
    },
  );
}

async function prepareDraft(api, config, tag) {
  await createAnnotatedTag(api, config, tag);
  const created = await api.createDraft({
    tag,
    sourceCommit: config.sourceCommit,
    name: tag,
    body: `PE Community release integration ${config.runId}`,
  });
  if (
    !Number.isSafeInteger(created.id) ||
    created.tag_name !== tag ||
    created.draft !== true
  )
    fail('INTEGRATION_DRAFT_CREATE_INVALID');
  return api.getRelease(created.id);
}

function inputFor(config, artifacts, tag) {
  return {
    repository: config.repository,
    tag,
    sourceCommit: config.sourceCommit,
    artifacts,
  };
}
function releaseSummary(name, tag, release) {
  return safeResult({
    name,
    status: 'PASS',
    tag,
    releaseId: release.id,
    releaseUrl: release.html_url,
    assets: (release.assets ?? []).map(({ name: assetName, size, digest }) => ({
      name: assetName,
      size,
      digest,
    })),
  });
}

export async function expectFailure(name, tag, expectedError, action) {
  try {
    await action();
    fail('INTEGRATION_EXPECTED_FAILURE_MISSING');
  } catch (error) {
    const actualError =
      error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    if (actualError === 'INTEGRATION_EXPECTED_FAILURE_MISSING') throw error;
    if (actualError !== expectedError)
      throw new Error(
        `INTEGRATION_EXPECTED_ERROR_MISMATCH scenario=${name} expected=${expectedError} actual=${actualError}`,
      );
    return safeResult({
      name,
      status: 'PASS',
      tag,
      error: actualError,
    });
  }
}

export async function runIntegration(config, fetchImpl = fetch) {
  const validated = validateIntegrationConfig(config);
  const api = new GitHubReleaseApi(
    validated.repository,
    validated.token,
    fetchImpl,
  );
  const artifacts = createIntegrationArtifacts(validated.runId);
  const policy = {
    repository: validated.repository,
    tagPattern: validated.tagPattern,
  };
  const results = [];
  const tag = (suffix) => `${validated.tagPrefix}${suffix}`;

  const cleanTag = tag('clean');
  await createAnnotatedTag(api, validated, cleanTag);
  const clean = await publishReleaseDraftWithPolicy(
    api,
    inputFor(validated, artifacts, cleanTag),
    policy,
  );
  results.push(releaseSummary('clean-creation', cleanTag, clean));

  const partialTag = tag('partial');
  const partialDraft = await prepareDraft(api, validated, partialTag);
  await api.uploadAsset(partialDraft, artifacts[0]);
  const partial = await publishReleaseDraftWithPolicy(
    api,
    inputFor(validated, artifacts, partialTag),
    policy,
  );
  results.push(releaseSummary('partial-resume', partialTag, partial));

  const completeTag = tag('complete');
  const completeDraft = await prepareDraft(api, validated, completeTag);
  for (const currentArtifact of artifacts)
    await api.uploadAsset(completeDraft, currentArtifact);
  const complete = await publishReleaseDraftWithPolicy(
    api,
    inputFor(validated, artifacts, completeTag),
    policy,
  );
  results.push(releaseSummary('complete-draft', completeTag, complete));

  const collisionTag = tag('collision');
  const collisionDraft = await prepareDraft(api, validated, collisionTag);
  const collision = createCollisionArtifact(artifacts[0]);
  await api.uploadAsset(collisionDraft, collision);
  results.push(
    await expectFailure(
      'collision',
      collisionTag,
      'RELEASE_ASSET_DIGEST_MISMATCH',
      () =>
        publishReleaseDraftWithPolicy(
          api,
          inputFor(validated, artifacts, collisionTag),
          policy,
        ),
    ),
  );

  const extraTag = tag('unexpected');
  const extraDraft = await prepareDraft(api, validated, extraTag);
  await api.uploadAsset(
    extraDraft,
    artifact('unexpected.txt', `unexpected:${validated.runId}\n`),
  );
  results.push(
    await expectFailure(
      'unexpected-asset',
      extraTag,
      'RELEASE_ASSET_UNEXPECTED',
      () =>
        publishReleaseDraftWithPolicy(
          api,
          inputFor(validated, artifacts, extraTag),
          policy,
        ),
    ),
  );
  results.push(
    await expectFailure(
      'published-immutable',
      cleanTag,
      'RELEASE_ALREADY_PUBLISHED',
      () =>
        publishReleaseDraftWithPolicy(
          api,
          inputFor(validated, artifacts, cleanTag),
          policy,
        ),
    ),
  );
  return {
    runId: validated.runId,
    repository: validated.repository,
    results: results.map(safeResult),
  };
}

export async function cleanupIntegration(config, fetchImpl = fetch) {
  const validated = validateIntegrationConfig({ ...config, cleanup: true });
  const api = new GitHubReleaseApi(
    validated.repository,
    validated.token,
    fetchImpl,
  );
  const releases = await api.listReleases();
  const targets = releases.filter((release) =>
    isOwnedTestTag(release.tag_name, validated.runId),
  );
  for (const release of targets)
    await api.request(
      `https://api.github.com/repos/${validated.repository}/releases/${release.id}`,
      { method: 'DELETE' },
    );
  const refsResponse = await api.request(
    `https://api.github.com/repos/${validated.repository}/git/matching-refs/tags/${encodeURIComponent(validated.tagPrefix)}`,
  );
  const refs = await refsResponse.json();
  if (!Array.isArray(refs)) fail('INTEGRATION_REFS_INVALID');
  const deletedTags = [];
  for (const ref of refs) {
    const tag = String(ref.ref ?? '').replace(/^refs\/tags\//, '');
    if (!isOwnedTestTag(tag, validated.runId))
      fail('INTEGRATION_CLEANUP_REF_INVALID');
    await api.request(
      `https://api.github.com/repos/${validated.repository}/git/refs/tags/${encodeURIComponent(tag)}`,
      { method: 'DELETE' },
    );
    deletedTags.push(tag);
  }
  return {
    runId: validated.runId,
    repository: validated.repository,
    deletedReleaseIds: targets.map(({ id }) => id),
    deletedTags,
  };
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--cleanup') values.cleanup = true;
    else if (value.startsWith('--')) values[value.slice(2)] = argv[++index];
    else fail('INTEGRATION_ARGUMENT_INVALID');
  }
  return values;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const config = {
    repository: args.repository,
    runId:
      args['run-id'] ?? `local-${Date.now()}-${randomBytes(4).toString('hex')}`,
    sourceCommit: args['source-commit'],
    token: process.env.GH_TOKEN,
    cleanup: args.cleanup === true,
    confirmRunId: args['confirm-run-id'],
  };
  const result = config.cleanup
    ? await cleanupIntegration(config)
    : await runIntegration(config);
  console.log(JSON.stringify(result, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'INTEGRATION_FAILED',
    );
    process.exitCode = 1;
  });
}
