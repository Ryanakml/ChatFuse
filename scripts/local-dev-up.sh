#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"

compose_args=("-f" "$COMPOSE_FILE")
if [[ "${ENABLE_OTEL:-0}" == "1" ]]; then
  compose_args+=("--profile" "otel")
fi

docker compose "${compose_args[@]}" up -d

echo "Local infrastructure is up."

if [[ -n "${DATABASE_URL:-}" ]]; then
  "$ROOT_DIR/scripts/seed-local-db.sh"
else
  echo "DATABASE_URL not set; skipping local DB seed."
fi
