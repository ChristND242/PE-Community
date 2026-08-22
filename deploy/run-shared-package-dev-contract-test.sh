#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

API_PORT=${API_PORT:-4000}
WEB_PORT=${WEB_PORT:-3000}
api_log=$(mktemp /tmp/pe-shared-api.XXXXXX.log)
web_log=$(mktemp /tmp/pe-shared-web.XXXXXX.log)
admin_body=$(mktemp /tmp/pe-shared-admin.XXXXXX.html)
api_pid=''
web_pid=''

stop_process_group() {
  pid=$1
  [ -n "$pid" ] || return 0

  kill -TERM "-${pid}" 2>/dev/null || true
  remaining=0
  while kill -0 "$pid" 2>/dev/null && [ "$remaining" -lt 5 ]; do
    remaining=$((remaining + 1))
    sleep 1
  done

  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL "-${pid}" 2>/dev/null || true
  fi
  wait "$pid" 2>/dev/null || true
}

cleanup() {
  if [ -n "$web_pid" ]; then
    stop_process_group "$web_pid"
    web_pid=''
  fi
  if [ -n "$api_pid" ]; then
    stop_process_group "$api_pid"
    api_pid=''
  fi
  rm -f "$api_log" "$web_log" "$admin_body"
}
trap cleanup EXIT INT TERM

port_is_listening() {
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1$"
}

if port_is_listening "$API_PORT" || port_is_listening "$WEB_PORT"; then
  echo "BLOCKED: required audit port is already in use; refusing to disturb an existing process." >&2
  exit 77
fi

pnpm --filter @pe/shared build
cjs_before=$(sha256sum packages/shared/dist/cjs/index.js | awk '{print $1}')
esm_before=$(sha256sum packages/shared/dist/esm/index.js | awk '{print $1}')

setsid env PORT="$API_PORT" pnpm api:dev >"$api_log" 2>&1 &
api_pid=$!
setsid env WEB_PORT="$WEB_PORT" pnpm web:dev >"$web_log" 2>&1 &
web_pid=$!

blocked_process() {
  log_file=$1
  if grep -Eq 'listen EPERM|EADDRINUSE|PrismaClientInitializationError|Can.t reach database server|connect EPERM|connect ECONNREFUSED' "$log_file"; then
    cat "$log_file" >&2
    echo "BLOCKED: local runtime dependency or port binding is unavailable." >&2
    exit 77
  fi
}

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
admin_status=''
until [ -n "$admin_status" ]; do
  if ! kill -0 "$web_pid" 2>/dev/null; then
    blocked_process "$web_log"
    cat "$web_log" >&2
    exit 1
  fi
  admin_status=$(curl --fail-with-body --silent --show-error \
    --output "$admin_body" --write-out '%{http_code}' \
    --header 'Cookie: pe_session=audit-placeholder' \
    "http://localhost:${WEB_PORT}/admin" || true)
  if [ "$admin_status" = '000' ]; then
    admin_status=''
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 120 ]; then
    blocked_process "$web_log"
    cat "$web_log" >&2
    exit 1
  fi
  sleep 1
done

if [ "$admin_status" -ge 500 ] 2>/dev/null; then
  cat "$admin_body" >&2
  cat "$web_log" >&2
  exit 1
fi

if grep -Eq "Cannot use 'import.meta' outside a module|Module parse failed|import\.meta\.webpackHot|webpackHot|GET /admin 500" "$web_log"; then
  cat "$web_log" >&2
  exit 1
fi

if ! grep -Eq 'GET /admin' "$web_log"; then
  echo "The development server did not record the required /admin request." >&2
  cat "$web_log" >&2
  exit 1
fi

cjs_after=$(sha256sum packages/shared/dist/cjs/index.js | awk '{print $1}')
esm_after=$(sha256sum packages/shared/dist/esm/index.js | awk '{print $1}')
test "$cjs_before" = "$cjs_after"
test "$esm_before" = "$esm_after"

if rg -n 'webpackHot|react-refresh|RefreshRuntime|Refresh Boundary|module\.hot' packages/shared/dist; then
  exit 1
fi

cleanup
trap - EXIT INT TERM

if port_is_listening "$API_PORT" || port_is_listening "$WEB_PORT"; then
  echo "A local development process remained after cleanup." >&2
  exit 1
fi

echo "PASSED: shared local development contract (/admin status ${admin_status})."
