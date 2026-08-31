import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCollisionArtifact,
  createIntegrationArtifacts,
  expectFailure,
  isOwnedTestTag,
  safeResult,
  testTagPrefix,
  validateIntegrationConfig,
} from './release-publisher.integration.mjs';

const token = 'integration-test-token-that-must-not-be-logged';
const runId = 'audit-run-20260901';
const sourceCommit = 'a'.repeat(40);
const repository = 'Pona-Ekolo/PE-Community-Release-Test';

function config(overrides = {}) {
  return { repository, runId, sourceCommit, token, ...overrides };
}

test('integration harness allowlists only the dedicated repository', () => {
  assert.equal(validateIntegrationConfig(config()).repository, repository);
  assert.throws(
    () => validateIntegrationConfig(config({ token: '' })),
    /INTEGRATION_TOKEN_REQUIRED/,
  );
  assert.throws(
    () =>
      validateIntegrationConfig(config({ repository: 'invalid repository' })),
    /INTEGRATION_REPOSITORY_INVALID/,
  );
  assert.throws(
    () =>
      validateIntegrationConfig(
        config({ repository: 'Pona-Ekolo/PE-Community' }),
      ),
    /INTEGRATION_PRODUCTION_REPOSITORY_FORBIDDEN/,
  );
  assert.throws(
    () =>
      validateIntegrationConfig(
        config({ repository: 'pona-ekolo/pe-community' }),
      ),
    /INTEGRATION_PRODUCTION_REPOSITORY_FORBIDDEN/,
  );
  assert.throws(
    () =>
      validateIntegrationConfig(
        config({
          repository: 'another-owner/another-repository',
        }),
      ),
    /INTEGRATION_REPOSITORY_NOT_ALLOWED/,
  );
  assert.throws(
    () =>
      validateIntegrationConfig(
        config({
          repository: 'another-owner/another-repository',
          cleanup: true,
          confirmRunId: runId,
        }),
      ),
    /INTEGRATION_REPOSITORY_NOT_ALLOWED/,
  );
});

test('negative scenarios fail when they receive an unexpected error', async () => {
  await assert.rejects(
    expectFailure(
      'collision',
      `${testTagPrefix(runId)}collision`,
      'RELEASE_ASSET_DIGEST_MISMATCH',
      async () => {
        throw new Error('RELEASE_ASSET_UNEXPECTED');
      },
    ),
    (error) => {
      assert.equal(
        error.message,
        'INTEGRATION_EXPECTED_ERROR_MISMATCH scenario=collision expected=RELEASE_ASSET_DIGEST_MISMATCH actual=RELEASE_ASSET_UNEXPECTED',
      );
      return true;
    },
  );
});

test('collision artifact preserves the expected size while changing its digest', () => {
  const expected = createIntegrationArtifacts(runId)[0];
  const collision = createCollisionArtifact(expected);
  assert.equal(collision.name, expected.name);
  assert.equal(collision.size, expected.size);
  assert.notEqual(collision.digest, expected.digest);
  assert.equal(collision.content.equals(expected.content), false);
});

test('integration tags are isolated from production semantic versions', () => {
  const validated = validateIntegrationConfig(config());
  const ownedTag = `${testTagPrefix(runId)}partial`;
  assert.equal(isOwnedTestTag(ownedTag, runId), true);
  assert.equal(isOwnedTestTag('v1.2.3', runId), false);
  assert.equal(validated.tagPattern.test(ownedTag), true);
  assert.equal(validated.tagPattern.test('v1.2.3'), false);
});

test('cleanup requires explicit confirmation and only recognizes the exact run namespace', () => {
  assert.throws(
    () =>
      validateIntegrationConfig(
        config({ cleanup: true, confirmRunId: 'another-run' }),
      ),
    /INTEGRATION_CLEANUP_CONFIRMATION_REQUIRED/,
  );
  assert.equal(isOwnedTestTag(`${testTagPrefix(runId)}clean`, runId), true);
  assert.equal(isOwnedTestTag('release-test-another-run-clean', runId), false);
  assert.equal(isOwnedTestTag(`${testTagPrefix(runId)}v1-2-3`, runId), true);
  assert.equal(isOwnedTestTag('v1.2.3', runId), false);
});

test('integration artifacts are deterministic and result output cannot contain the token', () => {
  const first = createIntegrationArtifacts(runId);
  const second = createIntegrationArtifacts(runId);
  assert.deepEqual(
    first.map(({ name, size, digest, content }) => ({
      name,
      size,
      digest,
      content: content.toString('utf8'),
    })),
    second.map(({ name, size, digest, content }) => ({
      name,
      size,
      digest,
      content: content.toString('utf8'),
    })),
  );
  const output = JSON.stringify(
    safeResult({ name: 'clean', status: 'PASS', token }),
  );
  assert.equal(output.includes(token), false);
});
