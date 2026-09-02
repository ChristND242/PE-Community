import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, SystemUpdateCheckStatus } from '@prisma/client';
import {
  AuditLogService,
  type AuditRequestContext,
} from '../audit/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.service';
import {
  compareSystemVersions,
  currentSystemVersion,
  normalizeVersion,
} from './system-version';

const RELEASE_URL =
  'https://api.github.com/repos/Pona-Ekolo/PE-Community/releases/latest';
const REPOSITORY_URL = 'https://api.github.com/repos/Pona-Ekolo/PE-Community';
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_RELEASE_BYTES = 1024 * 1024;
const MAX_MANIFEST_BYTES = 128 * 1024;
const MANIFEST_PREFIX =
  'https://github.com/Pona-Ekolo/PE-Community/releases/download/';
const MANIFEST_REDIRECT_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
const ALLOWED_REPOSITORIES = {
  api: 'ghcr.io/pona-ekolo/pe-community-api',
  web: 'ghcr.io/pona-ekolo/pe-community-web',
  worker: 'ghcr.io/pona-ekolo/pe-community-worker',
} as const;
const RELEASE_CONTRACT_VERSION = 1;
const MANIFEST_ATTESTATION_BUNDLE =
  'pe-community-update-manifest.attestation.json';
const UPDATER_ARCHITECTURES = ['linux-amd64', 'linux-arm64'] as const;

