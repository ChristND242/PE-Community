import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundledVerifierPath } from './config.js';
import { sanitizeLog } from './domain.js';
import type { CommandExecutor } from './executor.js';

export const PROVENANCE_POLICY = Object.freeze({
  repository: 'Pona-Ekolo/PE-Community',
  organization: 'Pona-Ekolo',
  signerWorkflow:
    'Pona-Ekolo/PE-Community/.github/workflows/publish-images.yml',
  workflowPath: '.github/workflows/publish-images.yml',
  predicateType: 'https://slsa.dev/provenance/v1',
  verifierVersion: '2.93.0',
  timeoutMs: 60_000,
  maximumOutputBytes: 1024 * 1024,
} as const);

const VERIFIER_ENV: NodeJS.ProcessEnv = Object.freeze({
  HOME: process.env.PE_UPDATER_STATE_DIR ?? tmpdir(),
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  NO_COLOR: '1',
  PATH: '/usr/bin:/bin',
});

export type ProvenanceService = 'manifest' | 'api' | 'web' | 'worker';

export type ProvenanceVerificationResult = {
  service: ProvenanceService;
  digest: string;
  policy: 'GITHUB_PROVENANCE_REQUIRED';
  verifiedAt: string;
  verifierVersion: string;
  repository: typeof PROVENANCE_POLICY.repository;
  workflow: typeof PROVENANCE_POLICY.workflowPath;
  result: 'VERIFIED';
};

export interface ProvenanceVerifier {
  preflight(): Promise<string>;
  verify(input: {
    service: ProvenanceService;
    repository: string;
    digest: string;
    releaseTag: string;
    sourceCommit: string;
  }): Promise<ProvenanceVerificationResult>;
}

export interface ManifestAttestationVerifier {
  verify(input: {
    payload: Uint8Array;
    releaseTag: string;
    sourceCommit: string;
  }): Promise<ProvenanceVerificationResult>;
}

type VerifierFileInspector = {
  lstat(file: string): {
    isFile(): boolean;
    isSymbolicLink(): boolean;
    mode: number;
    uid: number;
  };
  realpath(file: string): string;
};

export class ProvenanceError extends Error {
  constructor(
    readonly code: string,
    message = 'Update blocked: release authenticity could not be verified.',
  ) {
    super(message);
  }
}

export class GitHubCliProvenanceVerifier implements ProvenanceVerifier {
  private verifierVersion: string | null = null;

  constructor(
    private readonly executor: CommandExecutor,
    private readonly inspectVerifier: () => void = assertBundledVerifier,
    private readonly verifierExecutable = bundledVerifierPath(),
  ) {}

  async preflight() {
    if (this.verifierVersion) return this.verifierVersion;
    this.inspectVerifier();
    let output: string;
    try {
      const result = await this.executor.run(
        this.verifierExecutable,
        ['version'],
        {
          timeoutMs: 10_000,
          maxOutputBytes: 64 * 1024,
          env: VERIFIER_ENV,
        },
      );
      output = result.stdout;
    } catch (error) {
      throw mapVerifierError(error);
    }
    const version = output.match(/^gh version (\d+)\.(\d+)\.(\d+)(?:\s|$)/m);
    if (!version) throw new ProvenanceError('PROVENANCE_OUTPUT_INVALID');
    const parsed = version.slice(1, 4).join('.');
    if (parsed !== PROVENANCE_POLICY.verifierVersion) {
      throw new ProvenanceError('PROVENANCE_VERIFIER_UNSUPPORTED');
    }
    this.verifierVersion = parsed;
    return this.verifierVersion;
  }

  async verify(input: {
    service: ProvenanceService;
    repository: string;
    digest: string;
    releaseTag: string;
    sourceCommit: string;
  }) {
    validateVerifierInput(input);
    const verifierVersion = await this.preflight();
    let output: string;
    try {
      const result = await this.executor.run(
        this.verifierExecutable,
        provenanceVerifierArgs(input),
        {
          timeoutMs: PROVENANCE_POLICY.timeoutMs,
          maxOutputBytes: PROVENANCE_POLICY.maximumOutputBytes,
          env: VERIFIER_ENV,
        },
      );
      output = result.stdout;
    } catch (error) {
      throw mapVerifierError(error);
    }
    validateVerifierOutput(output, input.repository, input.digest);
    return {
      service: input.service,
      digest: input.digest,
      policy: 'GITHUB_PROVENANCE_REQUIRED' as const,
      verifiedAt: new Date().toISOString(),
      verifierVersion,
      repository: PROVENANCE_POLICY.repository,
      workflow: PROVENANCE_POLICY.workflowPath,
      result: 'VERIFIED' as const,
    };
  }
}

