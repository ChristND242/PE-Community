import { compareVersions, parseVersion, validateManifest, type ReleaseManifest } from './domain.js';
import type { ManifestAttestationVerifier, ProvenanceVerificationResult } from './provenance.js';

const RELEASES_URL = 'https://api.github.com/repos/Pona-Ekolo/PE-Community/releases/latest';
const GIT_API_PREFIX = 'https://api.github.com/repos/Pona-Ekolo/PE-Community/git/';
const MANIFEST_NAME = 'pe-community-update-manifest.json';
const MANIFEST_ATTESTATION_NAME = 'pe-community-update-manifest.attestation.json';
const MAX_RELEASE_BYTES = 1024 * 1024;
const MAX_MANIFEST_BYTES = 128 * 1024;
const MANIFEST_PREFIX = 'https://github.com/Pona-Ekolo/PE-Community/releases/download/';
const MANIFEST_REDIRECT_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

export type AgentRelease = {
  version: string;
  releaseUrl: string;
  publishedAt: string;
  notes: string;
  manifest: ReleaseManifest;
  manifestProvenance: ProvenanceVerificationResult;
};

export interface ReleaseProvider {
  latest(): Promise<AgentRelease>;
  target(version: string): Promise<AgentRelease>;
}

export class GitHubReleaseProvider implements ReleaseProvider {
  constructor(
    private readonly request: typeof fetch,
    private readonly manifestVerifier: ManifestAttestationVerifier,
  ) {}

  async latest() {
    return this.load(RELEASES_URL);
  }

  async target(version: string) {
    const target = parseVersion(version).normalized;
    return this.load(`https://api.github.com/repos/Pona-Ekolo/PE-Community/releases/tags/${encodeURIComponent(target)}`);
  }

