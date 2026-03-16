#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${PROMPTFOO_BASE_URL:-https://voxdrop.live}"
TMP_TAR="$(mktemp "${TMPDIR:-/tmp}/voxdrop-promptfoo.XXXXXX.tar")"
export COPYFILE_DISABLE=1

resolve_container() {
  if [ -n "${PROMPTFOO_SERVER_CONTAINER:-}" ]; then
    printf '%s\n' "$PROMPTFOO_SERVER_CONTAINER"
    return 0
  fi

  local detected
  detected="$(docker ps --format '{{.Names}}' | grep -E '^voxdrop-web(-[0-9]+)?$' | head -n 1 || true)"
  if [ -z "$detected" ]; then
    echo "Unable to locate a running VoxDrop web container for promptfoo smokes." >&2
    return 1
  fi

  printf '%s\n' "$detected"
}

CONTAINER="$(resolve_container)"

cleanup() {
  rm -f "$TMP_TAR"
}
trap cleanup EXIT

tar -C "$REPO_ROOT" -cf "$TMP_TAR" \
  scripts/promptfoo-security-provider.mjs \
  promptfooconfig.security.chat.yaml \
  promptfooconfig.security.commands.yaml \
  promptfooconfig.security.simplify.yaml

docker exec "$CONTAINER" sh -lc 'rm -rf /tmp/voxdrop-promptfoo-run && mkdir -p /tmp/voxdrop-promptfoo-run'
docker exec -i "$CONTAINER" sh -lc 'cd /tmp/voxdrop-promptfoo-run && tar -xf -' < "$TMP_TAR"

CONFIGS=(
  "promptfooconfig.security.chat.yaml"
  "promptfooconfig.security.commands.yaml"
  "promptfooconfig.security.simplify.yaml"
)

for config in "${CONFIGS[@]}"; do
  echo "==> Running $config in $CONTAINER"
  docker exec \
    -e PROMPTFOO_BASE_URL="$BASE_URL" \
    -e PROMPTFOO_TEST_EMAIL="${PROMPTFOO_TEST_EMAIL:-test@voxdrop.live}" \
    -e PROMPTFOO_TEST_PASSWORD="${PROMPTFOO_TEST_PASSWORD:-VoxDrop2026!Test}" \
    "$CONTAINER" \
    sh -lc "cd /tmp/voxdrop-promptfoo-run && npx -y promptfoo validate config -c $config && npx -y promptfoo eval -c $config --no-share --max-concurrency 1"
done
