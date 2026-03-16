#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="${PROD_SERVER_HOST:-root@voxdrop.live}"
REMOTE_PATH="${PROD_REPO_PATH:-/opt/voxdrop}"
OUTPUT_DIR="${REPO_ROOT}/deploy/releases/runtime/production-state"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"

mkdir -p "$OUTPUT_DIR"

ssh "$SERVER" "cd '$REMOTE_PATH' && printf 'timestamp=%s\nhead=%s\nbranch=%s\nremote=%s\n' '$TIMESTAMP' \"\$(git rev-parse HEAD)\" \"\$(git branch --show-current)\" \"\$(git remote get-url origin)\"" \
  > "$OUTPUT_DIR/${TIMESTAMP}.env"
ssh "$SERVER" "cd '$REMOTE_PATH' && git status --short" \
  > "$OUTPUT_DIR/${TIMESTAMP}.status.txt"
ssh "$SERVER" "cd '$REMOTE_PATH' && git diff --stat" \
  > "$OUTPUT_DIR/${TIMESTAMP}.diffstat.txt"

echo "Captured production state under $OUTPUT_DIR"