  private async load(url: string): Promise<AgentRelease> {
    const response = await this.request(url, { redirect: 'error', headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'pe-community-updater' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`RELEASE_DISCOVERY_FAILED_${response.status}`);
    const release = await boundedJson(response, MAX_RELEASE_BYTES);
    if (!isObject(release)) throw new Error('RELEASE_INVALID');
    if (release.draft === true || release.prerelease === true) throw new Error('RELEASE_NOT_STABLE');
    const version = parseVersion(release.tag_name).normalized;
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const requiredAssetNames = new Set([
      MANIFEST_NAME,
      MANIFEST_ATTESTATION_NAME,
      `pe-community-updater-${version}.tar.gz`,
    ]);
    const assetNames = assets.map((asset) => isObject(asset) ? asset.name : null);
    if (
      assetNames.length !== requiredAssetNames.size ||
      assetNames.some((name) => typeof name !== 'string' || !requiredAssetNames.has(name)) ||
      new Set(assetNames).size !== requiredAssetNames.size
    ) throw new Error('RELEASE_ASSET_INVENTORY_INVALID');
    const manifestAssets = assets.filter((asset): asset is Record<string, unknown> => isObject(asset) && asset.name === MANIFEST_NAME);
    if (manifestAssets.length !== 1) throw new Error('RELEASE_MANIFEST_INVALID_COUNT');
    const manifestAsset = manifestAssets[0];
    if (!manifestAsset || typeof manifestAsset.browser_download_url !== 'string') throw new Error('RELEASE_MANIFEST_MISSING');
    if (!manifestAsset.browser_download_url.startsWith(MANIFEST_PREFIX)) throw new Error('RELEASE_MANIFEST_URL_INVALID');
    const manifestResponse = await fetchManifest(this.request, manifestAsset.browser_download_url);
    if (!manifestResponse.ok) throw new Error('RELEASE_MANIFEST_UNAVAILABLE');
    const manifestPayload = await boundedBytes(manifestResponse, MAX_MANIFEST_BYTES, 'MANIFEST_TOO_LARGE');
    const taggedCommit = await this.resolveAnnotatedTagCommit(version);
    const manifestProvenance = await this.manifestVerifier.verify({
      payload: manifestPayload,
      releaseTag: version,
      sourceCommit: taggedCommit,
    });
    let manifestValue: unknown;
    try {
      manifestValue = JSON.parse(new TextDecoder().decode(manifestPayload)) as unknown;
    } catch {
      throw new Error('MANIFEST_SCHEMA_INVALID');
    }
    let manifest: ReleaseManifest;
    try {
      manifest = validateManifest(manifestValue);
    } catch (error) {
      if (error instanceof Error && error.message === 'RELEASE_CONTRACT_UNSUPPORTED') throw error;
      throw new Error('MANIFEST_SCHEMA_INVALID');
    }
    if (compareVersions(manifest.version, version) !== 0) throw new Error('RELEASE_MANIFEST_VERSION_MISMATCH');
    if (manifest.releaseTag !== version) throw new Error('PROVENANCE_RELEASE_TAG_MISMATCH');
    if (taggedCommit !== manifest.sourceCommit)
      throw new Error('MANIFEST_ATTESTATION_SOURCE_MISMATCH');
    return {
      version,
      releaseUrl: typeof release.html_url === 'string' ? release.html_url : 'https://github.com/Pona-Ekolo/PE-Community/releases',
      publishedAt: typeof release.published_at === 'string' ? release.published_at : '',
      notes: typeof release.body === 'string' ? release.body.slice(0, 20_000) : '',
      manifest,
      manifestProvenance,
    };
  }

  private async resolveAnnotatedTagCommit(tag: string) {
    const reference = await this.githubJson(`${GIT_API_PREFIX}ref/tags/${encodeURIComponent(tag)}`);
    const tagObject = isObject(reference.object) ? reference.object : null;
    if (!tagObject || tagObject.type !== 'tag' || typeof tagObject.sha !== 'string' || !/^[a-f0-9]{40}$/.test(tagObject.sha))
      throw new Error('RELEASE_TAG_NOT_ANNOTATED');
    const annotatedTag = await this.githubJson(`${GIT_API_PREFIX}tags/${tagObject.sha}`);
    const target = isObject(annotatedTag.object) ? annotatedTag.object : null;
    if (!target || target.type !== 'commit' || typeof target.sha !== 'string' || !/^[a-f0-9]{40}$/.test(target.sha))
      throw new Error('RELEASE_TAG_TARGET_INVALID');
    return target.sha;
  }

  private async githubJson(url: string) {
    const response = await this.request(url, {
      redirect: 'error',
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'pe-community-updater',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`RELEASE_SOURCE_LOOKUP_FAILED_${response.status}`);
    const value = await boundedJson(response, MAX_RELEASE_BYTES);
    if (!isObject(value)) throw new Error('RELEASE_SOURCE_INVALID');
    return value;
  }
}

async function fetchManifest(request: typeof fetch, initialUrl: string) {
  let url = initialUrl;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !MANIFEST_REDIRECT_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) throw new Error('RELEASE_MANIFEST_REDIRECT_INVALID');
    const response = await request(url, { redirect: 'manual', headers: { accept: 'application/json', 'user-agent': 'pe-community-updater' }, signal: AbortSignal.timeout(15_000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || redirect === 3) throw new Error('RELEASE_MANIFEST_REDIRECT_INVALID');
    url = new URL(location, url).toString();
  }
  throw new Error('RELEASE_MANIFEST_REDIRECT_INVALID');
}

async function boundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await boundedBytes(response, maximumBytes, 'RESPONSE_TOO_LARGE'))) as unknown;
}

async function boundedBytes(response: Response, maximumBytes: number, tooLargeCode: string): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maximumBytes) throw new Error(tooLargeCode);
  if (!response.body) {
    const payload = new TextEncoder().encode(await response.text());
    if (payload.byteLength > maximumBytes) throw new Error(tooLargeCode);
    return payload;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Error(tooLargeCode);
    }
    chunks.push(value);
  }
  const payload = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return payload;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
