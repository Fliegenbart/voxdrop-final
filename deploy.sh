#!/bin/bash
# VoxDrop Deployment Script
# Ensures all compose files are used together with the correct network

set -e

# Create network if it doesn't exist
docker network create voxdrop-network 2>/dev/null || true

# Port binding defaults (used by compose port interpolation)
export VOXDROP_BIND_IP=${VOXDROP_BIND_IP:-127.0.0.1}
export VOXDROP_HTTP_PORT=${VOXDROP_HTTP_PORT:-5000}

# Build compose file list with GPU auto-detection.
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

docker compose "${COMPOSE_FILES[@]}" "$@"
