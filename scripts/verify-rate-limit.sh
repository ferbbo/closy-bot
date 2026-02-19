#!/bin/bash
# scripts/verify-rate-limit.sh
# Manual verification script for rate limiting (AC-09, AC-13)
#
# Purpose: Verify ThrottlerModule enforcement in staging/production environments.
# This script is necessary because @nestjs/throttler's in-memory storage does NOT
# work correctly in Jest E2E test environments (known limitation).
#
# Usage:
#   ./scripts/verify-rate-limit.sh <API_BASE_URL> <SESSION_COOKIE> <CHANNEL_ID>
#
# Example:
#   ./scripts/verify-rate-limit.sh https://staging-api.closy.io session_id=abc123 ch_xyz789
#
# Expected behavior:
#   - Requests 1-5: HTTP 200 OK
#   - Request 6: HTTP 429 Too Many Requests
#
# Related:
#   - Brief: docs/plan/pr-briefs/PR-14-channel-health-status-management.md
#   - AC-09: Rate limiting (5 req/min per endpoint)
#   - AC-13: IP-based throttling (global, not per-merchant)

set -e

# Parse arguments
API_BASE_URL="${1:-http://localhost:3000}"
SESSION_COOKIE="${2:-}"
CHANNEL_ID="${3:-}"

if [ -z "$SESSION_COOKIE" ] || [ -z "$CHANNEL_ID" ]; then
  echo "Usage: $0 <API_BASE_URL> <SESSION_COOKIE> <CHANNEL_ID>"
  echo ""
  echo "Example:"
  echo "  $0 https://staging-api.closy.io session_id=abc123 ch_xyz789"
  exit 1
fi

ENDPOINT="${API_BASE_URL}/channels/${CHANNEL_ID}/retry-webhook"

echo "====================================================================="
echo "Rate Limit Verification (AC-09) - PR-14"
echo "====================================================================="
echo "Endpoint: ${ENDPOINT}"
echo "Cookie:   ${SESSION_COOKIE}"
echo ""
echo "Sending 6 requests (limit: 5 req/min)..."
echo "Expected: 1-5 → 200 OK, 6 → 429 Too Many Requests"
echo "====================================================================="
echo ""

SUCCESS_COUNT=0
RATE_LIMITED=false

for i in {1..6}; do
  echo -n "Request $i: "
  
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${ENDPOINT}" \
    -H "Cookie: ${SESSION_COOKIE}" \
    -H "Content-Type: application/json" \
    -w "%{http_code}")
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ 200 OK"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  elif [ "$HTTP_CODE" = "429" ]; then
    echo "🚫 429 Too Many Requests (RATE LIMITED)"
    RATE_LIMITED=true
  else
    echo "⚠️  Unexpected: $HTTP_CODE"
  fi
  
  # Small delay between requests (50ms)
  sleep 0.05
done

echo ""
echo "====================================================================="
echo "RESULTS"
echo "====================================================================="
echo "Successful requests (200): $SUCCESS_COUNT"
echo "Rate limited (429):        $RATE_LIMITED"
echo ""

if [ "$SUCCESS_COUNT" -eq 5 ] && [ "$RATE_LIMITED" = true ]; then
  echo "✅ PASS: Rate limiting is working correctly"
  echo "   - First 5 requests: 200 OK"
  echo "   - 6th request: 429 Too Many Requests"
  exit 0
else
  echo "❌ FAIL: Rate limiting is NOT working as expected"
  echo "   Expected: 5 successful, then 429"
  echo "   Actual:   $SUCCESS_COUNT successful, rate_limited=$RATE_LIMITED"
  exit 1
fi
