import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import test from 'node:test';
import type { CommandExecutor, CommandOptions, CommandResult } from './executor.js';
import {
  GitHubCliProvenanceVerifier,
  GitHubCliManifestAttestationVerifier,
  PROVENANCE_POLICY,
  ProvenanceError,
} from './provenance.js';

const digest = `sha256:${'a'.repeat(64)}`;
const sourceCommit = 'd'.repeat(40);
const input = {
  service: 'api' as const,
  repository: 'ghcr.io/pona-ekolo/pe-community-api',
  digest,
  releaseTag: 'v1.2.3',
  sourceCommit,
};

test('official verifier uses a fixed executable, exact digest, and immutable policy argv', async () => {
  const executor = new VerifierExecutor();
  const result = await new GitHubCliProvenanceVerifier(executor).verify(input);
  assert.equal(result.result, 'VERIFIED');
  assert.equal(result.digest, digest);
  assert.deepEqual(executor.calls[0], {
    executable: '/usr/bin/gh',
    args: ['version'],
    timeoutMs: 10_000,
    maxOutputBytes: 64 * 1024,
    env: { HOME: '/var/lib/pe-community-updater', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NO_COLOR: '1', PATH: '/usr/bin:/bin' },
  });
  assert.deepEqual(executor.calls[1]?.args, [
    'attestation', 'verify', `oci://${input.repository}@${digest}`,
    '--repo', 'Pona-Ekolo/PE-Community',
    '--hostname', 'github.com',
    '--signer-workflow', 'Pona-Ekolo/PE-Community/.github/workflows/publish-images.yml',
    '--predicate-type', 'https://slsa.dev/provenance/v1',
    '--cert-oidc-issuer', 'https://token.actions.githubusercontent.com',
    '--source-ref', 'refs/tags/v1.2.3',
    '--source-digest', sourceCommit,
    '--deny-self-hosted-runners', '--limit', '10', '--format', 'json',
  ]);
  assert.equal(executor.calls[1]?.timeoutMs, PROVENANCE_POLICY.timeoutMs);
  assert.equal(executor.calls[1]?.maxOutputBytes, PROVENANCE_POLICY.maximumOutputBytes);
  assert.deepEqual(Object.keys(executor.calls[1]?.env ?? {}).sort(), ['HOME', 'LANG', 'LC_ALL', 'NO_COLOR', 'PATH']);
  assert.equal(executor.calls[1]?.env?.GH_TOKEN, undefined);
});

test('verifier fails deterministically when missing, unsupported, timed out, or output-bounded', async () => {
  await expectCode(new GitHubCliProvenanceVerifier(new VerifierExecutor(systemError('ENOENT'))).preflight(), 'PROVENANCE_VERIFIER_MISSING');
  await expectCode(new GitHubCliProvenanceVerifier(new VerifierExecutor(undefined, 'gh version 2.92.1\n')).preflight(), 'PROVENANCE_VERIFIER_UNSUPPORTED');
  await expectCode(new GitHubCliProvenanceVerifier(new VerifierExecutor({ killed: true, message: 'timed out' })).preflight(), 'PROVENANCE_TIMEOUT');
  await expectCode(new GitHubCliProvenanceVerifier(new VerifierExecutor(systemError('ERR_CHILD_PROCESS_STDIO_MAXBUFFER'))).preflight(), 'PROVENANCE_OUTPUT_INVALID');
});

test('verifier rejects missing attestations, network failures, invalid signatures, and non-zero failures', async () => {
  for (const [stderr, code] of [
    ['no attestations found', 'PROVENANCE_NOT_FOUND'],
    ['network connection failed', 'PROVENANCE_FETCH_FAILED'],
    ['signature verification failed', 'PROVENANCE_SIGNATURE_INVALID'],
    ['unexpected gh failure', 'PROVENANCE_VERIFICATION_FAILED'],
  ] as const) {
    const executor = new VerifierExecutor();
    executor.verifyError = { message: 'command failed', stderr };
    await expectCode(new GitHubCliProvenanceVerifier(executor).verify(input), code);
  }
});

