#!/usr/bin/env bash
set -euo pipefail

# ---- Terminal Colors ----
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
BOLD='\033[1m'
RESET='\033[0m'

log_info() {
  echo -e "${BLUE}${BOLD}[INFO]${RESET} $1"
}

log_warn() {
  echo -e "${YELLOW}${BOLD}[WARN]${RESET} $1"
}

log_success() {
  echo -e "${GREEN}${BOLD}[OK]${RESET} $1"
}

log_error() {
  echo -e "${RED}${BOLD}[ERROR]${RESET} $1" >&2
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  log_error "docker-compose file not found: $COMPOSE_FILE"
  exit 1
fi

compose_args=("-f" "$COMPOSE_FILE")

if [[ "${ENABLE_OTEL:-0}" == "1" ]]; then
  log_info "OpenTelemetry profile enabled"
  compose_args+=("--profile" "otel")
fi

log_info "Starting local development infrastructure"

docker compose "${compose_args[@]}" up -d

log_success "Local infrastructure is running"

# ---- Seed database if configured ----

if [[ -n "${DATABASE_URL:-}" ]]; then
  log_info "Seeding local database"
  "$ROOT_DIR/scripts/seed-local-db.sh"
  log_success "Database seed completed"
else
  log_warn "DATABASE_URL not set — skipping database seed"
fi
