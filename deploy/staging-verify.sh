#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PROMPTFOO_BASE_URL:-http://127.0.0.1:5001}"
HEALTH_URL="${HEALTH_URL:-${BASE_URL%/}/api/health}"

echo "=== VoxDrop Staging Verify ==="
echo "Base URL: $BASE_URL"

curl -fsS "$HEALTH_URL" >/dev/null
bash scripts/login-smoke.sh
PROMPTFOO_BASE_URL="$BASE_URL" \
PROMPTFOO_SERVER_CONTAINER="${PROMPTFOO_SERVER_CONTAINER:-voxdrop-staging-web}" \
  bash scripts/run-promptfoo-container-security-smokes.sh

echo "Staging verification complete."
