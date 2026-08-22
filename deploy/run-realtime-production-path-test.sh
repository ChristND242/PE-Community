#!/bin/sh
set -eu

compose_file="deploy/realtime-production-path.compose.yml"
project_name="pe-realtime-production-path"

cleanup() {
  docker compose --project-name "$project_name" -f "$compose_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM
cleanup

docker compose --project-name "$project_name" -f "$compose_file" build api
docker compose --project-name "$project_name" -f "$compose_file" up --detach --wait postgres redis api caddy
if ! docker compose --project-name "$project_name" -f "$compose_file" run --rm realtime-test; then
  docker compose --project-name "$project_name" -f "$compose_file" logs --no-color api caddy
  exit 1
fi
docker compose --project-name "$project_name" -f "$compose_file" logs --no-color api |
  grep '"scope":"realtime"' || true
