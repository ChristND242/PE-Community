import assert from 'node:assert/strict';
import test from 'node:test';
import { publishReleaseDraft } from './publish-release-draft.mjs';

const repository = 'Pona-Ekolo/PE-Community';
const tag = 'v1.2.1';
const sourceCommit = 'f2ad9c87a149b6506fbc9d290cb118ab94d236a4';
const artifacts = [
  {
    name: 'pe-community-update-manifest.json',
    size: 10,
    digest: `sha256:${'a'.repeat(64)}`,
  },
  {
    name: 'pe-community-update-manifest.attestation.json',
    size: 20,
    digest: `sha256:${'b'.repeat(64)}`,
  },
  {
    name: `pe-community-updater-${tag}.tar.gz`,
    size: 30,
    digest: `sha256:${'c'.repeat(64)}`,
  },
];
const input = { repository, tag, sourceCommit, artifacts };

function asset(artifact, id) {
  return {
    id,
    name: artifact.name,
    size: artifact.size,
    digest: artifact.digest,
    state: 'uploaded',
  };
}

function draft(overrides = {}) {
  return {
    id: 41,
    tag_name: tag,
    name: tag,
    draft: true,
    prerelease: false,
    target_commitish: sourceCommit,
    html_url:
      'https://github.com/Pona-Ekolo/PE-Community/releases/tag/untagged-test',
    assets: [],
    ...overrides,
  };
}

class FakeApi {
  constructor(releases = []) {
    this.releases = structuredClone(releases);
    this.calls = [];
    this.nextId = 100;
  }

  async listReleases() {
    this.calls.push('list');
    return structuredClone(this.releases);
  }

  async createDraft(createInput) {
    this.calls.push('create');
    const release = draft({
      id: this.nextId++,
      tag_name: createInput.tag,
      name: createInput.name,
      target_commitish: createInput.sourceCommit,
    });
    this.releases.push(release);
    return structuredClone(release);
  }

  async uploadAsset(id, artifact) {
    this.calls.push(`upload:${artifact.name}`);
    const release = this.releases.find((candidate) => candidate.id === id);
    const uploaded = asset(artifact, this.nextId++);
    release.assets.push(uploaded);
    return structuredClone(uploaded);
  }

  async getRelease(id) {
    this.calls.push(`get:${id}`);
    return structuredClone(
      this.releases.find((candidate) => candidate.id === id),
    );
  }

  async publishRelease(id) {
    this.calls.push(`publish:${id}`);
    const release = this.releases.find((candidate) => candidate.id === id);
    release.draft = false;
    release.html_url = `https://github.com/Pona-Ekolo/PE-Community/releases/tag/${tag}`;
    return structuredClone(release);
  }
}

async function expectFailure(api, expected, customInput = input) {
  await assert.rejects(
    () => publishReleaseDraft(api, customInput),
    new RegExp(expected),
  );
  assert.equal(
    api.calls.some((call) => call.startsWith('publish:')),
    false,
  );
}

test('creates, rediscovers, fills, validates, and publishes a new draft by release ID', async () => {
  const api = new FakeApi();
  const result = await publishReleaseDraft(api, input);
  assert.equal(result.draft, false);
  assert.equal(api.calls.filter((call) => call === 'create').length, 1);
  assert.equal(
    api.calls.filter((call) => call.startsWith('upload:')).length,
    3,
  );
  assert.ok(api.calls.includes('publish:100'));
});

test('resumes a listed draft when the public tag lookup would return 404', async () => {
  const api = new FakeApi([draft()]);
  await publishReleaseDraft(api, input);
  assert.equal(api.calls.includes('create'), false);
  assert.ok(api.calls.includes('publish:41'));
});

test('resumes an exactly matching empty draft', async () => {
  const api = new FakeApi([draft()]);
  await publishReleaseDraft(api, input);
  assert.equal(
    api.calls.filter((call) => call.startsWith('upload:')).length,
    3,
  );
});

test('keeps an exact existing asset and uploads only missing assets', async () => {
  const api = new FakeApi([draft({ assets: [asset(artifacts[0], 50)] })]);
  await publishReleaseDraft(api, input);
  assert.equal(api.calls.includes(`upload:${artifacts[0].name}`), false);
  assert.equal(
    api.calls.filter((call) => call.startsWith('upload:')).length,
    2,
  );
});

test('fails closed on an existing asset with the wrong digest or size', async () => {
  for (const changed of [
    { ...asset(artifacts[0], 50), digest: `sha256:${'d'.repeat(64)}` },
    { ...asset(artifacts[0], 50), size: 11 },
  ]) {
    const api = new FakeApi([draft({ assets: [changed] })]);
    await expectFailure(api, 'RELEASE_ASSET_(DIGEST|SIZE)_MISMATCH');
    assert.equal(
      api.calls.some((call) => call.startsWith('upload:')),
      false,
    );
  }
});

test('fails closed on an unexpected extra asset', async () => {
  const api = new FakeApi([
    draft({
      assets: [
        {
          id: 50,
          name: 'unexpected.txt',
          size: 1,
          digest: `sha256:${'d'.repeat(64)}`,
        },
      ],
    }),
  ]);
  await expectFailure(api, 'RELEASE_ASSET_UNEXPECTED');
});

test('aborts without mutation when a published release already exists', async () => {
  const api = new FakeApi([draft({ draft: false })]);
  await expectFailure(api, 'RELEASE_ALREADY_PUBLISHED');
  assert.deepEqual(api.calls, ['list']);
});

test('fails closed when multiple matching drafts are present', async () => {
  const api = new FakeApi([draft(), draft({ id: 42 })]);
  await expectFailure(api, 'RELEASE_DRAFT_AMBIGUOUS');
});

test('fails closed when a candidate has the wrong tag or target commit', async () => {
  await expectFailure(
    new FakeApi([draft({ tag_name: 'v1.2.0' })]),
    'RELEASE_TAG_MISMATCH',
  );
  await expectFailure(
    new FakeApi([draft({ target_commitish: '0'.repeat(40) })]),
    'RELEASE_TARGET_MISMATCH',
  );
});

test('rerun after partial upload does not duplicate the release or exact assets', async () => {
  const api = new FakeApi([
    draft({ assets: [asset(artifacts[0], 50), asset(artifacts[1], 51)] }),
  ]);
  await publishReleaseDraft(api, input);
  assert.equal(api.calls.includes('create'), false);
  assert.deepEqual(
    api.calls.filter((call) => call.startsWith('upload:')),
    [`upload:${artifacts[2].name}`],
  );
  assert.equal(new Set(api.releases[0].assets.map(({ name }) => name)).size, 3);
});
