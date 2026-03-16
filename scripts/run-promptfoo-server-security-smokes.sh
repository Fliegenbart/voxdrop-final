#!/usr/bin/env bash
set -euo pipefail

SERVER="${PROMPTFOO_SERVER_HOST:-root@voxdrop.live}"
REMOTE_PATH="${PROMPTFOO_SERVER_REPO_PATH:-/opt/voxdrop}"
BASE_URL="${PROMPTFOO_BASE_URL:-https://voxdrop.live}"
CONTAINER="${PROMPTFOO_SERVER_CONTAINER:-}"

ssh "$SERVER" "cd '$REMOTE_PATH' && PROMPTFOO_BASE_URL='$BASE_URL' PROMPTFOO_SERVER_CONTAINER='$CONTAINER' PROMPTFOO_TEST_EMAIL='${PROMPTFOO_TEST_EMAIL:-test@voxdrop.live}' PROMPTFOO_TEST_PASSWORD='${PROMPTFOO_TEST_PASSWORD:-VoxDrop2026!Test}' bash scripts/run-promptfoo-container-security-smokes.sh"
