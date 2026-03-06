#!/usr/bin/env bash
set -euo pipefail

# ---- Terminal Colors ----
RED='\033[31m'
GREEN='\033[32m'
BLUE='\033[34m'
BOLD='\033[1m'
RESET='\033[0m'

log_info() {
  echo -e "${BLUE}${BOLD}[INFO]${RESET} $1"
}

log_success() {
  echo -e "${GREEN}${BOLD}[OK]${RESET} $1"
}

log_error() {
  echo -e "${RED}${BOLD}[ERROR]${RESET} $1" >&2
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local.yml"

log_info "Stopping local development services"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  log_error "docker-compose file not found: $COMPOSE_FILE"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" down -v

log_success "Local development stack stopped and volumes removed"