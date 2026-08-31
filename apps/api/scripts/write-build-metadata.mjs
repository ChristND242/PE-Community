import { writeFile } from 'node:fs/promises';

const version = process.env.APP_VERSION;
const sourceCommit = process.env.SOURCE_COMMIT;
const buildDate = process.env.BUILD_DATE;
const stableVersion = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const stableCommit = /^[a-f0-9]{40}$/;

let metadata;
if (version === 'v0.0.0-dev' && sourceCommit === 'development') {
  metadata = { version, sourceCommit: null, buildDate: null, channel: 'development' };
} else {
  if (!stableVersion.test(version ?? '')) throw new Error('APP_VERSION must be strict vMAJOR.MINOR.PATCH metadata.');
  if (!stableCommit.test(sourceCommit ?? '')) throw new Error('SOURCE_COMMIT must be the 40-character release commit.');
  const parsedBuildDate = new Date(buildDate ?? '');
  if (!Number.isFinite(parsedBuildDate.getTime())) throw new Error('BUILD_DATE must be valid release build metadata.');
  metadata = { version, sourceCommit, buildDate: parsedBuildDate.toISOString(), channel: 'stable' };
}

const source = `export const BUILD_METADATA = Object.freeze(${JSON.stringify(metadata, null, 2)} as const);\n`;
await writeFile(new URL('../src/system-updates/build-metadata.ts', import.meta.url), source, 'utf8');
