import assert from 'node:assert/strict';
import test from 'node:test';
import type { SystemVersion } from '../system-updates/system-version';
import { ReleaseDiscoveryService } from '../system-updates/release-discovery.service';

const stableSystem: SystemVersion = {
  version: 'v1.1.0',
  sourceCommit: 'a'.repeat(40),
  buildDate: '2026-08-31T00:00:00.000Z',
  channel: 'stable',
};

test('an authoritative empty GitHub release catalog is successful and offers no update', async () => {
  const fixture = createFixture(stableSystem);
  await withFetch(
    [
      response({}, 404),
      response({ full_name: 'Pona-Ekolo/PE-Community', private: false }),
    ],
    async () => {
      const result = await fixture.service.check('community-1');
      assert.equal(result.status, 'NO_RELEASE_AVAILABLE');
      assert.equal(result.latestVersion, null);
      assert.equal(result.releaseMetadata, null);
      assert.equal(result.errorCategory, null);
      assert.ok(result.lastSuccessfulCheckedAt);
      assert.equal(fixture.audit.outcomes.at(-1), 'SUCCESS');
    },
  );
});

test('an ambiguous latest-release 404 remains a failed check', async () => {
  const fixture = createFixture(stableSystem);
  await withFetch([response({}, 404), response({}, 500)], async () => {
    const result = await fixture.service.check('community-1');
    assert.equal(result.status, 'CHECK_FAILED');
    assert.equal(result.errorCategory, 'GITHUB_REPOSITORY_HTTP_500');
  });
});

test('GitHub 500, timeout, and malformed release responses remain failed checks', async () => {
  for (const [reply, category] of [
    [response({}, 500), 'GITHUB_HTTP_500'],
    [new Error('timeout'), 'RELEASE_CHECK_UNAVAILABLE'],
    [new Response('{', { status: 200 }), 'RESPONSE_INVALID_JSON'],
  ] as const) {
    const fixture = createFixture(stableSystem);
    await withFetch([reply], async () => {
      const result = await fixture.service.check('community-1');
      assert.equal(result.status, 'CHECK_FAILED');
      assert.equal(result.errorCategory, category);
      assert.equal(result.latestVersion, null);
    });
  }
});

test('valid updater-aware releases compare against the immutable installed version', async () => {
  for (const [latestVersion, expectedStatus] of [
    ['v1.2.0', 'UPDATE_AVAILABLE'],
    ['v1.1.0', 'UP_TO_DATE'],
  ] as const) {
    const fixture = createFixture(stableSystem);
    await withFetch(validReleaseResponses(latestVersion), async () => {
      const result = await fixture.service.check('community-1');
      assert.equal(result.status, expectedStatus);
      assert.equal(result.latestVersion, latestVersion);
      assert.equal(
        (result.releaseMetadata as { sourceCommit?: string } | null)
          ?.sourceCommit,
        'b'.repeat(40),
      );
    });
  }
});

test('a v1.2.3 application recognizes the portable v1.2.6 release as an automatic update', async () => {
  const fixture = createFixture({
    ...stableSystem,
    version: 'v1.2.3',
  });
  await withFetch(validReleaseResponses('v1.2.6'), async () => {
    const result = await fixture.service.check('community-1');
    assert.equal(result.installedVersion, 'v1.2.3');
    assert.equal(result.latestVersion, 'v1.2.6');
    assert.equal(result.status, 'UPDATE_AVAILABLE');
    assert.equal(result.errorCategory, null);
    assert.equal(
      (
        result.releaseMetadata as {
          database?: { migrationCompatibility?: string };
          requiresManualAction?: boolean;
          supplyChain?: { attestationPolicy?: string };
        } | null
      )?.database?.migrationCompatibility,
      'FORWARD_ONLY',
    );
    assert.equal(
      (result.releaseMetadata as { requiresManualAction?: boolean } | null)
        ?.requiresManualAction,
      false,
    );
    assert.equal(
      (
        result.releaseMetadata as {
          supplyChain?: { attestationPolicy?: string };
        } | null
      )?.supplyChain?.attestationPolicy,
      'GITHUB_PROVENANCE_REQUIRED',
    );
  });
});

test('a release missing an architecture-specific updater asset remains manual-only', async () => {
  for (const retainedAssets of [
    ['pe-community-updater-v1.2.0-linux-amd64.tar.gz'],
    ['pe-community-updater-v1.2.0-linux-arm64.tar.gz'],
    ['pe-community-updater-v1.2.0.tar.gz'],
  ]) {
    const fixture = createFixture(stableSystem);
    const replies = validReleaseResponses('v1.2.0');
    const release = (await replies[0].json()) as {
      assets: Array<{ name: string }>;
    };
    release.assets = release.assets.filter(
      (asset) => !asset.name.startsWith('pe-community-updater-'),
    );
    release.assets.push(...retainedAssets.map((name) => ({ name })));
    await withFetch([response(release)], async () => {
      const result = await fixture.service.check('community-1');
      assert.equal(result.status, 'MANUAL_REQUIRED');
      assert.deepEqual(result.releaseMetadata, {
        compatibilityMode: 'RELEASE_WITHOUT_UPDATER_ARTIFACT',
        version: 'v1.2.0',
      });
    });
  }
});

