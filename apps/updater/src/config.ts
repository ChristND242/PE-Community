import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type UpdaterConfig = {
  updaterRoot: string;
  deploymentRoot: string;
  composeFile: string;
  composeOverrideFile: string | null;
  envFile: string;
  caddyFile: string;
  stateDir: string;
  backupRoot: string;
  socketPath: string;
  sharedSecret: string;
  previousSharedSecret: string | null;
  minimumFreeBytes: number;
  backupRetention: number;
  publicApiHealthUrl: string;
  publicWebHealthUrl: string;
  topology: 'single-host';
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): UpdaterConfig {
  const deploymentRoot = fixedDirectory(
    environment.PE_UPDATER_DEPLOYMENT_ROOT ?? process.cwd(),
  );
  assertProjectRoot(deploymentRoot);
  const stateDir = fixedDirectory(
    environment.PE_UPDATER_STATE_DIR ??
      join(deploymentRoot, '.pe/updater/state'),
  );
  const backupRoot = fixedDirectory(
    environment.PE_UPDATER_BACKUP_ROOT ??
      join(deploymentRoot, '.pe/updater/backups'),
  );
  const sharedSecret = environment.PE_UPDATER_SHARED_SECRET ?? '';
  if (sharedSecret.length < 32)
    throw new Error(
      'PE_UPDATER_SHARED_SECRET must contain at least 32 characters.',
    );
  const previousSharedSecret =
    environment.PE_UPDATER_SHARED_SECRET_PREVIOUS?.trim() || null;
  if (previousSharedSecret && previousSharedSecret.length < 32)
    throw new Error(
      'PE_UPDATER_SHARED_SECRET_PREVIOUS must contain at least 32 characters.',
    );
  if (previousSharedSecret === sharedSecret)
    throw new Error('Updater current and previous secrets must differ.');
  return {
    updaterRoot: updaterInstallRoot(),
    deploymentRoot,
    composeFile: fixedChild(deploymentRoot, 'docker-compose.prod.yml'),
    composeOverrideFile: optionalFixedFile(
      environment.PE_UPDATER_COMPOSE_OVERRIDE,
    ),
    envFile: fixedChild(deploymentRoot, '.env'),
    caddyFile: fixedChild(deploymentRoot, 'deploy/Caddyfile'),
    stateDir,
    backupRoot,
    socketPath: fixedSocketPath(
      environment.PE_UPDATER_SOCKET ?? '/run/pe-community-updater/updater.sock',
    ),
    sharedSecret,
    previousSharedSecret,
    minimumFreeBytes: boundedInteger(
      environment.PE_UPDATER_MINIMUM_FREE_BYTES,
      5 * 1024 ** 3,
      1024 ** 3,
      1024 ** 4,
    ),
    backupRetention: boundedInteger(
      environment.PE_UPDATER_BACKUP_RETENTION,
      5,
      1,
      50,
    ),
    publicApiHealthUrl: healthUrl(
      environment.PE_UPDATER_API_HEALTH_URL ?? 'http://127.0.0.1/api/v1/health',
    ),
    publicWebHealthUrl: healthUrl(
      environment.PE_UPDATER_WEB_HEALTH_URL ?? 'http://127.0.0.1/login',
    ),
    topology: 'single-host',
  };
}

function optionalFixedFile(path: string | undefined) {
  return path?.trim() ? fixedFile(path) : null;
}

function fixedFile(path: string) {
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    realpathSync(resolved) !== resolved
  )
    throw new Error(`Unsafe updater file: ${resolved}`);
  return resolved;
}

/** The package root is derived from this module, never from PATH or an environment override. */
export function updaterInstallRoot(moduleUrl = import.meta.url) {
  return fixedDirectory(resolve(dirname(fileURLToPath(moduleUrl)), '..'));
}

export function bundledVerifierPath(moduleUrl = import.meta.url) {
  return resolve(updaterInstallRoot(moduleUrl), 'bin/gh');
}

function assertProjectRoot(root: string) {
  fixedChild(root, 'docker-compose.prod.yml');
  fixedChild(root, '.env');
  fixedChild(root, 'deploy/Caddyfile');
}

function fixedDirectory(path: string) {
  const resolved = resolve(path);
  const stat = lstatSync(resolved);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync(resolved) !== resolved
  )
    throw new Error(`Unsafe updater directory: ${resolved}`);
  return resolved;
}

function fixedChild(root: string, child: string) {
  const candidate = resolve(root, child);
  if (!candidate.startsWith(`${root}/`))
    throw new Error('Updater path escaped deployment root.');
  return fixedFile(candidate);
}

function fixedSocketPath(path: string) {
  const resolved = resolve(path);
  const parent = dirname(resolved);
  const stat = lstatSync(parent);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    realpathSync(parent) !== parent ||
    (stat.mode & 0o002) !== 0
  ) {
    throw new Error(`Unsafe updater socket directory: ${parent}`);
  }
  return resolve(parent, basename(resolved));
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error('Invalid updater numeric configuration.');
  return parsed;
}

function healthUrl(value: string) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Invalid health URL.');
  return url.toString();
}
