import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

const installer = await readFile(
  new URL('./install.sh', import.meta.url),
  'utf8',
);
const service = await readFile(
  new URL('./pe-community-updater.service', import.meta.url),
  'utf8',
);
const override = await readFile(
  new URL('./docker-compose.updater.yml', import.meta.url),
  'utf8',
);

const digest =
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const updaterAssetNames = (tag) => [
  'pe-community-update-manifest.json',
  'pe-community-update-manifest.attestation.json',
  `pe-community-updater-${tag}-linux-amd64.tar.gz`,
  `pe-community-updater-${tag}-linux-arm64.tar.gz`,
];
const release = (tag, options = {}) => ({
  tag_name: tag,
  draft: options.draft ?? false,
  prerelease: options.prerelease ?? false,
  published_at: options.publishedAt ?? '2026-09-03T00:00:00Z',
  assets: (options.assets ?? updaterAssetNames(tag)).map((name) => ({
    name,
    digest: Object.hasOwn(options, 'digest') ? options.digest : digest,
    browser_download_url: `https://github.com/Pona-Ekolo/PE-Community/releases/download/${tag}/${name}`,
  })),
});

async function runInstallerFunction(functionCall, releasePayload) {
  const directory = await mkdtemp(join(tmpdir(), 'pe-updater-install-spec-'));
  const fixturePath = join(directory, 'releases.json');
  await writeFile(fixturePath, JSON.stringify(releasePayload));
  const script = [
    'installer=$1',
    'fixture=$2',
    'set --',
    'PE_UPDATER_INSTALLER_LIBRARY=1',
    'export PE_UPDATER_INSTALLER_LIBRARY',
    '. "$installer"',
    'release_json() { cat "$fixture"; }',
    functionCall,
  ].join('\n');
  return execFileAsync('sh', [
    '-ceu',
    script,
    '_',
    new URL('./install.sh', import.meta.url).pathname,
    fixturePath,
  ]);
}

test('portable bootstrap derives paths from the validated project and package roots', () => {
  assert.match(installer, /--project-dir DIR/);
  assert.match(installer, /docker-compose\.prod\.yml/);
  assert.match(installer, /\.pe\/updater/);
  assert.match(installer, /PE_UPDATER_COMPOSE_OVERRIDE/);
  assert.match(installer, /PE_UPDATER_ROOT=/);
  assert.match(installer, /PE_UPDATER_PROJECT_ROOT=/);
  assert.doesNotMatch(installer, /\/opt\/pe-community/);
  assert.doesNotMatch(
    installer,
    /command -v gh|which gh|\/usr\/bin\/gh|\/usr\/local\/bin\/gh/,
  );
  assert.match(installer, /command -v node/);
  assert.match(installer, /safe_value/);
  assert.match(installer, /Invalid project path/);
  assert.match(installer, /safe_path/);
  assert.match(installer, /install_unit/);
});

test('generated host integration keeps updater socket access API-only', () => {
  assert.match(service, /WorkingDirectory=@PE_UPDATER_PROJECT_ROOT@/);
  assert.match(
    service,
    /ExecStart=@PE_UPDATER_ROOT@\/bin\/pe-community-updater/,
  );
  assert.match(service, /ReadWritePaths=@PE_UPDATER_PROJECT_ROOT@/);
  assert.doesNotMatch(service, /\/opt\/pe-community/);
  assert.match(override, /^  api:/m);
  assert.match(override, /PE_UPDATER_SOCKET/);
  assert.match(override, /PE_UPDATER_RUNTIME_DIR/);
  assert.match(override, /PE_UPDATER_SOCKET_GID/);
  assert.doesNotMatch(override, /^  (web|worker):/m);
  assert.doesNotMatch(override, /docker\.sock/);
});

test('installer has bounded stable release selection and does not perform an application update', () => {
  assert.match(installer, /releases\?per_page=100&page=\$page/);
  assert.match(installer, /while \[ "\$page" -le 3 \]/);
  assert.match(installer, /select_eligible_release/);
  assert.match(installer, /select_pinned_release/);
  assert.match(installer, /\^v\(0\|\[1-9\]\[0-9\]\*\)/);
  assert.match(installer, /pe-community-updater-\$tag-linux-amd64\.tar\.gz/);
  assert.match(installer, /pe-community-updater-\$tag-linux-arm64\.tar\.gz/);
  assert.match(installer, /pe-community-update-manifest\.attestation\.json/);
  assert.match(installer, /sha256sum/);
  assert.match(installer, /--version vX\.Y\.Z/);
  assert.match(installer, /--repair/);
  assert.match(installer, /--uninstall/);
  assert.match(installer, /remove_env/);
  assert.doesNotMatch(installer, /version=\$current/);
  assert.doesNotMatch(
    installer,
    /set_env "\$project\/\.env" PE_COMMUNITY_VERSION/,
  );
  assert.match(installer, /--env-file "\$project\/\.env"/);
  const defaultSelection = installer.indexOf(
    'version=$(select_eligible_release)',
  );
  const firstEnvironmentMutation = installer.indexOf('set_env "$project/.env"');
  const apiRecreation = installer.lastIndexOf('up -d --no-deps api');
  assert.ok(
    defaultSelection >= 0 && defaultSelection < firstEnvironmentMutation,
  );
  assert.ok(apiRecreation > firstEnvironmentMutation);
  assert.doesNotMatch(installer, /pull|up -d(?! --no-deps api)/);
});

test('default selection skips historical application releases and chooses the newest complete updater release', async () => {
  const historical = release('v1.2.3', {
    assets: ['pe-community-updater-v1.2.3.tar.gz'],
  });
  const compatible = release('v1.2.4');
  const result = await runInstallerFunction('select_eligible_release', [
    historical,
    compatible,
  ]);

  assert.equal(result.stdout.trim(), 'v1.2.4');
  assert.doesNotMatch(result.stdout, /v1\.2\.3/);
});

test('release selection ignores draft, prerelease, malformed, and incomplete releases before choosing a complete stable release', async () => {
  const result = await runInstallerFunction('select_eligible_release', [
    release('v1.2.8', { draft: true }),
    release('v1.2.7', { prerelease: true }),
    release('v1.2.6', { assets: updaterAssetNames('v1.2.6').slice(0, -1) }),
    release('latest'),
    release('v1.2.5'),
  ]);

  assert.equal(result.stdout.trim(), 'v1.2.5');
});

test('release selection rejects missing digest metadata and strict semver violations', async () => {
  await assert.rejects(
    runInstallerFunction('select_eligible_release', [
      release('v1.2.4', { digest: null }),
    ]),
    /UPDATER_RELEASE_NOT_FOUND: No compatible stable updater release is available\./,
  );
  await assert.rejects(
    runInstallerFunction('select_pinned_release v1x2x3', release('v1.2.4')),
    /UPDATER_RELEASE_INELIGIBLE: Updater version must be strict stable semver\./,
  );
});

test('pinned selection accepts only the exact complete stable updater release', async () => {
  const selected = await runInstallerFunction(
    'select_pinned_release v1.2.4',
    release('v1.2.4'),
  );
  assert.equal(JSON.parse(selected.stdout).tag_name, 'v1.2.4');

  await assert.rejects(
    runInstallerFunction(
      'select_pinned_release v1.2.3',
      release('v1.2.3', { assets: ['pe-community-updater-v1.2.3.tar.gz'] }),
    ),
    /UPDATER_ASSET_MISSING: Updater package contract is incomplete for v1\.2\.3\./,
  );
});
