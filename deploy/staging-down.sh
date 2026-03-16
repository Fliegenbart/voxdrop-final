#!/bin/bash
set -e

# VoxDrop staging teardown helper

cd "$(dirname "$0")/.."

echo "=== VoxDrop Staging Down ==="

# Must match staging-up (used by compose port interpolation)
export VOXDROP_BIND_IP=${VOXDROP_BIND_IP:-127.0.0.1}
export VOXDROP_HTTP_PORT=${VOXDROP_HTTP_PORT:-5001}

COMPOSE_FILES=(
  -f docker-compose.yml
  -f docker-compose.prod.yml
)

# Must match staging-up.
STAGING_EXTRAS=${STAGING_EXTRAS:-false}
if [ "$STAGING_EXTRAS" = "true" ]; then
  COMPOSE_FILES+=( -f docker-compose.pdfua.yml -f docker-compose.pptx.yml )
fi

COMPOSE_FILES+=( -f docker-compose.staging.yml )
if [ "$STAGING_EXTRAS" = "true" ]; then
  COMPOSE_FILES+=( -f docker-compose.staging.extras.yml )
fi

# Must match staging-up (so compose sees the same service definitions).
FORCE_CPU=${FORCE_CPU:-true}
if [ "$FORCE_CPU" = "true" ]; then
  COMPOSE_FILES+=( -f docker-compose.nogpu.yml )
fi

docker compose "${COMPOSE_FILES[@]}" down
