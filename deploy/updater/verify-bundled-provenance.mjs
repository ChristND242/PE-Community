import { execFileSync } from 'node:child_process';
import { provenanceVerifierArgs } from '../../apps/updater/dist/provenance.js';

const options = parseArguments(process.argv.slice(2));

try {
  execFileSync(
    options.gh,
    provenanceVerifierArgs({
      service: options.service,
      repository: options.repository,
      digest: options.digest,
      releaseTag: options.releaseTag,
      sourceCommit: options.sourceCommit,
    }),
    {
      env: process.env,
      stdio: 'inherit',
    },
  );
} catch {
  process.exitCode = 1;
}

function parseArguments(argumentsList) {
  const names = new Set([
    '--gh',
    '--service',
    '--repository',
    '--digest',
    '--release-tag',
    '--source-commit',
  ]);
  const values = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const name = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!names.has(name) || !value || name in values)
      throw new Error('Invalid bundled provenance verifier arguments.');
    values[name] = value;
  }
  if (Object.keys(values).length !== names.size)
    throw new Error('Missing bundled provenance verifier arguments.');
  if (!['api', 'web', 'worker'].includes(values['--service']))
    throw new Error('Invalid bundled provenance service.');
  return {
    gh: values['--gh'],
    service: values['--service'],
    repository: values['--repository'],
    digest: values['--digest'],
    releaseTag: values['--release-tag'],
    sourceCommit: values['--source-commit'],
  };
}