@Injectable()
export class ReleaseDiscoveryService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.refreshAllCommunities(), CACHE_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async latestFor(
    communityId: string,
    user?: RequestUser,
    force = false,
    context?: AuditRequestContext,
  ) {
    const cached = await this.prisma.systemUpdateCheck.findFirst({
      where: { communityId },
      orderBy: { checkedAt: 'desc' },
    });
    if (!force && cached && cached.checkedAt.getTime() > Date.now() - CACHE_MS)
      return publicCheck(cached);
    return this.check(communityId, user, context);
  }

  async check(
    communityId: string,
    user?: RequestUser,
    context?: AuditRequestContext,
  ) {
    const systemVersion = this.installedSystemVersion();
    const installed = systemVersion.version;
    const previousSuccess = await this.prisma.systemUpdateCheck.findFirst({
      where: { communityId, status: { not: 'CHECK_FAILED' } },
      orderBy: { checkedAt: 'desc' },
      select: { checkedAt: true },
    });
    if (systemVersion.channel === 'development') {
      return this.recordNoRelease(
        communityId,
        installed,
        SystemUpdateCheckStatus.DEVELOPMENT,
        user,
        context,
      );
    }
    try {
      const response = await fetch(RELEASE_URL, {
        redirect: 'error',
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
          'user-agent': 'pe-community-api',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 404) {
        await response.body?.cancel();
        if (await publicRepositoryExists()) {
          return this.recordNoRelease(
            communityId,
            installed,
            SystemUpdateCheckStatus.NO_RELEASE_AVAILABLE,
            user,
            context,
          );
        }
      }
      if (!response.ok)
        throw new ReleaseError(`GITHUB_HTTP_${response.status}`);
      const releaseValue = await boundedJson(response, MAX_RELEASE_BYTES);
      if (!objectValue(releaseValue)) throw new ReleaseError('RELEASE_INVALID');
      const release = releaseValue;
      if (release.draft === true || release.prerelease === true)
        throw new ReleaseError('LATEST_RELEASE_NOT_STABLE');
      const latest = strictVersion(release.tag_name);
      if (compareSystemVersions(latest, installed) < 0)
        throw new ReleaseError('RELEASE_DOWNGRADE_REJECTED');
      const manifest = await this.manifest(release, latest);
      const status = manifest.manualRequired
        ? SystemUpdateCheckStatus.MANUAL_REQUIRED
        : compareSystemVersions(installed, latest) < 0
          ? SystemUpdateCheckStatus.UPDATE_AVAILABLE
          : SystemUpdateCheckStatus.UP_TO_DATE;
      const checkedAt = new Date();
      const created = await this.prisma.systemUpdateCheck.create({
        data: {
          communityId,
          initiatedByUserId: user?.id,
          installedVersion: installed,
          latestVersion: latest,
          status,
          checkedAt,
          lastSuccessfulCheckedAt: checkedAt,
          releaseUrl: safeUrl(release.html_url),
          releasePublishedAt: safeDate(release.published_at),
          releaseNotes:
            typeof release.body === 'string'
              ? release.body.slice(0, 20_000)
              : null,
          releaseMetadataSnapshot: manifest.value as Prisma.InputJsonValue,
        },
      });
      await this.pruneChecks(communityId);
      await this.recordAudit(
        communityId,
        user,
        context,
        'SUCCESS',
        created.id,
        { installedVersion: installed, latestVersion: latest, status },
      );
      return publicCheck(created);
    } catch (error) {
      const errorCategory =
        error instanceof ReleaseError
          ? error.code
          : 'RELEASE_CHECK_UNAVAILABLE';
      const created = await this.prisma.systemUpdateCheck.create({
        data: {
          communityId,
          initiatedByUserId: user?.id,
          installedVersion: installed,
          status: SystemUpdateCheckStatus.CHECK_FAILED,
          lastSuccessfulCheckedAt: previousSuccess?.checkedAt,
          errorCategory,
        },
      });
      await this.pruneChecks(communityId);
      await this.recordAudit(
        communityId,
        user,
        context,
        'FAILURE',
        created.id,
        { installedVersion: installed, errorCategory },
      );
      return publicCheck(created);
    }
  }

  protected installedSystemVersion() {
    return currentSystemVersion();
  }

  private async recordNoRelease(
    communityId: string,
    installedVersion: string,
    status: SystemUpdateCheckStatus,
    user?: RequestUser,
    context?: AuditRequestContext,
  ) {
    const checkedAt = new Date();
    const created = await this.prisma.systemUpdateCheck.create({
      data: {
        communityId,
        initiatedByUserId: user?.id,
        installedVersion,
        latestVersion: null,
        status,
        checkedAt,
        lastSuccessfulCheckedAt: checkedAt,
        releaseUrl: null,
        releasePublishedAt: null,
        releaseNotes: null,
        errorCategory: null,
      },
    });
    await this.pruneChecks(communityId);
    await this.recordAudit(communityId, user, context, 'SUCCESS', created.id, {
      installedVersion,
      latestVersion: null,
      status,
    });
    return publicCheck(created);
  }

  private async manifest(release: Record<string, unknown>, version: string) {
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const attestationBundles = assets.filter(
      (item): item is Record<string, unknown> =>
        objectValue(item) && item.name === MANIFEST_ATTESTATION_BUNDLE,
    );
    if (attestationBundles.length !== 1)
      return {
        manualRequired: true,
        value: {
          compatibilityMode: 'RELEASE_WITHOUT_MANIFEST_ATTESTATION',
          version,
        },
      };
    const hasUpdaterAssets = UPDATER_ARCHITECTURES.every(
      (architecture) =>
        assets.filter(
          (item): item is Record<string, unknown> =>
            objectValue(item) &&
            item.name ===
              `pe-community-updater-${version}-${architecture}.tar.gz`,
        ).length === 1,
    );
    if (!hasUpdaterAssets)
      return {
        manualRequired: true,
        value: {
          compatibilityMode: 'RELEASE_WITHOUT_UPDATER_ARTIFACT',
          version,
        },
      };
    const matches = assets.filter(
      (item): item is Record<string, unknown> =>
        objectValue(item) && item.name === 'pe-community-update-manifest.json',
    );
    if (matches.length > 1) throw new ReleaseError('MANIFEST_DUPLICATE');
    const asset = matches[0];
    if (!asset || typeof asset.browser_download_url !== 'string')
      return {
        manualRequired: true,
        value: {
          compatibilityMode: 'LEGACY_RELEASE_WITHOUT_MANIFEST',
          version,
        },
      };
    if (!asset.browser_download_url.startsWith(MANIFEST_PREFIX))
      throw new ReleaseError('MANIFEST_URL_INVALID');
    const response = await fetchManifest(asset.browser_download_url);
    if (!response.ok) throw new ReleaseError('MANIFEST_UNAVAILABLE');
    const manifestValue = await boundedJson(response, MAX_MANIFEST_BYTES);
    if (!objectValue(manifestValue)) throw new ReleaseError('MANIFEST_INVALID');
    const manifest = manifestValue;
    exactKeys(manifest, [
      'schemaVersion',
      'releaseContractVersion',
      'version',
      'releaseTag',
      'channel',
      'minimumVersion',
      'minimumUpdaterVersion',
      'images',
      'database',
      'supplyChain',
      'requiresManualAction',
      'sourceCommit',
      'buildDate',
    ]);
    if (manifest.releaseContractVersion !== RELEASE_CONTRACT_VERSION)
      throw new ReleaseError('RELEASE_CONTRACT_UNSUPPORTED');
    if (
      manifest.schemaVersion !== 2 ||
      strictVersion(manifest.version) !== version ||
      strictVersion(manifest.releaseTag) !== version ||
      manifest.channel !== 'stable' ||
      typeof manifest.requiresManualAction !== 'boolean'
    )
      throw new ReleaseError('MANIFEST_INVALID');
    strictVersion(manifest.minimumVersion);
    strictVersion(manifest.minimumUpdaterVersion);
    if (
      !objectValue(manifest.images) ||
      !Object.entries(ALLOWED_REPOSITORIES).every(([service, repository]) => {
        const image = (manifest.images as Record<string, unknown>)[service];
        return (
          objectValue(image) &&
          exactKeysValid(image, ['repository', 'digest']) &&
          image.repository === repository &&
          typeof image.digest === 'string' &&
          /^sha256:[a-f0-9]{64}$/.test(image.digest)
        );
      })
    )
      throw new ReleaseError('MANIFEST_IMAGE_INVALID');
    if (!exactKeysValid(manifest.images, ['api', 'web', 'worker']))
      throw new ReleaseError('MANIFEST_IMAGE_INVALID');
    if (
      !objectValue(manifest.database) ||
      !exactKeysValid(manifest.database, ['migrationCompatibility']) ||
      ![
        'NO_MIGRATION',
        'BACKWARD_COMPATIBLE',
        'FORWARD_ONLY',
        'MANUAL_RECOVERY',
      ].includes(String(manifest.database.migrationCompatibility))
    )
      throw new ReleaseError('MANIFEST_DATABASE_INVALID');
    if (
      !objectValue(manifest.supplyChain) ||
      !exactKeysValid(manifest.supplyChain, ['attestationPolicy']) ||
      !['DIGEST_ONLY', 'GITHUB_PROVENANCE_REQUIRED'].includes(
        String(manifest.supplyChain.attestationPolicy),
      )
    )
      throw new ReleaseError('MANIFEST_SUPPLY_CHAIN_INVALID');
    if (
      typeof manifest.sourceCommit !== 'string' ||
      !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)
    )
      throw new ReleaseError('MANIFEST_SOURCE_INVALID');
    if (
      manifest.buildDate !== undefined &&
      (typeof manifest.buildDate !== 'string' ||
        !Number.isFinite(new Date(manifest.buildDate).getTime()))
    )
      throw new ReleaseError('MANIFEST_BUILD_DATE_INVALID');
    return {
      manualRequired:
        manifest.requiresManualAction === true ||
        manifest.supplyChain.attestationPolicy !== 'GITHUB_PROVENANCE_REQUIRED',
      value: manifest,
    };
  }

  private recordAudit(
    communityId: string,
    user: RequestUser | undefined,
    context: AuditRequestContext | undefined,
    outcome: 'SUCCESS' | 'FAILURE',
    id: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.recordBestEffort({
      communityId,
      actorUserId: user?.id,
      actorRole: user?.role,
      actorType: user ? 'USER' : 'SYSTEM',
      category: 'SYSTEM',
      action: 'system.update.checked',
      outcome,
      severity: outcome === 'SUCCESS' ? 'INFO' : 'WARNING',
      targetType: 'SystemUpdateCheck',
      targetId: id,
      requestContext: context,
      metadata,
    });
  }

  private async refreshAllCommunities() {
    const communities = await this.prisma.community.findMany({
      select: { id: true },
    });
    for (const community of communities)
      await this.latestFor(community.id, undefined, false).catch(
        () => undefined,
      );
  }

  private async pruneChecks(communityId: string) {
    const expired = await this.prisma.systemUpdateCheck.findMany({
      where: { communityId },
      orderBy: { checkedAt: 'desc' },
      skip: 500,
      select: { id: true },
    });
    if (expired.length) {
      await this.prisma.systemUpdateCheck.deleteMany({
        where: { id: { in: expired.map((check) => check.id) } },
      });
    }
  }
}

