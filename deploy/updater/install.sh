#!/bin/sh
set -eu

repository='Pona-Ekolo/PE-Community'
version=''
project_dir=''
mode='install'

usage() {
  echo "Usage: sudo ./deploy/updater/install.sh [--project-dir DIR] [--version vX.Y.Z] [--repair|--uninstall]" >&2
  exit 64
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-dir) project_dir=${2-}; shift 2 ;;
    --version) version=${2-}; shift 2 ;;
    --repair) mode='repair'; shift ;;
    --uninstall) mode='uninstall'; shift ;;
    *) usage ;;
  esac
done

fail() { printf '%s\n' "$1" >&2; exit 1; }
safe_value() {
  case "$1" in *"
"*|*""*|*"$(printf '\t')"*) return 1;; esac
}
safe_path() {
  safe_value "$1" || return 1
  case "$1" in /*) ;; *) return 1;; esac
  printf '%s' "$1" | grep -Eq '^/[A-Za-z0-9._/-]+$'
}
require_root() { [ "$(id -u)" -eq 0 ] || fail 'Run this installer with sudo or as root.'; }
project_root() {
  candidate=${project_dir:-$(pwd -P)}
  safe_value "$candidate" || fail 'Invalid project path.'
  [ -d "$candidate" ] || fail 'PE Community project not found.'
  candidate=$(CDPATH= cd -- "$candidate" && pwd -P)
  safe_path "$candidate" || fail 'Invalid project path.'
  [ -f "$candidate/docker-compose.prod.yml" ] && [ -f "$candidate/.env" ] && [ -f "$candidate/deploy/Caddyfile" ] || fail 'PE Community project not found.'
  printf '%s\n' "$candidate"
}
architecture() {
  case "$(uname -m)" in x86_64) printf '%s\n' linux-amd64;; aarch64|arm64) printf '%s\n' linux-arm64;; *) fail 'Unsupported host architecture.';; esac
}
set_env() {
  file=$1 key=$2 value=$3 temporary="$file.tmp.$$"
  safe_value "$value" || fail 'Invalid configuration value.'
  awk -v key="$key" -v value="$value" '
    BEGIN { written=0 }
    index($0, key "=") == 1 { if (!written) { print key "=" value; written=1 }; next }
    { print }
    END { if (!written) print key "=" value }
  ' "$file" > "$temporary"
  chmod "$(stat -c '%a' "$file")" "$temporary"
  chown "$(stat -c '%u:%g' "$file")" "$temporary"
  mv "$temporary" "$file"
}
remove_env() {
  file=$1 key=$2 temporary="$file.tmp.$$"
  awk -v key="$key" 'index($0, key "=") != 1 { print }' "$file" > "$temporary"
  chmod "$(stat -c '%a' "$file")" "$temporary"
  chown "$(stat -c '%u:%g' "$file")" "$temporary"
  mv "$temporary" "$file"
}
release_asset() {
  tag=$1 asset=$2 destination=$3
  command -v curl >/dev/null 2>&1 || fail 'curl is required to install the updater.'
  command -v jq >/dev/null 2>&1 || fail 'jq is required to install the updater.'
  api="https://api.github.com/repos/$repository/releases/tags/$tag"
  release=$(curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$api") || fail 'Updater artifact verification failed.'
  [ "$(printf '%s' "$release" | jq -r '.draft == false and .prerelease == false')" = true ] || fail 'Updater artifact verification failed.'
  url=$(printf '%s' "$release" | jq -r --arg asset "$asset" '[.assets[] | select(.name == $asset)] | if length == 1 then .[0].browser_download_url else empty end')
  digest=$(printf '%s' "$release" | jq -r --arg asset "$asset" '[.assets[] | select(.name == $asset)] | if length == 1 then .[0].digest else empty end')
  [ -n "$url" ] && [ "${digest#sha256:}" != "$digest" ] || fail 'Updater artifact verification failed.'
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "$url" --output "$destination" || fail 'Updater artifact verification failed.'
  actual=$(sha256sum "$destination" | awk '{print $1}')
  [ "sha256:$actual" = "$digest" ] || fail 'Updater artifact verification failed.'
}
install_bundle() {
  project=$1 archive=$2 target_arch=$3
  install_root="$project/.pe/updater"
  stage=$(mktemp -d "${TMPDIR:-/tmp}/pe-community-updater.XXXXXX")
  trap 'rm -rf "$stage"' EXIT HUP INT TERM
  tar -xzf "$archive" -C "$stage" || fail 'Updater artifact verification failed.'
  package="$stage/pe-community-updater"
  entries=$(tar -tzf "$archive") || fail 'Updater artifact verification failed.'
  printf '%s\n' "$entries" | grep -Eq '^pe-community-updater/(bin/pe-community-updater|bin/gh|dist/server.js|deploy/install.sh)$' || fail 'Updater artifact verification failed.'
  printf '%s\n' "$entries" | grep -Eq '(^/|(^|/)\.\.(/|$))' && fail 'Updater artifact verification failed.'
  [ -f "$package/bin/pe-community-updater" ] && [ -f "$package/bin/gh" ] && [ ! -L "$package/bin/gh" ] && [ -x "$package/bin/gh" ] || fail 'Bundled verifier is invalid.'
  case "$target_arch" in linux-amd64) expected_machine='Advanced Micro Devices X86-64';; linux-arm64) expected_machine='AArch64';; *) fail 'Unsupported host architecture.';; esac
  command -v readelf >/dev/null 2>&1 || fail 'Bundled verifier is invalid.'
  readelf -h "$package/bin/gh" | grep -F "Machine:                           $expected_machine" >/dev/null || fail 'Bundled verifier is invalid.'
  "$package/bin/gh" version | head -n1 | grep -Eq '^gh version 2\.93\.0 ' || fail 'Bundled verifier is invalid.'
  mkdir -p "$project/.pe"
  chown root:root "$project/.pe"
  chmod 0755 "$project/.pe"
  rm -rf "$install_root.next"
  mv "$package" "$install_root.next"
  chown -R root:root "$install_root.next"
  chmod -R go-w "$install_root.next"
  if [ -d "$install_root" ]; then rm -rf "$install_root.previous"; mv "$install_root" "$install_root.previous"; fi
  mv "$install_root.next" "$install_root"
  printf '%s\n' "$install_root"
}
install_unit() {
  template=$1 destination=$2 project=$3 root=$4
  state="$root/state" backup="$root/backups" runtime='/run/pe-community-updater'
  for path in "$project" "$root" "$state" "$backup" "$runtime"; do
    safe_path "$path" || fail 'Invalid updater path.'
  done
  awk -v project="$project" -v root="$root" -v state="$state" -v backup="$backup" -v runtime="$runtime" '
    { gsub("@PE_UPDATER_PROJECT_ROOT@", project); gsub("@PE_UPDATER_ROOT@", root); gsub("@PE_UPDATER_STATE_DIR@", state); gsub("@PE_UPDATER_BACKUP_ROOT@", backup); gsub("@PE_UPDATER_RUNTIME_DIR@", runtime); print }
  ' "$template" > "$destination"
  grep -q '@PE_UPDATER_' "$destination" && fail 'Updater service template is invalid.'
  chmod 0644 "$destination"
}

require_root
project=$(project_root)
getent group pe-community-updater >/dev/null 2>&1 || groupadd --system pe-community-updater
command -v node >/dev/null 2>&1 || fail 'Node.js is required to run the updater.'

if [ "$mode" = uninstall ]; then
  systemctl disable --now pe-community-updater.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/pe-community-updater.service /etc/pe-community-updater/updater.env
  rmdir /etc/pe-community-updater 2>/dev/null || true
  for key in PE_UPDATER_SHARED_SECRET PE_UPDATER_SOCKET PE_UPDATER_RUNTIME_DIR PE_UPDATER_SOCKET_GID PE_UPDATER_COMPOSE_OVERRIDE; do
    remove_env "$project/.env" "$key"
  done
  systemctl daemon-reload
  docker compose --env-file "$project/.env" -f "$project/docker-compose.prod.yml" up -d --no-deps api
  printf '%s\n' 'PE Community Updater removed. Application data was not changed.'
  exit 0
fi

arch=$(architecture)
current=$(awk -F= '$1 == "PE_COMMUNITY_VERSION" { gsub(/"/, "", $2); print $2; exit }' "$project/.env")
[ -n "$current" ] || fail 'PE Community version is missing from .env.'
case "$version" in '') version=$current;; v[0-9]*.[0-9]*.[0-9]*) ;; *) fail 'Updater version must be strict stable semver.';; esac

archive=$(mktemp "${TMPDIR:-/tmp}/pe-community-updater.XXXXXX.tar.gz")
release_asset "$version" "pe-community-updater-$version-$arch.tar.gz" "$archive"
root=$(install_bundle "$project" "$archive" "$arch")
mkdir -p "$root/state" "$root/backups"
chown root:root "$root/state" "$root/backups"
chmod 0700 "$root/state" "$root/backups"
install -d -m 0750 -o root -g pe-community-updater /run/pe-community-updater
install -d -m 0700 -o root -g root /etc/pe-community-updater

secret=$(awk -F= '$1 == "PE_UPDATER_SHARED_SECRET" { print substr($0, index($0, "=") + 1); exit }' "$project/.env")
if [ "${#secret}" -lt 32 ]; then secret=$(od -An -N48 -tx1 /dev/urandom | tr -d ' \n'); fi
set_env "$project/.env" PE_UPDATER_SHARED_SECRET "$secret"
set_env "$project/.env" PE_UPDATER_SOCKET /run/pe-community-updater/updater.sock
set_env "$project/.env" PE_UPDATER_RUNTIME_DIR /run/pe-community-updater
set_env "$project/.env" PE_UPDATER_SOCKET_GID "$(getent group pe-community-updater | awk -F: '{print $3}')"
set_env "$project/.env" PE_UPDATER_COMPOSE_OVERRIDE "$root/docker-compose.updater.yml"
install -m 0644 "$root/deploy/docker-compose.updater.yml" "$root/docker-compose.updater.yml"
cat > /etc/pe-community-updater/updater.env <<EOF
PE_UPDATER_SHARED_SECRET=$secret
PE_UPDATER_SHARED_SECRET_PREVIOUS=
PE_UPDATER_PROJECT_ROOT=$project
PE_UPDATER_DEPLOYMENT_ROOT=$project
PE_UPDATER_ROOT=$root
PE_UPDATER_STATE_DIR=$root/state
PE_UPDATER_BACKUP_ROOT=$root/backups
PE_UPDATER_RUNTIME_DIR=/run/pe-community-updater
PE_UPDATER_SOCKET=/run/pe-community-updater/updater.sock
PE_UPDATER_COMPOSE_OVERRIDE=$root/docker-compose.updater.yml
PE_UPDATER_MINIMUM_FREE_BYTES=5368709120
PE_UPDATER_BACKUP_RETENTION=5
PE_UPDATER_API_HEALTH_URL=http://127.0.0.1/api/v1/health
PE_UPDATER_WEB_HEALTH_URL=http://127.0.0.1/login
EOF
chmod 0600 /etc/pe-community-updater/updater.env
install_unit "$root/deploy/pe-community-updater.service" /etc/systemd/system/pe-community-updater.service "$project" "$root"
systemctl daemon-reload
systemctl enable --now pe-community-updater.service
docker compose --env-file "$project/.env" -f "$project/docker-compose.prod.yml" -f "$root/docker-compose.updater.yml" up -d --no-deps api
printf '%s\n' 'PE Community Updater'
printf '%s\n' "[ok] Installation found" "[ok] Architecture: $arch" "[ok] Stable release: $version" "[ok] Updater verified" "[ok] Updater installed" "[ok] Service running" "[ok] API connected" "[ok] Current application remains $current" '' 'Updater installation complete.' 'No update was performed.'
