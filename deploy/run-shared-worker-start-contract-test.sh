#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

API_PORT=${API_PORT:-4000}
WEB_PORT=${WEB_PORT:-3000}
api_log=$(mktemp /tmp/pe-shared-worker-api.XXXXXX.log)
web_log=$(mktemp /tmp/pe-shared-worker-web.XXXXXX.log)
worker_log=$(mktemp /tmp/pe-shared-worker-worker.XXXXXX.log)
shared_log=$(mktemp /tmp/pe-shared-worker-shared.XXXXXX.log)
monitor_log=$(mktemp /tmp/pe-shared-worker-monitor.XXXXXX.log)
monitor_stop=$(mktemp /tmp/pe-shared-worker-stop.XXXXXX)
before_hash=$(mktemp /tmp/shared-before-worker.XXXXXX.sha256)
after_hash=$(mktemp /tmp/shared-after-worker.XXXXXX.sha256)
api_pid=''
web_pid=''
worker_pid=''
shared_pid=''
monitor_pid=''

stop_process_group() {
  pid=$1
  [ -n "$pid" ] || return 0
  kill -TERM "-${pid}" 2>/dev/null || true
  attempts=0
  while kill -0 "$pid" 2>/dev/null && [ "$attempts" -lt 5 ]; do
    attempts=$((attempts + 1))
    sleep 1
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "-${pid}" 2>/dev/null || true
  fi
  wait "$pid" 2>/dev/null || true
}

cleanup() {
  : >"$monitor_stop"
  if [ -n "$monitor_pid" ]; then
    wait "$monitor_pid" 2>/dev/null || true
    monitor_pid=''
  fi
  if [ -n "$worker_pid" ]; then
    stop_process_group "$worker_pid"
    worker_pid=''
  fi
  if [ -n "$shared_pid" ]; then
    stop_process_group "$shared_pid"
    shared_pid=''
  fi
  if [ -n "$web_pid" ]; then
    stop_process_group "$web_pid"
    web_pid=''
  fi
  if [ -n "$api_pid" ]; then
    stop_process_group "$api_pid"
    api_pid=''
  fi
  rm -f "$api_log" "$web_log" "$worker_log" "$shared_log" "$monitor_log" "$monitor_stop" \
    "$before_hash" "$after_hash"
}
trap cleanup EXIT INT TERM

port_is_listening() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1$"
}

blocked_process() {
  log_file=$1
  if grep -Eq 'listen EPERM|EADDRINUSE|PrismaClientInitializationError|Can.t reach database server|connect EPERM|connect ECONNREFUSED' "$log_file"; then
    cat "$log_file" >&2
    echo "BLOCKED: local runtime dependency or port binding is unavailable." >&2
    exit 77
  fi
}

fail_if_runtime_error() {
  if grep -Eq "No such file or directory|dist/esm/index|sourceType: module|Module parse failed|Cannot use 'import.meta'|webpackHot|GET /register 500|GET /login 500|GET /admin 500" "$web_log"; then
    cat "$web_log" >&2
    exit 1
  fi
}

request_route() {
  route=$1
  cookie=${2:-}
  body=$(mktemp /tmp/pe-shared-worker-route.XXXXXX.html)
  if [ -n "$cookie" ]; then
    status=$(curl --fail-with-body --silent --show-error --output "$body" \
      --write-out '%{http_code}' --header "$cookie" "http://localhost:${WEB_PORT}${route}" || true)
  else
    status=$(curl --fail-with-body --silent --show-error --output "$body" \
      --write-out '%{http_code}' "http://localhost:${WEB_PORT}${route}" || true)
  fi
  rm -f "$body"
  if [ -z "$status" ] || [ "$status" = '000' ] || [ "$status" -ge 500 ] 2>/dev/null; then
    cat "$web_log" >&2
    echo "Route ${route} failed with status ${status:-none}." >&2
    exit 1
  fi
}

if port_is_listening "$API_PORT" || port_is_listening "$WEB_PORT"; then
  echo "BLOCKED: required audit port is already in use; refusing to disturb an existing process." >&2
  exit 77
fi

node -e "require('node:fs').rmSync('packages/shared/dist',{recursive:true,force:true});require('node:fs').rmSync('apps/web/.next',{recursive:true,force:true});require('node:fs').rmSync('apps/api/dist',{recursive:true,force:true});require('node:fs').rmSync('apps/worker/dist',{recursive:true,force:true})"
pnpm --filter @pe/shared prepare:dev

