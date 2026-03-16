#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$REPO_ROOT"
load_release_manifest staging
ensure_expected_remote
ensure_clean_git_checkout
fetch_release_ref
checkout_release_ref
run_default_release_gates

echo "=== VoxDrop Staging Up ==="
echo "Release name: ${RELEASE_NAME}"
echo "Release ref: ${RELEASE_REF}"

# Default bind for staging (used by compose port interpolation)
export VOXDROP_BIND_IP=${VOXDROP_BIND_IP:-127.0.0.1}
export VOXDROP_HTTP_PORT=${VOXDROP_HTTP_PORT:-5001}

COMPOSE_FILES=(
  -f docker-compose.yml
  -f docker-compose.prod.yml
)

# Optional extras (PDFUA + PPTX). Defaults to off because PDFUA is heavyweight.
STAGING_EXTRAS=${STAGING_EXTRAS:-false}
if [ "$STAGING_EXTRAS" = "true" ]; then
  echo "STAGING_EXTRAS=true; enabling PDFUA + PPTX services."
  COMPOSE_FILES+=( -f docker-compose.pdfua.yml -f docker-compose.pptx.yml )
fi

# Staging overrides must come last (they override networking/volumes/container names).
COMPOSE_FILES+=( -f docker-compose.staging.yml )
if [ "$STAGING_EXTRAS" = "true" ]; then
  COMPOSE_FILES+=( -f docker-compose.staging.extras.yml )
fi

# Default to CPU mode in staging to reduce contention with prod.
FORCE_CPU=${FORCE_CPU:-true}
if [ "$FORCE_CPU" = "true" ]; then
  echo "FORCE_CPU=true; adding no-GPU overrides."
  COMPOSE_FILES+=( -f docker-compose.nogpu.yml )
fi

echo "Building containers..."
docker compose "${COMPOSE_FILES[@]}" build

echo "Starting staging services..."
docker compose "${COMPOSE_FILES[@]}" up -d

echo "Health check..."
HEALTH_URL=${HEALTH_URL:-${RELEASE_HEALTH_URL:-http://127.0.0.1:${VOXDROP_HTTP_PORT}/api/health}}
wait_for_http_ok "$HEALTH_URL" 30 3

if [ "${RUN_STAGING_VERIFY:-true}" = "true" ]; then
  PROMPTFOO_BASE_URL="${PROMPTFOO_BASE_URL:-${RELEASE_PROMPTFOO_BASE_URL:-http://127.0.0.1:${VOXDROP_HTTP_PORT}}}" \
    PROMPTFOO_SERVER_CONTAINER="${PROMPTFOO_SERVER_CONTAINER:-voxdrop-staging-web}" \
    bash deploy/staging-verify.sh
fi

append_release_log staging "$HEALTH_URL"

echo ""
echo "Staging is up."
echo "If the port is bound to localhost, use an SSH tunnel:"
echo "  ssh -L ${VOXDROP_HTTP_PORT}:127.0.0.1:${VOXDROP_HTTP_PORT} root@<server-ip>"
