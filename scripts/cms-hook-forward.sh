#!/usr/bin/env bash
set -euo pipefail
PORT="${CMS_PORT:-7788}"
AGENT="${CMS_HOOK_AGENT:?}"
CHANNEL="${CMS_HOOK_CHANNEL:-hooks}"
SESSION_KEY="${CMS_SESSION_KEY:?}"
PAYLOAD="${1:-$(cat)}"
# --noproxy: the Host is always on 127.0.0.1; a global HTTP(S) proxy would
# otherwise hijack the loopback POST and the event never lands (empty reply).
# --max-time: a hook must never hang the agent if the Host is down.
curl -sS --noproxy '*' --max-time 3 -X POST "http://127.0.0.1:${PORT}/ingest/hook" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg a "$AGENT" --arg c "$CHANNEL" --arg s "$SESSION_KEY" --argjson p "$PAYLOAD" \
    '{agent:$a, channel:$c, sessionKey:$s, payload:$p}')"