export function provenanceVerifierArgs(input: {
  service: ProvenanceService;
  repository: string;
  digest: string;
  releaseTag: string;
  sourceCommit: string;
}) {
  validateVerifierInput(input);
  return [
    'attestation',
    'verify',
    `oci://${input.repository}@${input.digest}`,
    '--repo',
    PROVENANCE_POLICY.repository,
    '--hostname',
    'github.com',
    '--signer-workflow',
    PROVENANCE_POLICY.signerWorkflow,
    '--predicate-type',
    PROVENANCE_POLICY.predicateType,
    '--cert-oidc-issuer',
    'https://token.actions.githubusercontent.com',
    '--source-ref',
    `refs/tags/${input.releaseTag}`,
    '--source-digest',
    input.sourceCommit,
    '--deny-self-hosted-runners',
    '--limit',
    '10',
    '--format',
    'json',
  ];
}

export class GitHubCliManifestAttestationVerifier implements ManifestAttestationVerifier {
  private verifierVersion: string | null = null;

  constructor(
    private readonly executor: CommandExecutor,
    private readonly inspectVerifier: () => void = assertBundledVerifier,
    private readonly verifierExecutable = bundledVerifierPath(),
  ) {}

  async verify(input: {
    payload: Uint8Array;
    releaseTag: string;
    sourceCommit: string;
  }) {
    if (
      !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(
        input.releaseTag,
      )
    )
      throw new ProvenanceError('MANIFEST_ATTESTATION_SOURCE_MISMATCH');
    if (!/^[a-f0-9]{40}$/.test(input.sourceCommit))
      throw new ProvenanceError('MANIFEST_ATTESTATION_SOURCE_MISMATCH');

    this.inspectVerifier();
    this.verifierVersion ??= await preflightVerifier(
      this.executor,
      mapManifestVerifierError,
      this.verifierExecutable,
    );
    const directory = await mkdtemp(join(tmpdir(), 'pe-community-manifest-'));
    const manifestPath = join(directory, 'pe-community-update-manifest.json');
    const digest = createHash('sha256').update(input.payload).digest('hex');
    try {
      await writeFile(manifestPath, input.payload, { flag: 'wx', mode: 0o600 });
      const result = await this.executor.run(
        this.verifierExecutable,
        [
          'attestation',
          'verify',
          manifestPath,
          '--repo',
          PROVENANCE_POLICY.repository,
          '--hostname',
          'github.com',
          '--signer-workflow',
          PROVENANCE_POLICY.signerWorkflow,
          '--predicate-type',
          PROVENANCE_POLICY.predicateType,
          '--cert-oidc-issuer',
          'https://token.actions.githubusercontent.com',
          '--source-ref',
          `refs/tags/${input.releaseTag}`,
          '--source-digest',
          input.sourceCommit,
          '--deny-self-hosted-runners',
          '--limit',
          '10',
          '--format',
          'json',
        ],
        {
          timeoutMs: PROVENANCE_POLICY.timeoutMs,
          maxOutputBytes: PROVENANCE_POLICY.maximumOutputBytes,
          env: VERIFIER_ENV,
        },
      );
      validateManifestVerifierOutput(result.stdout, digest);
    } catch (error) {
      throw mapManifestVerifierError(error);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    return {
      service: 'manifest' as const,
      digest: `sha256:${digest}`,
      policy: 'GITHUB_PROVENANCE_REQUIRED' as const,
      verifiedAt: new Date().toISOString(),
      verifierVersion: this.verifierVersion,
      repository: PROVENANCE_POLICY.repository,
      workflow: PROVENANCE_POLICY.workflowPath,
      result: 'VERIFIED' as const,
    };
  }
}

async function preflightVerifier(
  executor: CommandExecutor,
  mapError: (error: unknown) => ProvenanceError,
  verifierExecutable: string,
) {
  let output: string;
  try {
    output = (
      await executor.run(verifierExecutable, ['version'], {
        timeoutMs: 10_000,
        maxOutputBytes: 64 * 1024,
        env: VERIFIER_ENV,
      })
    ).stdout;
  } catch (error) {
    throw mapError(error);
  }
  const version = output.match(/^gh version (\d+)\.(\d+)\.(\d+)(?:\s|$)/m);
  if (!version) throw new ProvenanceError('MANIFEST_ATTESTATION_INVALID');
  const parsed = version.slice(1, 4).join('.');
  if (parsed !== PROVENANCE_POLICY.verifierVersion)
    throw new ProvenanceError('PROVENANCE_VERIFIER_UNSUPPORTED');
  return parsed;
}

export function assertBundledVerifier(
  file = bundledVerifierPath(),
  inspect: VerifierFileInspector = { lstat: lstatSync, realpath: realpathSync },
) {
  let stat: ReturnType<VerifierFileInspector['lstat']>;
  try {
    stat = inspect.lstat(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new ProvenanceError(
      code === 'ENOENT'
        ? 'PROVENANCE_VERIFIER_MISSING'
        : 'PROVENANCE_VERIFIER_UNSAFE',
    );
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    inspect.realpath(file) !== file ||
    stat.uid !== 0 ||
    (stat.mode & 0o022) !== 0 ||
    (stat.mode & 0o111) === 0
  )
    throw new ProvenanceError('PROVENANCE_VERIFIER_UNSAFE');
}

function validateVerifierInput(input: {
  service: ProvenanceService;
  repository: string;
  digest: string;
  releaseTag: string;
  sourceCommit: string;
}) {
  if (
    !/^ghcr\.io\/pona-ekolo\/pe-community-(?:api|web|worker)$/.test(
      input.repository,
    )
  )
    throw new ProvenanceError('PROVENANCE_IDENTITY_MISMATCH');
  if (!/^sha256:[a-f0-9]{64}$/.test(input.digest))
    throw new ProvenanceError('PROVENANCE_DIGEST_MISMATCH');
  if (
    !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(input.releaseTag)
  )
    throw new ProvenanceError('PROVENANCE_RELEASE_TAG_MISMATCH');
  if (!/^[a-f0-9]{40}$/.test(input.sourceCommit))
    throw new ProvenanceError('PROVENANCE_SOURCE_COMMIT_MISMATCH');
}

function validateVerifierOutput(
  output: string,
  repository: string,
  digest: string,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new ProvenanceError('PROVENANCE_OUTPUT_INVALID');
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10)
    throw new ProvenanceError('PROVENANCE_OUTPUT_INVALID');
  const digestHex = digest.slice('sha256:'.length);
  const valid = parsed.some((entry) => {
    const result = record(record(entry)?.verificationResult);
    const statement = record(result?.statement);
    const signature = record(result?.signature);
    const timestamps = result?.verifiedTimestamps;
    const subjects = statement?.subject;
    return (
      statement?.predicateType === PROVENANCE_POLICY.predicateType &&
      Array.isArray(subjects) &&
      subjects.some((subject) => {
        const value = record(subject);
        const subjectDigest = record(value?.digest);
        return (
          value?.name === repository && subjectDigest?.sha256 === digestHex
        );
      }) &&
      Boolean(signature && Object.keys(signature).length) &&
      Array.isArray(timestamps) &&
      timestamps.length > 0
    );
  });
  if (!valid) throw new ProvenanceError('PROVENANCE_OUTPUT_INVALID');
}

function validateManifestVerifierOutput(output: string, digest: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new ProvenanceError('MANIFEST_ATTESTATION_INVALID');
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 10)
    throw new ProvenanceError('MANIFEST_ATTESTATION_INVALID');
  const valid = parsed.some((entry) => {
    const result = record(record(entry)?.verificationResult);
    const statement = record(result?.statement);
    const signature = record(result?.signature);
    const subjects = statement?.subject;
    return (
      statement?.predicateType === PROVENANCE_POLICY.predicateType &&
      Array.isArray(subjects) &&
      subjects.some((subject) => {
        const value = record(subject);
        return (
          value?.name === 'pe-community-update-manifest.json' &&
          record(value?.digest)?.sha256 === digest
        );
      }) &&
      Boolean(signature && Object.keys(signature).length) &&
      Array.isArray(result?.verifiedTimestamps) &&
      result.verifiedTimestamps.length > 0
    );
  });
  if (!valid) throw new ProvenanceError('MANIFEST_DIGEST_MISMATCH');
}

