/** @typedef {'idle'|'thinking'|'complete'|'needs_input'|'error'|'unknown'} LightState */
/** @typedef {'unbound'|'bound'|'detached'} SlotMeta */
/** @typedef {'claude-code'|'codex'} AgentKind */
/** @typedef {'cc-hooks'|'codex-hooks'|'codex-notify-legacy'|'codex-app-server'} EventSource */

export const LIGHT_STATES = Object.freeze([
  'idle', 'thinking', 'complete', 'needs_input', 'error', 'unknown',
]);

export const MAX_SLOTS = 6;
export const COMPLETE_HOLD_MS = 2000;
export const INGEST_STALE_MS = 30_000;

/**
 * @typedef {object} AgentLightEvent
 * @property {1} v
 * @property {number} slotId
 * @property {AgentKind} agent
 * @property {string} sessionKey
 * @property {LightState} state
 * @property {string} [reason]
 * @property {string} ts
 * @property {EventSource} source
 */

/**
 * @typedef {object} CommandRequest
 * @property {1} v
 * @property {number} slotId
 * @property {'accept'|'reject'|'new_session'|'focus'} action
 * @property {string} ts
 */
