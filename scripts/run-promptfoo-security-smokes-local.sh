#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${PROMPTFOO_BASE_URL:-http://127.0.0.1:5001}"

cd "$REPO_ROOT"

CONFIGS=(
  "promptfooconfig.security.chat.yaml"
  "promptfooconfig.security.commands.yaml"
  "promptfooconfig.security.simplify.yaml"
)

for config in "${CONFIGS[@]}"; do
  echo "==> Running $config against $BASE_URL"
  PROMPTFOO_BASE_URL="$BASE_URL" npx -y promptfoo validate config -c "$config"
  PROMPTFOO_BASE_URL="$BASE_URL" npx -y promptfoo eval -c "$config" --no-share --max-concurrency 1
done
