#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-${PROMPTFOO_BASE_URL:-http://127.0.0.1:5001}}"
EMAIL="${SMOKE_TEST_EMAIL:-${PROMPTFOO_TEST_EMAIL:-test@voxdrop.live}}"
PASSWORD="${SMOKE_TEST_PASSWORD:-${PROMPTFOO_TEST_PASSWORD:-VoxDrop2026!Test}}"
COOKIE_JAR="$(mktemp "${TMPDIR:-/tmp}/voxdrop-login-cookie.XXXXXX")"
BODY_FILE="$(mktemp "${TMPDIR:-/tmp}/voxdrop-login-body.XXXXXX")"

cleanup() {
  rm -f "$COOKIE_JAR" "$BODY_FILE"
}
trap cleanup EXIT

STATUS="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
  -c "$COOKIE_JAR" \
  -H 'content-type: application/json' \
  -X POST \
  --data "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  "${BASE_URL%/}/api/auth/login")"

if [ "$STATUS" != "200" ]; then
  echo "Login smoke failed with HTTP $STATUS" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

python3 - "$BODY_FILE" "$EMAIL" <<'PY'
import json
import sys

body_path = sys.argv[1]
expected_email = sys.argv[2].lower()
with open(body_path, 'r', encoding='utf-8') as handle:
    payload = json.load(handle)

user_email = str(payload.get('user', {}).get('email', '')).lower()
if user_email != expected_email:
    raise SystemExit(f"Login smoke response did not contain expected user email: {user_email!r}")
PY

echo "Login smoke passed for $EMAIL against $BASE_URL"
