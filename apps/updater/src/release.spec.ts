import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ALLOWED_IMAGE_REPOSITORIES } from './domain.js';
import type { ManifestAttestationVerifier } from './provenance.js';
import { GitHubReleaseProvider } from './release.js';

const manifest = {
  schemaVersion: 2,
  releaseContractVersion: 1,
  version: 'v1.2.3',
  releaseTag: 'v1.2.3',
  sourceCommit: 'd'.repeat(40),
  channel: 'stable',
  minimumVersion: 'v1.0.0',
  minimumUpdaterVersion: 'v1.1.0',
  images: Object.fromEntries(
    Object.entries(ALLOWED_IMAGE_REPOSITORIES).map(
      ([service, repository], index) => [
        service,
        { repository, digest: `sha256:${['a', 'b', 'c'][index].repeat(64)}` },
      ],
    ),
  ),
  database: { migrationCompatibility: 'FORWARD_ONLY' },
  supplyChain: { attestationPolicy: 'DIGEST_ONLY' },
  requiresManualAction: false,
};

test('release provider accepts one bounded manifest from the fixed release source', async () => {
  const request = async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes('/git/ref/tags/'))
      return jsonResponse({ object: { type: 'tag', sha: 'e'.repeat(40) } });
    if (value.includes('/git/tags/'))
      return jsonResponse({
        object: { type: 'commit', sha: manifest.sourceCommit },
      });
    if (value.includes('/releases/tags/')) {
      return jsonResponse({
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        assets: releaseAssets(),
      });
    }
    return jsonResponse(manifest);
  };
  const release = await releaseProvider(request as typeof fetch).target(
    'v1.2.3',
  );
  assert.equal(release.manifest.version, 'v1.2.3');
});

test('manifest attestation is verified before schema fields are trusted', async () => {
  let verifierCalls = 0;
  const rejectingVerifier: ManifestAttestationVerifier = {
    async verify() {
      verifierCalls += 1;
      throw new Error('MANIFEST_ATTESTATION_INVALID');
    },
  };
  const request = async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes('/releases/tags/'))
      return jsonResponse({
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        assets: releaseAssets(),
      });
    if (value.includes('/git/ref/tags/'))
      return jsonResponse({ object: { type: 'tag', sha: 'e'.repeat(40) } });
    if (value.includes('/git/tags/'))
      return jsonResponse({
        object: { type: 'commit', sha: manifest.sourceCommit },
      });
    return new Response('{not valid json', { status: 200 });
  };
  await assert.rejects(
    () =>
      new GitHubReleaseProvider(
        request as typeof fetch,
        rejectingVerifier,
      ).target('v1.2.3'),
    /MANIFEST_ATTESTATION_INVALID/,
  );
  assert.equal(verifierCalls, 1);
});

test('draft and prerelease releases are rejected before manifest verification', async () => {
  for (const flags of [
    { draft: true, prerelease: false },
    { draft: false, prerelease: true },
  ]) {
    let verifierCalls = 0;
    const verifier: ManifestAttestationVerifier = {
      async verify() {
        verifierCalls += 1;
        return manifestVerifier.verify({
          payload: new Uint8Array(),
          releaseTag: 'v1.2.3',
          sourceCommit: manifest.sourceCommit,
        });
      },
    };
    await assert.rejects(
      () =>
        new GitHubReleaseProvider(
          (async () =>
            jsonResponse({
              tag_name: 'v1.2.3',
              assets: [],
              ...flags,
            })) as typeof fetch,
          verifier,
        ).target('v1.2.3'),
      /RELEASE_NOT_STABLE/,
    );
    assert.equal(verifierCalls, 0);
  }
});

test('release provider rejects duplicate assets and non-GitHub manifest URLs', async () => {
  const release = {
    tag_name: 'v1.2.3',
    draft: false,
    prerelease: false,
    assets: releaseAssets('https://evil.invalid/manifest.json'),
  };
  await assert.rejects(
    () =>
      releaseProvider((async () =>
        jsonResponse(release)) as typeof fetch).target('v1.2.3'),
    /RELEASE_MANIFEST_URL_INVALID/,
  );
  await assert.rejects(
    () =>
      releaseProvider((async () =>
        jsonResponse({
          ...release,
          assets: [...release.assets, release.assets[0]],
        })) as typeof fetch).target('v1.2.3'),
    /RELEASE_ASSET_INVENTORY_INVALID/,
  );
  await assert.rejects(
    () =>
      releaseProvider((async () =>
        jsonResponse({
          ...release,
          assets: release.assets.filter(
            (asset) =>
              asset.name !== 'pe-community-updater-v1.2.3-linux-arm64.tar.gz',
          ),
        })) as typeof fetch).target('v1.2.3'),
    /RELEASE_ASSET_INVENTORY_INVALID/,
  );
});

test('manifest redirects fail closed outside the allowlist', async () => {
  const request = async (url: string | URL | Request) => {
    if (String(url).includes('/releases/tags/')) {
      return jsonResponse({
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        assets: releaseAssets(),
      });
    }
    return new Response(null, {
      status: 302,
      headers: { location: 'https://evil.invalid/manifest.json' },
    });
  };
  await assert.rejects(
    () => releaseProvider(request as typeof fetch).target('v1.2.3'),
    /RELEASE_MANIFEST_REDIRECT_INVALID/,
  );
});

