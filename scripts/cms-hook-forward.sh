#!/usr/bin/env bash
set -euo pipefail
PORT="${CMS_PORT:-7788}"
AGENT="${CMS_HOOK_AGENT:?}"
CHANNEL="${CMS_HOOK_CHANNEL:-hooks}"
SESSION_KEY="${CMS_SESSION_KEY:?}"
PAYLOAD="${1:-$(cat)}"
curl -sS -X POST "http://127.0.0.1:${PORT}/ingest/hook" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg a "$AGENT" --arg c "$CHANNEL" --arg s "$SESSION_KEY" --argjson p "$PAYLOAD" \
    '{agent:$a, channel:$c, sessionKey:$s, payload:$p}')"
