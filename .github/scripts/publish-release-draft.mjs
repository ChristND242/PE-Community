import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const API_VERSION = '2022-11-28';
const EXPECTED_REPOSITORY = 'Pona-Ekolo/PE-Community';
const SEMVER_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;

function fail(code) {
  throw new Error(code);
}

function assertReleaseIdentity(release, input, expectedDraft) {
  if (!release || !Number.isSafeInteger(release.id) || release.id <= 0)
    fail('RELEASE_ID_INVALID');
  if (release.tag_name !== input.tag) fail('RELEASE_TAG_MISMATCH');
  if (release.name !== input.tag) fail('RELEASE_NAME_MISMATCH');
  if (release.target_commitish !== input.sourceCommit)
    fail('RELEASE_TARGET_MISMATCH');
  if (release.prerelease !== false) fail('RELEASE_PRERELEASE_INVALID');
  if (release.draft !== expectedDraft)
    fail(expectedDraft ? 'RELEASE_NOT_DRAFT' : 'RELEASE_NOT_PUBLISHED');
}

function validateAssetInventory(release, artifacts, requireComplete) {
  const expected = new Map(
    artifacts.map((artifact) => [artifact.name, artifact]),
  );
  const seen = new Set();

  for (const asset of release.assets ?? []) {
    if (seen.has(asset.name)) fail('RELEASE_ASSET_DUPLICATE');
    seen.add(asset.name);
    const artifact = expected.get(asset.name);
    if (!artifact) fail('RELEASE_ASSET_UNEXPECTED');
    if (asset.size !== artifact.size) fail('RELEASE_ASSET_SIZE_MISMATCH');
    if (asset.digest !== artifact.digest) fail('RELEASE_ASSET_DIGEST_MISMATCH');
  }

  if (requireComplete && seen.size !== expected.size)
    fail('RELEASE_ASSET_INVENTORY_INCOMPLETE');
  return seen;
}

function selectRelease(releases, input) {
  const candidates = releases.filter(
    (release) => release.tag_name === input.tag || release.name === input.tag,
  );
  if (candidates.some((release) => release.draft === false))
    fail('RELEASE_ALREADY_PUBLISHED');
  if (candidates.length > 1) fail('RELEASE_DRAFT_AMBIGUOUS');
  if (candidates.length === 0) return null;
  assertReleaseIdentity(candidates[0], input, true);
  return candidates[0];
}

export async function publishReleaseDraft(api, input) {
  if (input.repository !== EXPECTED_REPOSITORY)
    fail('RELEASE_REPOSITORY_MISMATCH');
  if (!SEMVER_TAG.test(input.tag)) fail('RELEASE_TAG_INVALID');
  if (!COMMIT_SHA.test(input.sourceCommit))
    fail('RELEASE_SOURCE_COMMIT_INVALID');
  if (
    input.artifacts.length !== 3 ||
    new Set(input.artifacts.map(({ name }) => name)).size !== 3
  ) {
    fail('RELEASE_EXPECTED_ASSETS_INVALID');
  }

  let release = selectRelease(await api.listReleases(), input);
  if (!release) {
    const created = await api.createDraft({
      tag: input.tag,
      sourceCommit: input.sourceCommit,
      name: input.tag,
      body: `PE Community ${input.tag}`,
    });
    assertReleaseIdentity(created, input, true);
    const discovered = selectRelease(await api.listReleases(), input);
    if (!discovered || discovered.id !== created.id)
      fail('RELEASE_DRAFT_DISCOVERY_MISMATCH');
    release = discovered;
  }

  assertReleaseIdentity(release, input, true);
  const existingNames = validateAssetInventory(release, input.artifacts, false);
  for (const artifact of input.artifacts) {
    if (!existingNames.has(artifact.name))
      await api.uploadAsset(release.id, artifact);
  }

  release = await api.getRelease(release.id);
  assertReleaseIdentity(release, input, true);
  validateAssetInventory(release, input.artifacts, true);

  const published = await api.publishRelease(release.id, {
    tag: input.tag,
    sourceCommit: input.sourceCommit,
    name: input.tag,
  });
  assertReleaseIdentity(published, input, false);

  const verified = await api.getRelease(release.id);
  assertReleaseIdentity(verified, input, false);
  validateAssetInventory(verified, input.artifacts, true);
  if (
    !verified.html_url?.endsWith(
      `/releases/tag/${encodeURIComponent(input.tag)}`,
    )
  ) {
    fail('RELEASE_URL_MISMATCH');
  }
  return verified;
}

class GitHubReleaseApi {
  constructor(repository, token) {
    this.repository = repository;
    this.token = token;
  }

  async request(url, init = {}) {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'pe-community-release-publisher',
        ...init.headers,
      },
    });
    if (!response.ok) fail(`GITHUB_API_HTTP_${response.status}`);
    return response;
  }

  async listReleases() {
    const releases = [];
    for (let page = 1; page <= 10; page += 1) {
      const response = await this.request(
        `https://api.github.com/repos/${this.repository}/releases?per_page=100&page=${page}`,
      );
      const batch = await response.json();
      if (!Array.isArray(batch)) fail('GITHUB_RELEASE_LIST_INVALID');
      releases.push(...batch);
      if (batch.length < 100) return releases;
    }
    fail('GITHUB_RELEASE_LIST_PAGINATION_LIMIT');
  }

  async createDraft(input) {
    const response = await this.request(
      `https://api.github.com/repos/${this.repository}/releases`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_name: input.tag,
          target_commitish: input.sourceCommit,
          name: input.name,
          body: input.body,
          draft: true,
          prerelease: false,
        }),
      },
    );
    return response.json();
  }

  async uploadAsset(releaseId, artifact) {
    const response = await this.request(
      `https://uploads.github.com/repos/${this.repository}/releases/${releaseId}/assets?name=${encodeURIComponent(artifact.name)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: artifact.content,
      },
    );
    return response.json();
  }

  async getRelease(releaseId) {
    const response = await this.request(
      `https://api.github.com/repos/${this.repository}/releases/${releaseId}`,
    );
    return response.json();
  }

  async publishRelease(releaseId, input) {
    const response = await this.request(
      `https://api.github.com/repos/${this.repository}/releases/${releaseId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_name: input.tag,
          target_commitish: input.sourceCommit,
          name: input.name,
          draft: false,
          prerelease: false,
          make_latest: 'true',
        }),
      },
    );
    return response.json();
  }
}

async function loadArtifact(path) {
  const [content, metadata] = await Promise.all([readFile(path), stat(path)]);
  return {
    name: path,
    content,
    size: metadata.size,
    digest: `sha256:${createHash('sha256').update(content).digest('hex')}`,
  };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  const tag = process.env.RELEASE_TAG ?? '';
  const sourceCommit = process.env.SOURCE_COMMIT ?? '';
  const token = process.env.GH_TOKEN ?? '';
  const version = process.env.VERSION ?? '';
  if (!token) fail('GITHUB_TOKEN_REQUIRED');
  if (version !== tag) fail('RELEASE_VERSION_MISMATCH');

  const names = [
    'pe-community-update-manifest.json',
    'pe-community-update-manifest.attestation.json',
    `pe-community-updater-${version}.tar.gz`,
  ];
  const artifacts = await Promise.all(names.map(loadArtifact));
  const release = await publishReleaseDraft(
    new GitHubReleaseApi(repository, token),
    {
      repository,
      tag,
      sourceCommit,
      artifacts,
    },
  );
  console.log(
    `Published validated release ${release.tag_name} (release ID ${release.id}).`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'RELEASE_PUBLICATION_FAILED',
    );
    process.exitCode = 1;
  });
}
