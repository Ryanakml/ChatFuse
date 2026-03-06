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
  echo -e "${YELLOW}${BOLD}[WARN]${RESET} $1" >&2
}

log_error() {
  echo -e "${RED}${BOLD}[ERROR]${RESET} $1" >&2
}

log_success() {
  echo -e "${GREEN}${BOLD}[OK]${RESET} $1"
}

MIGRATIONS_DIR="supabase/migrations"

log_info "Starting database migration validation"
echo

# 1. Check directory exists
if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  log_error "Directory not found: $MIGRATIONS_DIR"
  exit 1
fi

shopt -s nullglob
migration_files=("$MIGRATIONS_DIR"/*.sql)

# 2. Ensure migrations exist
if [[ ${#migration_files[@]} -eq 0 ]]; then
  log_warn "No migration files (.sql) found in $MIGRATIONS_DIR"
  exit 1
fi

invalid=0
timestamps=()

log_info "Found ${#migration_files[@]} migration files. Validating format and forward-only rules"
echo

# 3. Validate each file
for file_path in "${migration_files[@]}"; do
  file_name=$(basename "$file_path")

  # Enforce forward-only migrations
  if [[ "$file_name" =~ \.down\.sql$ || "$file_name" =~ \.rollback\.sql$ || "$file_name" =~ (_|-)down\.sql$ ]]; then
    log_error "Rollback/down migration detected: $file_name"
    invalid=1
    continue
  fi

  # Validate naming format
  if [[ ! "$file_name" =~ ^[0-9]{12,14}_[a-z0-9_]+\.sql$ ]]; then
    log_error "Invalid filename format: $file_name"
    echo "        Expected: YYYYMMDDHHMM_migration_name.sql" >&2
    invalid=1
    continue
  fi

  timestamps+=("${file_name%%_*}")
done

echo

# 4. Stop if validation failed
if [[ $invalid -ne 0 ]]; then
  log_error "Migration validation failed. Fix the errors above."
  exit 1
fi

# 5. Validate timestamp uniqueness and ordering
if [[ ${#timestamps[@]} -gt 0 ]]; then

  duplicate_timestamps=$(printf "%s\n" "${timestamps[@]}" | sort | uniq -d || true)

  if [[ -n "$duplicate_timestamps" ]]; then
    log_error "Duplicate migration timestamps detected:"
    printf "  %s\n" "$duplicate_timestamps" >&2
    exit 1
  fi

  prev=""

  while IFS= read -r ts; do
    if [[ -n "$prev" && "$ts" -le "$prev" ]]; then
      log_error "Timestamp order violation: $prev -> $ts"
      exit 1
    fi

    prev="$ts"

  done < <(printf "%s\n" "${timestamps[@]}" | sort)
fi

log_success "All migration files are valid (forward-only, format, and order verified)"
exit 0