class ReleaseError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function strictVersion(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value)
  )
    throw new ReleaseError('RELEASE_VERSION_INVALID');
  return normalizeVersion(value);
}

function objectValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function safeUrl(value: unknown) {
  return typeof value === 'string' &&
    value.startsWith('https://github.com/Pona-Ekolo/PE-Community/')
    ? value
    : null;
}
function safeDate(value: unknown) {
  const date = typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}
function publicCheck(check: {
  id: string;
  installedVersion: string;
  latestVersion: string | null;
  status: SystemUpdateCheckStatus;
  checkedAt: Date;
  lastSuccessfulCheckedAt: Date | null;
  releaseUrl: string | null;
  releasePublishedAt: Date | null;
  releaseNotes: string | null;
  errorCategory: string | null;
  releaseMetadataSnapshot: Prisma.JsonValue | null;
}) {
  return {
    id: check.id,
    installedVersion: check.installedVersion,
    latestVersion: check.latestVersion,
    status: check.status,
    checkedAt: check.checkedAt.toISOString(),
    lastSuccessfulCheckedAt:
      check.lastSuccessfulCheckedAt?.toISOString() ?? null,
    releaseUrl: check.releaseUrl,
    releasePublishedAt: check.releasePublishedAt?.toISOString() ?? null,
    releaseNotes: check.releaseNotes,
    errorCategory: check.errorCategory,
    releaseMetadata: check.releaseMetadataSnapshot,
  };
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (!exactKeysValid(value, allowed))
    throw new ReleaseError('MANIFEST_UNKNOWN_FIELD');
}

