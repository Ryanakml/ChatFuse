#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/canary-validate.sh
#
# Canary validation script for production deployments.
# Used in: .github/workflows/deploy-production.yml (canary-validation job)
#
# Waits for a configurable soak period, then checks health and error thresholds.
# If any check fails, the deploy-production workflow will trigger a rollback.
#
# Usage:
#   API_URL=https://canary.example.com \
#   SOAK_SECONDS=300 \
#   SKIP_CANARY=false \
#   ./scripts/canary-validate.sh
#
# Exit codes:
#   0 — canary validation passed, safe to promote
#   1 — canary validation failed, trigger rollback
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

API_URL="${API_URL:?ERROR: API_URL environment variable is required}"
SOAK_SECONDS="${SOAK_SECONDS:-300}"
SKIP_CANARY="${SKIP_CANARY:-false}"

# Configurable thresholds
MAX_CONSECUTIVE_HEALTH_FAILURES=3   # Number of consecutive health failures to trigger rollback
HEALTH_POLL_INTERVAL_SECONDS=15     # How often to poll during soak

PASS=0
FAIL=0
CONSECUTIVE_FAILURES=0

# ── Helper functions ──────────────────────────────────────────────────────────

log() {
  echo "[$(date -u +%H:%M:%S)] $1"
}

pass() {
  log "[PASS] $1"
  PASS=$((PASS + 1))
  CONSECUTIVE_FAILURES=0
}

fail() {
  log "[FAIL] $1"
  FAIL=$((FAIL + 1))
  CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
}

# ── Skip logic ────────────────────────────────────────────────────────────────

if [ "$SKIP_CANARY" = "true" ]; then
  log "SKIP_CANARY=true — skipping canary soak. Proceeding directly to promote."
  log "WARNING: Only use this for emergency hotfixes with pre-validated commits."
  exit 0
fi

# ── Pre-soak health check ─────────────────────────────────────────────────────

echo "============================================"
echo "  Canary Validation"
echo "  Target:       $API_URL"
echo "  Soak period:  ${SOAK_SECONDS}s"
echo "  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================"
echo ""

log "Pre-soak initial health check..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/health" || echo "000")
if [ "$STATUS" = "200" ]; then
  log "Pre-soak health check passed (HTTP $STATUS)."
else
  log "ERROR: Canary /health returned HTTP $STATUS before soak. Aborting."
  exit 1
fi

# ── Soak period with polling ──────────────────────────────────────────────────

log "Starting ${SOAK_SECONDS}s soak period (polling every ${HEALTH_POLL_INTERVAL_SECONDS}s)..."
echo ""

ELAPSED=0
while [ "$ELAPSED" -lt "$SOAK_SECONDS" ]; do
  sleep "$HEALTH_POLL_INTERVAL_SECONDS"
  ELAPSED=$((ELAPSED + HEALTH_POLL_INTERVAL_SECONDS))

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/health" || echo "000")
  if [ "$STATUS" = "200" ]; then
    pass "Health check at ${ELAPSED}s — HTTP $STATUS"
  else
    fail "Health check at ${ELAPSED}s — HTTP $STATUS"
  fi

  # Fail fast if consecutive failures exceed threshold
  if [ "$CONSECUTIVE_FAILURES" -ge "$MAX_CONSECUTIVE_HEALTH_FAILURES" ]; then
    echo ""
    log "ERROR: $CONSECUTIVE_FAILURES consecutive health failures. Triggering rollback."
    exit 1
  fi
done

echo ""
log "Soak period complete."

# ── Post-soak checks ──────────────────────────────────────────────────────────

log "Running post-soak checks..."

# Check /ready endpoint
READY_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/ready" || echo "000")
if [ "$READY_STATUS" = "200" ]; then
  pass "POST-SOAK: /ready — HTTP $READY_STATUS"
else
  fail "POST-SOAK: /ready — HTTP $READY_STATUS"
fi

# Check metrics endpoint if available
METRICS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${API_URL}/metrics" || echo "000")
if [ "$METRICS_STATUS" = "200" ]; then
  pass "POST-SOAK: /metrics — HTTP $METRICS_STATUS"
  # Optional: parse error_rate from Prometheus metrics
  METRICS_BODY=$(curl -s --max-time 10 "${API_URL}/metrics" 2>/dev/null || echo "")
  if [ -n "$METRICS_BODY" ]; then
    log "Metrics endpoint reachable. (Threshold analysis is provider-specific; add custom checks here.)"
  fi
else
  log "INFO: /metrics returned HTTP $METRICS_STATUS — skipping metric threshold check."
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Canary Validation Results"
echo "  Passed: $PASS | Failed: $FAIL"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  log "CANARY VALIDATION FAILED. Rollback will be triggered."
  exit 1
fi

log "CANARY VALIDATION PASSED. Safe to promote to 100%."
exit 0