function mapVerifierError(error: unknown) {
  if (error instanceof ProvenanceError) return error;
  const system = error as NodeJS.ErrnoException & {
    killed?: boolean;
    signal?: string;
    stderr?: string;
  };
  if (system.code === 'ENOENT')
    return new ProvenanceError('PROVENANCE_VERIFIER_MISSING');
  if (
    system.killed ||
    system.signal === 'SIGTERM' ||
    system.code === 'ETIMEDOUT'
  )
    return new ProvenanceError('PROVENANCE_TIMEOUT');
  if (system.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
    return new ProvenanceError('PROVENANCE_OUTPUT_INVALID');
  const detail = sanitizeLog(system.stderr ?? system.message).toLowerCase();
  if (/no attestations? found|attestation not found/.test(detail))
    return new ProvenanceError('PROVENANCE_NOT_FOUND');
  if (
    /rate limit|network|connection|resolve|timed out|http status|fetch/.test(
      detail,
    )
  )
    return new ProvenanceError('PROVENANCE_FETCH_FAILED');
  if (/signer workflow|workflow identity/.test(detail))
    return new ProvenanceError('PROVENANCE_WORKFLOW_MISMATCH');
  if (/repository identity|owner identity/.test(detail))
    return new ProvenanceError('PROVENANCE_IDENTITY_MISMATCH');
  if (/subject digest|digest mismatch/.test(detail))
    return new ProvenanceError('PROVENANCE_DIGEST_MISMATCH');
  if (/signature|certificate|verification failed/.test(detail))
    return new ProvenanceError('PROVENANCE_SIGNATURE_INVALID');
  return new ProvenanceError('PROVENANCE_VERIFICATION_FAILED');
}

function mapManifestVerifierError(error: unknown) {
  if (error instanceof ProvenanceError) return error;
  const system = error as NodeJS.ErrnoException & {
    killed?: boolean;
    signal?: string;
    stderr?: string;
  };
  if (system.code === 'ENOENT')
    return new ProvenanceError('PROVENANCE_VERIFIER_MISSING');
  if (
    system.killed ||
    system.signal === 'SIGTERM' ||
    system.code === 'ETIMEDOUT'
  )
    return new ProvenanceError('MANIFEST_ATTESTATION_TIMEOUT');
  if (system.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
    return new ProvenanceError('MANIFEST_ATTESTATION_INVALID');
  const detail = sanitizeLog(system.stderr ?? system.message).toLowerCase();
  if (/no attestations? found|attestation not found/.test(detail))
    return new ProvenanceError('MANIFEST_ATTESTATION_MISSING');
  if (
    /rate limit|network|connection|resolve|timed out|http status|fetch/.test(
      detail,
    )
  )
    return new ProvenanceError('MANIFEST_ATTESTATION_FETCH_FAILED');
  if (/signer workflow|workflow identity/.test(detail))
    return new ProvenanceError('MANIFEST_ATTESTATION_WORKFLOW_MISMATCH');
  if (/repository identity|owner identity/.test(detail))
    return new ProvenanceError('MANIFEST_ATTESTATION_IDENTITY_MISMATCH');
  if (/source digest|source ref|source commit/.test(detail))
    return new ProvenanceError('MANIFEST_ATTESTATION_SOURCE_MISMATCH');
  if (/subject digest|digest mismatch/.test(detail))
    return new ProvenanceError('MANIFEST_DIGEST_MISMATCH');
  if (/signature|certificate|verification failed/.test(detail))
    return new ProvenanceError('MANIFEST_ATTESTATION_INVALID');
  return new ProvenanceError('MANIFEST_ATTESTATION_INVALID');
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
