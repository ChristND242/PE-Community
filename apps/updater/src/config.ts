import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export type UpdaterConfig = {
  deploymentRoot: string;
  composeFile: string;
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
    environment.PE_UPDATER_DEPLOYMENT_ROOT ?? '/opt/pe-community-management',
  );
  const stateDir = fixedDirectory(
    environment.PE_UPDATER_STATE_DIR ?? '/var/lib/pe-community-updater',
  );
  const backupRoot = fixedDirectory(
    environment.PE_UPDATER_BACKUP_ROOT ?? '/opt/pe-community-backups',
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
    deploymentRoot,
    composeFile: fixedChild(deploymentRoot, 'docker-compose.prod.yml'),
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
  const stat = lstatSync(candidate);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    realpathSync(candidate) !== candidate
  )
    throw new Error(`Unsafe updater file: ${candidate}`);
  return candidate;
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