function exactKeysValid(
  value: Record<string, unknown>,
  allowed: readonly string[],
) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

async function fetchManifest(initialUrl: string) {
  let url = initialUrl;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !MANIFEST_REDIRECT_HOSTS.has(parsed.hostname) ||
      parsed.username ||
      parsed.password
    )
      throw new ReleaseError('MANIFEST_REDIRECT_INVALID');
    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        accept: 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'pe-community-api',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || redirect === 3)
      throw new ReleaseError('MANIFEST_REDIRECT_INVALID');
    url = new URL(location, url).toString();
  }
  throw new ReleaseError('MANIFEST_REDIRECT_INVALID');
}

async function publicRepositoryExists() {
  const response = await fetch(REPOSITORY_URL, {
    redirect: 'error',
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'pe-community-api',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new ReleaseError(`GITHUB_REPOSITORY_HTTP_${response.status}`);
  const value = await boundedJson(response, MAX_RELEASE_BYTES);
  if (
    !objectValue(value) ||
    value.full_name !== 'Pona-Ekolo/PE-Community' ||
    value.private !== false
  )
    throw new ReleaseError('GITHUB_REPOSITORY_INVALID');
  return true;
}

async function boundedJson(
  response: Response,
  maximumBytes: number,
): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maximumBytes) throw new ReleaseError('RESPONSE_TOO_LARGE');
  if (!response.body) return JSON.parse(await response.text()) as unknown;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new ReleaseError('RESPONSE_TOO_LARGE');
    }
    chunks.push(value);
  }
  const payload = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as unknown;
  } catch {
    throw new ReleaseError('RESPONSE_INVALID_JSON');
  }
}