test('release discovery fails closed for transport, JSON, version, and schema failures', async () => {
  await assert.rejects(
    () =>
      releaseProvider((async () => {
        throw new Error('network unavailable');
      }) as typeof fetch).latest(),
    /network unavailable/,
  );
  await assert.rejects(
    () =>
      releaseProvider(
        (async () => new Response('{invalid', { status: 200 })) as typeof fetch,
      ).latest(),
    /JSON/,
  );
  await assert.rejects(
    () =>
      releaseProvider((async () =>
        jsonResponse({
          tag_name: 'latest',
          draft: false,
          prerelease: false,
          assets: [],
        })) as typeof fetch).latest(),
    /INVALID_VERSION/,
  );
  const request = async (url: string | URL | Request) => {
    if (String(url).includes('/git/ref/tags/'))
      return jsonResponse({ object: { type: 'tag', sha: 'e'.repeat(40) } });
    if (String(url).includes('/git/tags/'))
      return jsonResponse({
        object: { type: 'commit', sha: manifest.sourceCommit },
      });
    if (String(url).startsWith('https://api.github.com/')) {
      return jsonResponse({
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        assets: releaseAssets(),
      });
    }
    return jsonResponse({ ...manifest, schemaVersion: 999 });
  };
  await assert.rejects(
    () => releaseProvider(request as typeof fetch).latest(),
    /MANIFEST_SCHEMA_INVALID/,
  );
});

test('release provider requires an annotated tag bound to manifest source commit', async () => {
  const request = async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes('/releases/tags/'))
      return jsonResponse({
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        assets: releaseAssets(),
      });
    if (value.includes('/git/ref/tags/'))
      return jsonResponse({ object: { type: 'tag', sha: 'e'.repeat(40) } });
    if (value.includes('/git/tags/'))
      return jsonResponse({ object: { type: 'commit', sha: 'f'.repeat(40) } });
    return jsonResponse(manifest);
  };
  await assert.rejects(
    () => releaseProvider(request as typeof fetch).target('v1.2.3'),
    /MANIFEST_ATTESTATION_SOURCE_MISMATCH/,
  );

  const lightweight = async (url: string | URL | Request) => {
    const value = String(url);
    if (value.includes('/releases/tags/'))
      return jsonResponse({
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        assets: releaseAssets(),
      });
    if (value.includes('/git/ref/tags/'))
      return jsonResponse({
        object: { type: 'commit', sha: manifest.sourceCommit },
      });
    return jsonResponse(manifest);
  };
  await assert.rejects(
    () => releaseProvider(lightweight as typeof fetch).target('v1.2.3'),
    /RELEASE_TAG_NOT_ANNOTATED/,
  );
});

test('release and manifest response bodies are bounded', async () => {
  await assert.rejects(
    () =>
      releaseProvider(
        (async () =>
          new Response('x', {
            status: 200,
            headers: { 'content-length': String(1024 * 1024 + 1) },
          })) as typeof fetch,
      ).latest(),
    /RESPONSE_TOO_LARGE/,
  );

  const request = async (url: string | URL | Request) => {
    if (String(url).includes('/releases/tags/'))
      return jsonResponse({
        tag_name: 'v1.2.3',
        draft: false,
        prerelease: false,
        assets: releaseAssets(),
      });
    return new Response('x', {
      status: 200,
      headers: { 'content-length': String(128 * 1024 + 1) },
    });
  };
  await assert.rejects(
    () => releaseProvider(request as typeof fetch).target('v1.2.3'),
    /MANIFEST_TOO_LARGE/,
  );
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function releaseAssets(
  manifestUrl = 'https://github.com/Pona-Ekolo/PE-Community/releases/download/v1.2.3/pe-community-update-manifest.json',
) {
  return [
    {
      name: 'pe-community-update-manifest.json',
      browser_download_url: manifestUrl,
    },
    {
      name: 'pe-community-update-manifest.attestation.json',
      browser_download_url:
        'https://github.com/Pona-Ekolo/PE-Community/releases/download/v1.2.3/pe-community-update-manifest.attestation.json',
    },
    {
      name: 'pe-community-updater-v1.2.3-linux-amd64.tar.gz',
      browser_download_url:
        'https://github.com/Pona-Ekolo/PE-Community/releases/download/v1.2.3/pe-community-updater-v1.2.3-linux-amd64.tar.gz',
    },
    {
      name: 'pe-community-updater-v1.2.3-linux-arm64.tar.gz',
      browser_download_url:
        'https://github.com/Pona-Ekolo/PE-Community/releases/download/v1.2.3/pe-community-updater-v1.2.3-linux-arm64.tar.gz',
    },
  ];
}

const manifestVerifier: ManifestAttestationVerifier = {
  async verify(input) {
    return {
      service: 'manifest',
      digest: `sha256:${createHash('sha256').update(input.payload).digest('hex')}`,
      policy: 'GITHUB_PROVENANCE_REQUIRED',
      verifiedAt: new Date(0).toISOString(),
      verifierVersion: '2.93.0',
      repository: 'Pona-Ekolo/PE-Community',
      workflow: '.github/workflows/publish-images.yml',
      result: 'VERIFIED',
    };
  },
};

function releaseProvider(
  request: typeof fetch,
  verifier: ManifestAttestationVerifier = manifestVerifier,
) {
  return new GitHubReleaseProvider(request, verifier);
}
