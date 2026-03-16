#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_release_manifest() {
  local target_env="$1"
  local preferred_manifest="$REPO_ROOT/deploy/releases/${target_env}.env"
  local example_manifest="$REPO_ROOT/deploy/releases/${target_env}.env.example"

  if [ -f "$preferred_manifest" ]; then
    RELEASE_MANIFEST="$preferred_manifest"
  elif [ -f "$example_manifest" ]; then
    RELEASE_MANIFEST="$example_manifest"
  else
    echo "No release manifest found for ${target_env}. Expected ${preferred_manifest} or ${example_manifest}." >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$RELEASE_MANIFEST"
  set +a

  : "${RELEASE_NAME:?RELEASE_NAME is required in ${RELEASE_MANIFEST}}"
  : "${RELEASE_REF:?RELEASE_REF is required in ${RELEASE_MANIFEST}}"

  RELEASE_REMOTE_NAME="${RELEASE_REMOTE_NAME:-origin}"
  RELEASE_HEALTH_URL="${RELEASE_HEALTH_URL:-}"
  RELEASE_PROMPTFOO_BASE_URL="${RELEASE_PROMPTFOO_BASE_URL:-}"
  EXPECTED_REMOTE="${EXPECTED_REMOTE:-}"
}

ensure_expected_remote() {
  if [ -z "${EXPECTED_REMOTE:-}" ]; then
    return 0
  fi

  local current_remote matched=0 allowed_remote
  current_remote="$(git remote get-url "${RELEASE_REMOTE_NAME}")"
  IFS=',' read -r -a allowed_remotes <<< "$EXPECTED_REMOTE"

  for allowed_remote in "${allowed_remotes[@]}"; do
    if [ "$current_remote" = "$allowed_remote" ]; then
      matched=1
      break
    fi
  done

  if [ "$matched" -ne 1 ]; then
    echo "Unexpected git remote for ${RELEASE_REMOTE_NAME}: $current_remote" >&2
    echo "Expected one of: $EXPECTED_REMOTE" >&2
    exit 1
  fi
}

ensure_clean_git_checkout() {
  local status
  status="$(git status --porcelain --untracked-files=all)"
  if [ -n "$status" ]; then
    echo "Refusing to continue from a dirty checkout." >&2
    echo "$status" >&2
    exit 1
  fi
}

fetch_release_ref() {
  git fetch --tags --prune "${RELEASE_REMOTE_NAME}"
}

checkout_release_ref() {
  local resolved_commit current_head
  resolved_commit="$(git rev-parse "${RELEASE_REF}^{commit}")"
  current_head="$(git rev-parse HEAD)"
  export PREVIOUS_HEAD="$current_head"

  if [ "$current_head" = "$resolved_commit" ]; then
    echo "Release ref already checked out: $resolved_commit"
    return 0
  fi

  git checkout --detach "$resolved_commit"
}

run_default_release_gates() {
  local mode="${RUN_RELEASE_GATES:-auto}"

  if [ "$mode" = "false" ]; then
    echo "Skipping release gates because RUN_RELEASE_GATES=false."
    return 0
  fi

  if ! command -v npm >/dev/null 2>&1 || [ ! -d "$REPO_ROOT/node_modules" ]; then
    if [ "$mode" = "true" ]; then
      echo "RUN_RELEASE_GATES=true but npm/node_modules are not available." >&2
      exit 1
    fi
    echo "Skipping release gates because npm/node_modules are not available on this machine."
    return 0
  fi

  if ! host_can_run_release_gates; then
    if [ "$mode" = "true" ]; then
      echo "RUN_RELEASE_GATES=true but the local node_modules are not runnable on this host." >&2
      exit 1
    fi
    echo "Skipping release gates because the local node_modules are not runnable on this host."
    return 0
  fi

  npm run release:verify
}

host_can_run_release_gates() {
  local bin
  for bin in tsc esbuild tsx; do
    if [ ! -x "$REPO_ROOT/node_modules/.bin/$bin" ]; then
      return 1
    fi
  done

  "$REPO_ROOT/node_modules/.bin/tsc" --version >/dev/null 2>&1 &&
    "$REPO_ROOT/node_modules/.bin/esbuild" --version >/dev/null 2>&1 &&
    "$REPO_ROOT/node_modules/.bin/tsx" --version >/dev/null 2>&1
}

wait_for_http_ok() {
  local health_url="$1"
  local max_attempts="${2:-20}"
  local sleep_seconds="${3:-3}"
  local attempt=1

  while true; do
    if curl -fsS "$health_url" >/dev/null; then
      echo "Health check OK: $health_url"
      return 0
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      echo "Health check failed after ${max_attempts} attempts: $health_url" >&2
      return 1
    fi

    echo "Health check failed (${attempt}/${max_attempts}), retrying..."
    attempt=$((attempt + 1))
    sleep "$sleep_seconds"
  done
}

append_release_log() {
  local target_env="$1"
  local health_url="$2"
  local runtime_dir="$REPO_ROOT/deploy/releases/runtime"
  local log_path="$runtime_dir/${target_env}-history.log"
  local timestamp

  mkdir -p "$runtime_dir"
  timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  printf '%s env=%s release_name=%s release_ref=%s previous_head=%s manifest=%s health_url=%s\n' \
    "$timestamp" \
    "$target_env" \
    "$RELEASE_NAME" \
    "$RELEASE_REF" \
    "${PREVIOUS_HEAD:-unknown}" \
    "$RELEASE_MANIFEST" \
    "$health_url" >> "$log_path"
}
