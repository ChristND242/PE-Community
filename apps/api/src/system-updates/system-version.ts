import { BUILD_METADATA } from './build-metadata';

export type SystemVersion = {
  version: string;
  sourceCommit: string | null;
  buildDate: string | null;
  channel: 'stable' | 'development';
};

export function currentSystemVersion(metadata: SystemVersion = BUILD_METADATA): SystemVersion {
  if (metadata.channel === 'development') {
    return { version: 'v0.0.0-dev', sourceCommit: null, buildDate: null, channel: 'development' };
  }
  const version = strictReleaseVersion(metadata.version);
  const sourceCommit = /^[a-f0-9]{40}$/.test(metadata.sourceCommit ?? '') ? metadata.sourceCommit : null;
  const buildDate = safeDate(metadata.buildDate);
  if (!version || !sourceCommit || !buildDate) {
    return { version: 'v0.0.0-dev', sourceCommit: null, buildDate: null, channel: 'development' };
  }
  return { version, sourceCommit, buildDate, channel: 'stable' };
}

export function normalizeVersion(value: unknown) {
  if (typeof value !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(value)) return 'v0.0.0';
  return value.startsWith('v') ? value : `v${value}`;
}

export function compareSystemVersions(left: string, right: string) {
  const first = normalizeVersion(left).slice(1).split('.').map(Number);
  const second = normalizeVersion(right).slice(1).split('.').map(Number);
  for (let index = 0; index < 3; index += 1) if (first[index] !== second[index]) return first[index] < second[index] ? -1 : 1;
  return 0;
}

function strictReleaseVersion(value: unknown) {
  return typeof value === 'string' && /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value)
    ? value
    : null;
}

function safeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
