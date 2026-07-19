/** @typedef {'idle'|'thinking'|'complete'|'needs_input'|'error'|'unknown'} LightState */

const MAX_SLOTS = 6;
const LIGHT_STATES = Object.freeze([
  'idle',
  'thinking',
  'complete',
  'needs_input',
  'error',
  'unknown',
]);

/**
 * @param {string} state
 * @returns {LightState}
 */
function normalizeState(state) {
  return LIGHT_STATES.includes(/** @type {LightState} */ (state))
    ? /** @type {LightState} */ (state)
    : 'unknown';
}

/**
 * Left-panel jelly keyboard. Lights ONLY from WS `state` messages.
 *
 * @param {{
 *   root: HTMLElement,
 *   sendCommand: (action: 'accept'|'reject'|'new_session'|'focus', slotId: number) => void,
 *   getFocusedSlotId: () => number | null,
 * }} opts
 */
export function createKeyboard({ root, sendCommand, getFocusedSlotId }) {
  /** @type {Map<number, LightState>} */
  const lights = new Map();
  for (let i = 0; i < MAX_SLOTS; i++) lights.set(i, 'unknown');

  root.innerHTML = `
    <div class="kbd-wrap">
      <div class="jelly">
        <div class="plate">
          <div class="screw tl"></div><div class="screw tr"></div>
          <div class="screw bl"></div><div class="screw br"></div>
          <div class="etch left">WORK LOUDER | OPENAI 2026</div>
          <div class="etch right">YOU CAN JUST BUILD THINGS</div>
          <div class="legend">
            <span><i class="l-idle"></i>idle</span>
            <span><i class="l-thinking"></i>thinking</span>
            <span><i class="l-complete"></i>complete</span>
            <span><i class="l-needs_input"></i>needs input</span>
            <span><i class="l-error"></i>error</span>
            <span><i class="l-unknown"></i>unknown</span>
          </div>
          <div class="grid">
            <div class="knob-wrap"><div class="knob"></div><div class="dialv">REASONING · MED</div></div>
            ${agentKeyHtml(0)}
            ${agentKeyHtml(1)}
            <div class="joy" aria-hidden="true"><div class="cap"></div></div>
            ${agentKeyHtml(2)}
            ${agentKeyHtml(3)}
            ${agentKeyHtml(4)}
            ${agentKeyHtml(5)}
            <button type="button" class="key cmd" disabled title="MVP: disabled"><span class="top">⚡</span></button>
            <button type="button" class="key cmd" data-action="accept" title="Accept"><span class="top">◎✓</span></button>
            <button type="button" class="key cmd" data-action="reject" title="Reject"><span class="top">⊗</span></button>
            <button type="button" class="key cmd" disabled title="MVP: disabled"><span class="top">⤴</span></button>
            <div class="io" aria-hidden="true"><div class="leds"><i></i><i></i><i></i></div><div class="touch"></div></div>
            <button type="button" class="key cmd mic" disabled title="MVP: disabled"><span class="top">🎙</span></button>
            <button type="button" class="key cmd" data-action="new_session" title="New session"><span class="top">💭</span></button>
          </div>
          <div class="lcd" id="kbdLcd"><span class="t">--:--:--</span><span class="m">waiting for host…</span></div>
        </div>
      </div>
    </div>
  `;

  const lcd = /** @type {HTMLElement} */ (root.querySelector('#kbdLcd'));

  /**
   * @param {string} message
   */
  function setLcd(message) {
    const d = new Date();
    const t = [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
    lcd.innerHTML = `<span class="t">${t}</span><span class="m">${escapeHtml(message)}</span>`;
  }

  function paintLights() {
    const focused = getFocusedSlotId();
    for (let slotId = 0; slotId < MAX_SLOTS; slotId++) {
      const state = lights.get(slotId) || 'unknown';
      const el = root.querySelector(`.key.agent[data-slot="${slotId}"]`);
      if (!el) continue;
      el.className = `key agent a-${state}${focused === slotId ? ' focused' : ''}`;
    }
  }

  root.addEventListener('click', (ev) => {
    const target = /** @type {HTMLElement | null} */ (
      ev.target instanceof Element ? ev.target.closest('[data-slot],[data-action]') : null
    );
    if (!target || target instanceof HTMLButtonElement && target.disabled) return;

    if (target.dataset.slot != null) {
      const slotId = Number(target.dataset.slot);
      if (!Number.isInteger(slotId) || slotId < 0 || slotId >= MAX_SLOTS) return;
      sendCommand('focus', slotId);
      setLcd(`focus → slot ${slotId}`);
      return;
    }

    const action = target.dataset.action;
    if (action === 'accept' || action === 'reject' || action === 'new_session') {
      const slotId = getFocusedSlotId();
      if (slotId == null) {
        setLcd(`${action} needs a focused agent`);
        return;
      }
      sendCommand(action, slotId);
      setLcd(`${action} → slot ${slotId}`);
    }
  });

  return {
    /**
     * Apply lights from a WS `state` payload only. Never call with terminal text.
     * @param {{ slots?: Array<{ slotId: number, state?: string }>, focusedSlotId?: number | null }} msg
     */
    applyState(msg) {
      for (const slot of msg.slots || []) {
        if (!Number.isInteger(slot.slotId)) continue;
        if (slot.slotId < 0 || slot.slotId >= MAX_SLOTS) continue;
        lights.set(slot.slotId, normalizeState(slot.state || 'unknown'));
      }
      // Unmentioned slots keep last known light (host may only send bound slots).
      paintLights();
      if (msg.focusedSlotId != null) {
        const s = lights.get(msg.focusedSlotId) || 'unknown';
        setLcd(`slot ${msg.focusedSlotId} · ${s}`);
      }
    },
    setLcd,
    paintLights,
  };
}

/**
 * @param {number} slotId
 */
function agentKeyHtml(slotId) {
  return `<button type="button" class="key agent a-unknown" data-slot="${slotId}" title="Agent ${slotId}"><span class="top"><span class="sw"></span></span></button>`;
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