test('verifier output must cryptographically report the exact subject digest and trusted predicate', async () => {
  for (const output of [
    '{invalid',
    '[]',
    JSON.stringify(verificationOutput(`sha256:${'b'.repeat(64)}`)),
    JSON.stringify(verificationOutput(digest, 'https://example.invalid/predicate')),
    JSON.stringify([{ verificationResult: { statement: verificationOutput(digest)[0].verificationResult.statement } }]),
  ]) {
    const executor = new VerifierExecutor(undefined, undefined, output);
    await expectCode(new GitHubCliProvenanceVerifier(executor).verify(input), 'PROVENANCE_OUTPUT_INVALID');
  }
});

test('manifest values cannot inject argv or redefine repository, workflow, or executable trust', async () => {
  const verifier = new GitHubCliProvenanceVerifier(new VerifierExecutor());
  await expectCode(verifier.verify({ ...input, releaseTag: 'v1.2.3;id' }), 'PROVENANCE_RELEASE_TAG_MISMATCH');
  await expectCode(verifier.verify({ ...input, digest: `${digest};id` }), 'PROVENANCE_DIGEST_MISMATCH');
  await expectCode(verifier.verify({ ...input, repository: 'ghcr.io/attacker/image' }), 'PROVENANCE_IDENTITY_MISMATCH');
  await expectCode(verifier.verify({ ...input, sourceCommit: `${sourceCommit};id` }), 'PROVENANCE_SOURCE_COMMIT_MISMATCH');
});

test('manifest verifier authenticates exact bytes before parsing with immutable policy argv', async () => {
  const payload = new TextEncoder().encode('{"releaseContractVersion":1}');
  const executor = new VerifierExecutor(undefined, undefined, JSON.stringify(manifestVerificationOutput(payload)));
  const result = await new GitHubCliManifestAttestationVerifier(executor).verify({
    payload,
    releaseTag: 'v1.2.3',
    sourceCommit,
  });
  assert.equal(result.service, 'manifest');
  assert.equal(result.digest, `sha256:${createHash('sha256').update(payload).digest('hex')}`);
  const args = executor.calls[1]?.args ?? [];
  assert.deepEqual(args.slice(0, 2), ['attestation', 'verify']);
  assert.match(String(args[2]), /\/pe-community-manifest-[^/]+\/pe-community-update-manifest\.json$/);
  assert.deepEqual(args.slice(3), [
    '--repo', 'Pona-Ekolo/PE-Community',
    '--hostname', 'github.com',
    '--signer-workflow', 'Pona-Ekolo/PE-Community/.github/workflows/publish-images.yml',
    '--predicate-type', 'https://slsa.dev/provenance/v1',
    '--cert-oidc-issuer', 'https://token.actions.githubusercontent.com',
    '--source-ref', 'refs/tags/v1.2.3',
    '--source-digest', sourceCommit,
    '--deny-self-hosted-runners', '--limit', '10', '--format', 'json',
  ]);
  await assert.rejects(() => stat(String(args[2])), /ENOENT/);
});

test('manifest verifier rejects missing, invalid, wrong-identity, wrong-workflow, source, timeout, and fetch failures', async () => {
  for (const [stderr, code] of [
    ['no attestations found', 'MANIFEST_ATTESTATION_MISSING'],
    ['signature verification failed', 'MANIFEST_ATTESTATION_INVALID'],
    ['repository identity mismatch', 'MANIFEST_ATTESTATION_IDENTITY_MISMATCH'],
    ['signer workflow mismatch', 'MANIFEST_ATTESTATION_WORKFLOW_MISMATCH'],
    ['source digest mismatch', 'MANIFEST_ATTESTATION_SOURCE_MISMATCH'],
    ['network connection failed', 'MANIFEST_ATTESTATION_FETCH_FAILED'],
  ] as const) {
    const executor = new VerifierExecutor();
    executor.verifyError = { message: 'command failed', stderr };
    await expectCode(new GitHubCliManifestAttestationVerifier(executor).verify({
      payload: new TextEncoder().encode('{}'), releaseTag: 'v1.2.3', sourceCommit,
    }), code);
  }
  const timeout = new VerifierExecutor();
  timeout.verifyError = { killed: true, message: 'timed out' };
  await expectCode(new GitHubCliManifestAttestationVerifier(timeout).verify({
    payload: new TextEncoder().encode('{}'), releaseTag: 'v1.2.3', sourceCommit,
  }), 'MANIFEST_ATTESTATION_TIMEOUT');
  await expectCode(new GitHubCliManifestAttestationVerifier(new VerifierExecutor(systemError('ENOENT'))).verify({
    payload: new TextEncoder().encode('{}'), releaseTag: 'v1.2.3', sourceCommit,
  }), 'PROVENANCE_VERIFIER_MISSING');
});

