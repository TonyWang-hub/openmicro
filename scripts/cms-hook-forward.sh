#!/usr/bin/env bash
# Fire-and-forget hook forwarder. This runs on EVERY Claude Code / Codex hook
# event, so it MUST NEVER affect the host agent: it always exits 0, never blocks,
# and swallows all output. If the CMS Host is down, missing jq/curl, or anything
# else fails, the agent must not see an error or a delay.
#
# Why each guard matters:
#   - no `set -e`: a failure (Host down → curl exit 7) must NOT propagate; a
#     non-zero exit from a PreToolUse hook prints red errors in the transcript
#     (or can block the tool). We always `exit 0`.
#   - background `&` + `disown`: the POST never adds latency to the agent turn.
#   - --noproxy: a global HTTP proxy would hijack the 127.0.0.1 POST.
#   - --max-time 3: bound the detached curl so it can't linger.
#   - all stdout/stderr → /dev/null: no noise in the agent transcript.
PORT="${CMS_PORT:-7788}"
AGENT="${CMS_HOOK_AGENT:-claude-code}"
CHANNEL="${CMS_HOOK_CHANNEL:-hooks}"
SESSION_KEY="${CMS_SESSION_KEY:-cms-claude-0}"
PAYLOAD="${1:-$(cat 2>/dev/null || true)}"

# Need jq + curl; if either is missing, silently do nothing.
if ! command -v jq >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
  exit 0
fi

BODY="$(jq -n --arg a "$AGENT" --arg c "$CHANNEL" --arg s "$SESSION_KEY" --argjson p "${PAYLOAD:-null}" \
  '{agent:$a, channel:$c, sessionKey:$s, payload:$p}' 2>/dev/null)" || exit 0

(
  curl -s --noproxy '*' --max-time 3 -X POST "http://127.0.0.1:${PORT}/ingest/hook" \
    -H 'content-type: application/json' -d "$BODY" >/dev/null 2>&1
) &
disown 2>/dev/null || true

exit 0