test('development builds are explicit and never query or offer remote updates', async () => {
  const fixture = createFixture({
    version: 'v0.0.0-dev',
    sourceCommit: null,
    buildDate: null,
    channel: 'development',
  });
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error('unexpected fetch');
  };
  try {
    const result = await fixture.service.check('community-1');
    assert.equal(result.status, 'DEVELOPMENT');
    assert.equal(result.installedVersion, 'v0.0.0-dev');
    assert.equal(result.latestVersion, null);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('validation builds are non-installable and never query remote releases', async () => {
  const fixture = createFixture({
    version: 'v0.0.0-validation.33673603612',
    sourceCommit: 'a'.repeat(40),
    buildDate: '2026-09-02T19:29:32.000Z',
    channel: 'validation',
  });
  let fetchCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error('unexpected fetch');
  };
  try {
    const result = await fixture.service.check('community-1');
    assert.equal(result.status, 'DEVELOPMENT');
    assert.equal(result.installedVersion, 'v0.0.0-validation.33673603612');
    assert.equal(result.latestVersion, null);
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createFixture(systemVersion: SystemVersion) {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  return {
    prisma,
    audit,
    service: new TestReleaseDiscoveryService(
      prisma as never,
      audit as never,
      systemVersion,
    ),
  };
}

class TestReleaseDiscoveryService extends ReleaseDiscoveryService {
  constructor(
    prisma: never,
    audit: never,
    private readonly systemVersion: SystemVersion,
  ) {
    super(prisma, audit);
  }

  protected override installedSystemVersion() {
    return this.systemVersion;
  }
}

class FakeAudit {
  outcomes: string[] = [];
  async recordBestEffort(input: { outcome: string }) {
    this.outcomes.push(input.outcome);
  }
}

class FakePrisma {
  checks: Array<Record<string, unknown>> = [];
  systemUpdateCheck;

  constructor() {
    this.systemUpdateCheck = {
      findFirst: async (input: { where?: { status?: { not?: string } } }) => {
        const checks = input.where?.status?.not
          ? this.checks.filter(
              (check) => check.status !== input.where?.status?.not,
            )
          : this.checks;
        return checks.at(-1) ?? null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = {
          id: `check-${this.checks.length + 1}`,
          installedVersion: '',
          latestVersion: null,
          status: '',
          checkedAt: new Date(),
          lastSuccessfulCheckedAt: null,
          releaseUrl: null,
          releasePublishedAt: null,
          releaseNotes: null,
          errorCategory: null,
          releaseMetadataSnapshot: null,
          ...data,
        };
        this.checks.push(created);
        return created;
      },
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    };
  }
}

async function withFetch(
  replies: Array<Response | Error>,
  operation: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected fetch call.');
    if (reply instanceof Error) throw reply;
    return reply;
  };
  try {
    await operation();
    assert.equal(replies.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function validReleaseResponses(version: string) {
  const manifestUrl = `https://github.com/Pona-Ekolo/PE-Community/releases/download/${version}/pe-community-update-manifest.json`;
  return [
    response({
      tag_name: version,
      draft: false,
      prerelease: false,
      html_url: `https://github.com/Pona-Ekolo/PE-Community/releases/tag/${version}`,
      published_at: '2026-08-31T00:00:00Z',
      body: 'Release notes',
      assets: [
        { name: 'pe-community-update-manifest.attestation.json' },
        { name: `pe-community-updater-${version}-linux-amd64.tar.gz` },
        { name: `pe-community-updater-${version}-linux-arm64.tar.gz` },
        {
          name: 'pe-community-update-manifest.json',
          browser_download_url: manifestUrl,
        },
      ],
    }),
    response({
      schemaVersion: 2,
      releaseContractVersion: 1,
      version,
      releaseTag: version,
      channel: 'stable',
      minimumVersion: 'v0.1.0',
      minimumUpdaterVersion: 'v1.3.0',
      images: {
        api: {
          repository: 'ghcr.io/pona-ekolo/pe-community-api',
          digest: `sha256:${'1'.repeat(64)}`,
        },
        web: {
          repository: 'ghcr.io/pona-ekolo/pe-community-web',
          digest: `sha256:${'2'.repeat(64)}`,
        },
        worker: {
          repository: 'ghcr.io/pona-ekolo/pe-community-worker',
          digest: `sha256:${'3'.repeat(64)}`,
        },
      },
      database: { migrationCompatibility: 'FORWARD_ONLY' },
      supplyChain: { attestationPolicy: 'GITHUB_PROVENANCE_REQUIRED' },
      requiresManualAction: false,
      sourceCommit: 'b'.repeat(40),
      buildDate: '2026-08-31T00:00:00Z',
    }),
  ];
}