setsid env PORT="$API_PORT" pnpm api:dev >"$api_log" 2>&1 &
api_pid=$!
setsid env WEB_PORT="$WEB_PORT" pnpm web:dev >"$web_log" 2>&1 &
web_pid=$!

attempt=0
until curl --fail --silent --output /dev/null "http://localhost:${API_PORT}/health"; do
  if ! kill -0 "$api_pid" 2>/dev/null; then
    blocked_process "$api_log"
    cat "$api_log" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 90 ]; then
    blocked_process "$api_log"
    cat "$api_log" >&2
    exit 1
  fi
  sleep 1
done

attempt=0
until curl --fail --silent --output /dev/null "http://localhost:${WEB_PORT}/login"; do
  if ! kill -0 "$web_pid" 2>/dev/null; then
    blocked_process "$web_log"
    cat "$web_log" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 120 ]; then
    blocked_process "$web_log"
    cat "$web_log" >&2
    exit 1
  fi
  sleep 1
done

request_route /register
request_route /login
request_route /admin 'Cookie: pe_session=audit-placeholder'
fail_if_runtime_error

find packages/shared/dist -type f -print0 | sort -z | xargs -0 sha256sum >"$before_hash"

rm -f "$monitor_stop"
(
  while [ ! -e "$monitor_stop" ]; do
    for file in \
      packages/shared/dist/esm/index.js \
      packages/shared/dist/esm/package.json \
      packages/shared/dist/cjs/index.js \
      packages/shared/dist/cjs/package.json \
      packages/shared/dist/index.d.ts
    do
      if [ ! -f "$file" ]; then
        printf 'MISSING %s\n' "$file" >>"$monitor_log"
      fi
    done
    sleep 0.05
  done
) &
monitor_pid=$!

setsid pnpm worker:dev >"$worker_log" 2>&1 &
worker_pid=$!

attempt=0
until grep -q '\[worker\] listening on pe-community-email and pe-community-notifications' "$worker_log"; do
  if ! kill -0 "$worker_pid" 2>/dev/null; then
    blocked_process "$worker_log"
    cat "$worker_log" >&2
    exit 1
  fi
  request_route /register
  request_route /login
  request_route /admin 'Cookie: pe_session=audit-placeholder'
  fail_if_runtime_error
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 90 ]; then
    blocked_process "$worker_log"
    cat "$worker_log" >&2
    exit 1
  fi
  sleep 1
done

request_route /register
request_route /login
request_route /admin 'Cookie: pe_session=audit-placeholder'
fail_if_runtime_error

find packages/shared/dist -type f -print0 | sort -z | xargs -0 sha256sum >"$after_hash"
diff -u "$before_hash" "$after_hash"

setsid pnpm --filter @pe/shared dev >"$shared_log" 2>&1 &
shared_pid=$!
attempt=0
until grep -q 'Watching shared source with staged publication.' "$shared_log"; do
  if ! kill -0 "$shared_pid" 2>/dev/null; then
    cat "$shared_log" >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    cat "$shared_log" >&2
    exit 1
  fi
  sleep 1
done

build_count=$(grep -c 'Built shared artifacts through staged publication.' "$shared_log" || true)
touch packages/shared/src/index.ts
attempt=0
while [ "$(grep -c 'Built shared artifacts through staged publication.' "$shared_log" || true)" -le "$build_count" ]; do
  if ! kill -0 "$shared_pid" 2>/dev/null; then
    cat "$shared_log" >&2
    exit 1
  fi
  request_route /register
  request_route /login
  request_route /admin 'Cookie: pe_session=audit-placeholder'
  fail_if_runtime_error
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    cat "$shared_log" >&2
    exit 1
  fi
  sleep 1
done

request_route /register
request_route /login
request_route /admin 'Cookie: pe_session=audit-placeholder'
fail_if_runtime_error
if ! kill -0 "$worker_pid" 2>/dev/null; then
  cat "$worker_log" >&2
  exit 1
fi
find packages/shared/dist -type f -print0 | sort -z | xargs -0 sha256sum >"$after_hash"
diff -u "$before_hash" "$after_hash"

: >"$monitor_stop"
wait "$monitor_pid"
monitor_pid=''
if [ -s "$monitor_log" ]; then
  cat "$monitor_log" >&2
  exit 1
fi

cleanup
trap - EXIT INT TERM

if port_is_listening "$API_PORT" || port_is_listening "$WEB_PORT"; then
  echo "A development process remained after cleanup." >&2
  exit 1
fi

echo "PASSED: API, Web, and Worker shared-development lifecycle contract."
