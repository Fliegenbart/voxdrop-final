#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== VoxDrop Runtime Status ==="
echo "Repo: $REPO_ROOT"
echo "HEAD: $(git rev-parse HEAD)"
echo "Branch: $(git branch --show-current || true)"
echo "Remote: $(git remote get-url origin)"
echo ""
echo "Git status:"
git status --short

if command -v docker >/dev/null 2>&1; then
  echo ""
  echo "Docker compose services:"
  docker compose -f docker-compose.prod.yml ps || true
fi

if [ -n "${HEALTH_URL:-}" ]; then
  echo ""
  echo "Health:"
  curl -fsS "$HEALTH_URL"
  echo ""
fi