test('manifest tampering and malformed verifier output fail with no digest trust', async () => {
  const signed = new TextEncoder().encode('{"version":"v1.2.3"}');
  const tampered = new TextEncoder().encode('{"version":"v9.9.9"}');
  const executor = new VerifierExecutor(undefined, undefined, JSON.stringify(manifestVerificationOutput(signed)));
  await expectCode(new GitHubCliManifestAttestationVerifier(executor).verify({
    payload: tampered, releaseTag: 'v1.2.3', sourceCommit,
  }), 'MANIFEST_DIGEST_MISMATCH');
  await expectCode(new GitHubCliManifestAttestationVerifier(new VerifierExecutor(undefined, undefined, '{bad')).verify({
    payload: signed, releaseTag: 'v1.2.3', sourceCommit,
  }), 'MANIFEST_ATTESTATION_INVALID');
});

class VerifierExecutor implements CommandExecutor {
  calls: Array<{ executable: string; args: readonly string[]; timeoutMs?: number; maxOutputBytes?: number; env?: NodeJS.ProcessEnv }> = [];
  verifyError: unknown;

  constructor(
    private readonly versionError?: unknown,
    private readonly versionOutput = 'gh version 2.98.0 (2026-08-27)\n',
    private readonly verifyOutput = JSON.stringify(verificationOutput(digest)),
  ) {}

  async run(executable: string, args: readonly string[], options: CommandOptions = {}): Promise<CommandResult> {
    this.calls.push({ executable, args, timeoutMs: options.timeoutMs, maxOutputBytes: options.maxOutputBytes, env: options.env });
    if (args[0] === 'version') {
      if (this.versionError) throw this.versionError;
      return { stdout: this.versionOutput, stderr: '' };
    }
    if (this.verifyError) throw this.verifyError;
    return { stdout: this.verifyOutput, stderr: '' };
  }

  async capture() { return { stderr: '' }; }
}

function verificationOutput(subjectDigest: string, predicateType: string = PROVENANCE_POLICY.predicateType) {
  return [{
    verificationResult: {
      statement: {
        predicateType,
        subject: [{ name: input.repository, digest: { sha256: subjectDigest.slice('sha256:'.length) } }],
      },
      signature: { certificate: { sourceRepository: PROVENANCE_POLICY.repository } },
      verifiedTimestamps: [{ type: 'TLOG', timestamp: '2026-08-31T00:00:00Z' }],
    },
  }];
}

function manifestVerificationOutput(payload: Uint8Array) {
  return [{
    verificationResult: {
      statement: {
        predicateType: PROVENANCE_POLICY.predicateType,
        subject: [{
          name: 'pe-community-update-manifest.json',
          digest: { sha256: createHash('sha256').update(payload).digest('hex') },
        }],
      },
      signature: { certificate: { sourceRepository: PROVENANCE_POLICY.repository } },
      verifiedTimestamps: [{ type: 'TLOG', timestamp: '2026-08-31T00:00:00Z' }],
    },
  }];
}

function systemError(code: string) {
  return Object.assign(new Error(code), { code });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof ProvenanceError && error.code === code);
}
