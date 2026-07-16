/**
 * @typedef {import('../types.js').AgentLightEvent} AgentLightEvent
 * @typedef {import('../types.js').LightState} LightState
 * @typedef {import('../types.js').EventSource} EventSource
 */

/**
 * @typedef {object} SlotBinding
 * @property {number} slotId
 * @property {'claude-code'|'codex'} agent
 * @property {string} sessionKey
 */

/**
 * @typedef {object} ClaudeHookRaw
 * @property {string} hookEventName
 * @property {string} [notificationType]
 */

/** @type {Record<string, LightState>} */
const HOOK_STATE = {
  SessionStart: 'idle',
  SessionEnd: 'idle',
  UserPromptSubmit: 'thinking',
  PreToolUse: 'thinking',
  Stop: 'complete',
  StopFailure: 'error',
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
 * @returns {AgentLightEvent}
 */
function toLightEvent(binding, state) {
  return {
    v: 1,
    slotId: binding.slotId,
    agent: binding.agent,
    sessionKey: binding.sessionKey,
    state,
    ts: new Date().toISOString(),
    source: 'cc-hooks',
  };
}

/**
 * @param {ClaudeHookRaw} raw
 * @param {SlotBinding} binding
 * @returns {AgentLightEvent | null}
 */
export function mapClaudeHook(raw, binding) {
  const { hookEventName, notificationType } = raw;

  if (hookEventName === 'Notification') {
    const state = mapNotificationType(notificationType);
    return state ? toLightEvent(binding, state) : null;
  }

  const state = HOOK_STATE[hookEventName];
  return state ? toLightEvent(binding, state) : null;
}
