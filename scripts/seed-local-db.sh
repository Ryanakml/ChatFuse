#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_FILE="$ROOT_DIR/scripts/seed/seed-local.sql"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required to run local DB seeds."
  exit 1
fi

if [[ ! -f "$SEED_FILE" ]]; then
  echo "Seed file not found at $SEED_FILE"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run local DB seeds."
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED_FILE"
