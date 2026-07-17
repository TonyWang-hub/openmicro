#!/usr/bin/env bash
# Fire-and-forget hook forwarder. Runs on EVERY Claude Code / Codex hook event,
# so it MUST NEVER affect the host agent: always exits 0, never blocks, swallows
# all output. Host down / missing jq|curl / bad input → silently do nothing.
#
# Reads the full hook JSON from stdin (Claude Code passes session_id, cwd,
# hook_event_name, notification_type, …). session_id becomes the sessionKey so
# the Host can auto-assign a slot per live session; cwd's basename is the label.
# When running inside tmux, the current session name is reported as tmuxTarget
# so the Host can inject approval keystrokes back into that pane.
#
# Env: CMS_HOOK_AGENT (claude-code|codex, default claude-code), CMS_PORT (7788),
#      CMS_HOOK_CHANNEL (hooks). CMS_SESSION_KEY is only a fallback when stdin
#      carries no session_id.
PORT="${CMS_PORT:-7788}"
AGENT="${CMS_HOOK_AGENT:-claude-code}"
CHANNEL="${CMS_HOOK_CHANNEL:-hooks}"

command -v jq >/dev/null 2>&1 || exit 0
command -v curl >/dev/null 2>&1 || exit 0

STDIN_JSON="$(cat 2>/dev/null || true)"
# Fall back to a minimal object if stdin was empty or not JSON.
echo "$STDIN_JSON" | jq empty >/dev/null 2>&1 || STDIN_JSON='{}'

SESSION_KEY="$(echo "$STDIN_JSON" | jq -r '.session_id // empty' 2>/dev/null)"
[ -z "$SESSION_KEY" ] && SESSION_KEY="${CMS_SESSION_KEY:-unknown-$$}"

CWD="$(echo "$STDIN_JSON" | jq -r '.cwd // empty' 2>/dev/null)"
LABEL="?"
[ -n "$CWD" ] && LABEL="$(basename "$CWD")"

TMUX_TARGET=""
if [ -n "${TMUX:-}" ]; then
  TMUX_TARGET="$(tmux display-message -p '#S' 2>/dev/null || true)"
fi

# cmux (GUI multiplexer): the agent process inherits $CMUX_PANEL_ID, which IS
# the surface UUID cmux `send-key --surface` targets. Report it so the Host can
# inject into exactly this session's surface (and no other).
CMUX_TARGET="${CMUX_PANEL_ID:-}"

# tmuxTarget: empty string → JSON null. Do NOT use `select(.!="")` here — an
# `empty` in a jq object value makes the WHOLE object evaluate to empty, so the
# body would silently become "" and the POST would 400. `if/then/else` keeps
# the key present with a null value.
# STDIN_JSON is guaranteed valid JSON by the `jq empty` guard above (falls back
# to '{}'). Pass it directly — do NOT write "${STDIN_JSON:-{}}": the `{}` default
# inside ${...} confuses bash brace-matching and appends a stray '}', producing
# invalid JSON and a silently-empty body.
BODY="$(jq -n \
  --arg a "$AGENT" --arg c "$CHANNEL" --arg s "$SESSION_KEY" \
  --arg l "$LABEL" --arg t "$TMUX_TARGET" --arg x "$CMUX_TARGET" --argjson p "$STDIN_JSON" \
  '{agent:$a, channel:$c, sessionKey:$s, label:$l, tmuxTarget:($t | if . == "" then null else . end), cmuxTarget:($x | if . == "" then null else . end), payload:$p}' \
  2>/dev/null)" || exit 0

# Synchronous, but bounded and error-swallowing. Backgrounding (`&`+disown) was
# tried and dropped: in the hook execution context the detached curl is reaped
# on script exit before it can send, so the event never lands. The Host is
# always localhost (~5ms), --max-time 3 bounds a wedged Host, and a Host-down
# connection refusal returns instantly — so a foreground POST never meaningfully
# delays the agent, while guaranteeing delivery. All output swallowed; exit 0.
curl -s --noproxy '*' --max-time 3 -X POST "http://127.0.0.1:${PORT}/ingest/hook" \
  -H 'content-type: application/json' -d "$BODY" >/dev/null 2>&1 || true

exit 0
