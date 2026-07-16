/**
 * @typedef {import('../types.js').AgentLightEvent} AgentLightEvent
 * @typedef {import('../types.js').LightState} LightState
 */

/**
 * @typedef {object} SlotBinding
 * @property {number} slotId
 * @property {'claude-code'|'codex'} agent
 * @property {string} sessionKey
 */

/**
 * @typedef {object} CodexHookRaw
 * @property {string} hookEventName
 * @property {string} [notificationType]
 */

/**
 * @typedef {object} CodexLegacyNotifyRaw
 * @property {string} type
 */

/**
 * @typedef {object} CodexAppServerStatusRaw
 * @property {'running'|'awaiting_approval'|'succeeded'|'failed'|'cancelled'|string} state
 */

/** @type {Record<string, LightState>} */
const HOOK_STATE = {
  SessionStart: 'idle',
  SessionEnd: 'idle',
  UserPromptSubmit: 'thinking',
  PreToolUse: 'thinking',
  PermissionRequest: 'needs_input',
  Stop: 'complete',
  StopFailure: 'error',
};

/** @type {Record<string, LightState>} */
const APP_SERVER_STATE = {
  running: 'thinking',
  awaiting_approval: 'needs_input',
  succeeded: 'complete',
  failed: 'error',
  cancelled: 'error',
};

/**
 * @param {string | undefined} notificationType
 * @returns {LightState | null}
 */
function mapNotificationType(notificationType) {
  if (!notificationType) return null;
  if (
    notificationType === 'permission_prompt'
    || notificationType === 'agent_needs_input'
    || notificationType.startsWith('elicitation_')
  ) {
    return 'needs_input';
  }
  if (notificationType === 'agent_completed') return 'complete';
  return null;
}

/**
 * @param {SlotBinding} binding
 * @param {LightState} state
 * @param {'codex-hooks'|'codex-notify-legacy'|'codex-app-server'} source
 * @returns {AgentLightEvent}
 */
function toLightEvent(binding, state, source) {
  return {
    v: 1,
    slotId: binding.slotId,
    agent: binding.agent,
    sessionKey: binding.sessionKey,
    state,
    ts: new Date().toISOString(),
    source,
  };
}

/**
 * @param {CodexHookRaw} raw
 * @param {SlotBinding} binding
 * @returns {AgentLightEvent | null}
 */
export function mapCodexHook(raw, binding) {
  const { hookEventName, notificationType } = raw;

  if (hookEventName === 'Notification') {
    const state = mapNotificationType(notificationType);
    return state ? toLightEvent(binding, state, 'codex-hooks') : null;
  }

  const state = HOOK_STATE[hookEventName];
  return state ? toLightEvent(binding, state, 'codex-hooks') : null;
}

/**
 * @param {CodexLegacyNotifyRaw} raw
 * @param {SlotBinding} binding
 * @returns {AgentLightEvent | null}
 */
export function mapCodexLegacyNotify(raw, binding) {
  if (raw.type !== 'agent-turn-complete') return null;
  return toLightEvent(binding, 'complete', 'codex-notify-legacy');
}

/**
 * @param {CodexAppServerStatusRaw} raw
 * @param {SlotBinding} binding
 * @returns {AgentLightEvent | null}
 */
export function mapCodexAppServerStatus(raw, binding) {
  const state = APP_SERVER_STATE[raw.state];
  return state ? toLightEvent(binding, state, 'codex-app-server') : null;
}
