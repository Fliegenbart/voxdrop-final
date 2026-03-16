#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$SCRIPT_DIR/lib.sh"

echo "=== VoxDrop Update ==="

cd "$REPO_ROOT"
load_release_manifest production
ensure_expected_remote
ensure_clean_git_checkout
fetch_release_ref
checkout_release_ref
run_default_release_gates

echo "Release name: ${RELEASE_NAME}"
echo "Release ref: ${RELEASE_REF}"
echo "Manifest: ${RELEASE_MANIFEST}"

# Port binding defaults (used by compose port interpolation)
export VOXDROP_BIND_IP=${VOXDROP_BIND_IP:-127.0.0.1}
export VOXDROP_HTTP_PORT=${VOXDROP_HTTP_PORT:-5000}

# Build compose file list with optional no-GPU overrides
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.pdfua.yml -f docker-compose.pptx.yml)
GPU_AVAILABLE=false
if [ "${FORCE_CPU:-}" = "true" ]; then
  GPU_AVAILABLE=false
else
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
    GPU_AVAILABLE=true
  fi
fi
if [ "$GPU_AVAILABLE" = "true" ]; then
  echo "GPU available; using GPU overrides."
  COMPOSE_FILES+=(-f docker-compose.gpu.yml)
else
  echo "GPU not available or FORCE_CPU=true; using no-GPU overrides."
  COMPOSE_FILES+=(-f docker-compose.nogpu.yml)
fi

# Full deployment command with all compose files:
# docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.pdfua.yml -f docker-compose.pptx.yml up -d

echo "Rebuilding containers..."
docker compose "${COMPOSE_FILES[@]}" build

echo "Restarting services..."
docker compose "${COMPOSE_FILES[@]}" up -d

echo "Restarting nginx (refresh upstream DNS)..."
if docker ps --format '{{.Names}}' | grep -q '^voxdrop-nginx-1$'; then
  docker restart voxdrop-nginx-1
else
  echo "nginx container not found, skipping"
fi

echo "Health check..."
HEALTH_URL=${HEALTH_URL:-${RELEASE_HEALTH_URL:-http://127.0.0.1:${VOXDROP_HTTP_PORT}/api/health}}
wait_for_http_ok "$HEALTH_URL" 20 3

if [ "${RUN_PRODUCTION_SMOKE:-true}" = "true" ]; then
  PROMPTFOO_BASE_URL="${PROMPTFOO_BASE_URL:-${RELEASE_PROMPTFOO_BASE_URL:-https://voxdrop.live}}" \
    PROMPTFOO_SERVER_CONTAINER="${PROMPTFOO_SERVER_CONTAINER:-}" \
    bash scripts/run-promptfoo-container-security-smokes.sh
fi

append_release_log production "$HEALTH_URL"

echo "Cleaning up old images..."
docker image prune -f

echo ""
echo "=== Update complete! ==="
echo "Release ref: ${RELEASE_REF}"
docker compose "${COMPOSE_FILES[@]}" ps
