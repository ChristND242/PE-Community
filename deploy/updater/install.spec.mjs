import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
  assert.match(installer, /releases\/tags\/\$tag/);
  assert.match(installer, /\.draft == false and \.prerelease == false/);
  assert.match(installer, /sha256sum/);
  assert.match(installer, /--version vX\.Y\.Z/);
  assert.match(installer, /--repair/);
  assert.match(installer, /--uninstall/);
  assert.match(installer, /remove_env/);
  assert.doesNotMatch(installer, /pull|up -d(?! --no-deps api)/);
});
