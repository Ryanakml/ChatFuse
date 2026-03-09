#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/smoke-test.sh
#
# Smoke test script for staging deployments.
# Used in: .github/workflows/deploy-staging.yml (smoke-test job)
#
# Usage:
#   API_URL=https://staging.example.com \
#   WHATSAPP_VERIFY_TOKEN=my-token \
#   ./scripts/smoke-test.sh
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

API_URL="${API_URL:?ERROR: API_URL environment variable is required}"
WHATSAPP_VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:?ERROR: WHATSAPP_VERIFY_TOKEN environment variable is required}"

PASS=0
FAIL=0

# ── Helper functions ──────────────────────────────────────────────────────────

pass() {
  echo "[PASS] $1"
  PASS=$((PASS + 1))
}

fail() {
  echo "[FAIL] $1"
  FAIL=$((FAIL + 1))
}

check_http() {
  local description="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local expected_body="${4:-}"

  local http_status
  local body
  body=$(curl -s -w "\n%{http_code}" --max-time 10 "$url" 2>/dev/null || echo -e "\n000")
  http_status=$(echo "$body" | tail -1)
  body=$(echo "$body" | head -n -1)

  if [ "$http_status" = "$expected_status" ]; then
    if [ -n "$expected_body" ]; then
      if echo "$body" | grep -q "$expected_body"; then
        pass "$description — HTTP $http_status, body contains '$expected_body'"
      else
        fail "$description — HTTP $http_status (correct) but body is missing '$expected_body'. Got: $body"
      fi
    else
      pass "$description — HTTP $http_status"
    fi
  else
    fail "$description — expected HTTP $expected_status, got HTTP $http_status"
  fi
}

# ── Smoke Tests ───────────────────────────────────────────────────────────────

echo "============================================"
echo "  Smoke Test"
echo "  Target: $API_URL"
echo "  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "============================================"
echo ""

# 1. Basic health
check_http "GET /health" "${API_URL}/health" "200"

# 2. Readiness probe
check_http "GET /ready" "${API_URL}/ready" "200"

# 3. WhatsApp webhook verification challenge
CHALLENGE="smoke_test_challenge_$$"
check_http \
  "GET /webhook (verification challenge)" \
  "${API_URL}/webhook?hub.mode=subscribe&hub.verify_token=${WHATSAPP_VERIFY_TOKEN}&hub.challenge=${CHALLENGE}" \
  "200" \
  "${CHALLENGE}"

# 4. Webhook with wrong token must be rejected (403 or 401)
echo ""
echo "Testing rejection of invalid verify token..."
WRONG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
  "${API_URL}/webhook?hub.mode=subscribe&hub.verify_token=WRONG_TOKEN&hub.challenge=test" || echo "000")
if [ "$WRONG_STATUS" = "403" ] || [ "$WRONG_STATUS" = "401" ]; then
  pass "GET /webhook with wrong token — correctly rejected (HTTP $WRONG_STATUS)"
else
  fail "GET /webhook with wrong token — expected 403/401, got HTTP $WRONG_STATUS"
fi

# 5. POST /webhook with missing signature must be rejected
echo ""
echo "Testing rejection of unsigned webhook POST..."
UNSIGNED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 10 \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account"}' \
  "${API_URL}/webhook" || echo "000")
if [ "$UNSIGNED_STATUS" = "401" ] || [ "$UNSIGNED_STATUS" = "403" ] || [ "$UNSIGNED_STATUS" = "400" ]; then
  pass "POST /webhook without signature — correctly rejected (HTTP $UNSIGNED_STATUS)"
else
  fail "POST /webhook without signature — expected 400/401/403, got HTTP $UNSIGNED_STATUS"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo "SMOKE TEST FAILED."
  exit 1
fi

echo "SMOKE TEST PASSED."
exit 0
