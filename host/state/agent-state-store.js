/**
 * @typedef {import('../types.js').LightState} LightState
 * @typedef {import('../types.js').SlotMeta} SlotMeta
 * @typedef {import('../types.js').AgentLightEvent} AgentLightEvent
 */

/**
 * @typedef {object} SlotRecord
 * @property {number} slotId
 * @property {string} agent
 * @property {string} sessionKey
 * @property {LightState} state
 * @property {SlotMeta} meta
 * @property {number} lastEventAt
 * @property {number} [completeUntil]
 */

/**
 * @typedef {object} StoreOptions
 * @property {number} completeHoldMs
 * @property {number} ingestStaleMs
 * @property {() => number} [now]
 * @property {(snap: ReturnType<ReturnType<typeof createStore>['snapshot']>) => void} [onChange]
 * @property {(fn: () => void, ms: number) => unknown} [schedule]
 * @property {(id: unknown) => void} [clearSchedule]
 */

/**
 * @param {StoreOptions} options
 */
export function createStore({
  completeHoldMs,
  ingestStaleMs,
  maxSlots = 6,
  now = () => Date.now(),
  onChange,
  schedule = setTimeout,
  clearSchedule = clearTimeout,
}) {
  /** @type {Map<number, SlotRecord>} */
  const slots = new Map();
  /** @type {Map<number, unknown>} */
  const completeTimers = new Map();

  function emitChange() {
    onChange?.(snapshot());
  }

  function snapshot() {
    return [...slots.values()]
      .sort((a, b) => a.slotId - b.slotId)
      .map(({ slotId, agent, sessionKey, state, meta, lastEventAt, label, tmuxTarget, cmuxTarget }) => ({
        slotId,
        agent,
        sessionKey,
        state,
        meta,
        lastEventAt,
        label: label ?? null,
        tmuxTarget: tmuxTarget ?? null,
        cmuxTarget: cmuxTarget ?? null,
      }));
  }

  /**
   * @param {number} slotId
   */
  function clearCompleteTimer(slotId) {
    const handle = completeTimers.get(slotId);
    if (handle != null) {
      clearSchedule(handle);
      completeTimers.delete(slotId);
    }
  }

  /**
   * Precise complete→idle transition; 1s tick remains for stale heartbeat only.
   * @param {number} slotId
   * @param {number} completeUntil
   */
  function scheduleCompleteHold(slotId, completeUntil) {
    clearCompleteTimer(slotId);
    const delay = Math.max(0, completeUntil - now());
    const handle = schedule(() => {
      completeTimers.delete(slotId);
      tick();
    }, delay);
    // Avoid keeping the event loop alive in tests / idle Host.
    if (handle && typeof handle === 'object' && typeof handle.unref === 'function') {
      handle.unref();
    }
    completeTimers.set(slotId, handle);
  }

  function bindSlot({ slotId, agent, sessionKey }) {
    slots.set(slotId, {
      slotId,
      agent,
      sessionKey,
      state: 'unknown',
      meta: 'bound',
      lastEventAt: now(),
    });
    emitChange();
  }

  // States a slot can be in without an agent actively waiting — safe to recycle.
  const RECYCLABLE = new Set(['idle', 'complete', 'unknown']);

  /**
   * Map a live agent session (keyed by its session_id) to a slot, assigning a
   * free slot on first sight and recycling by LRU when all MAX_SLOTS are taken.
   * This is what lets a global hook install auto-track every running agent
   * without any per-project sessionKey wiring.
   * @param {{ sessionKey: string, agent: string, label?: string|null, tmuxTarget?: string|null, cmuxTarget?: string|null }} info
   * @returns {number} the assigned slotId
   */
  function resolveSession({ sessionKey, agent, label = null, tmuxTarget = null, cmuxTarget = null }) {
    for (const slot of slots.values()) {
      if (slot.sessionKey === sessionKey) {
        slot.lastEventAt = now();
        if (label != null) slot.label = label;
        if (tmuxTarget != null) slot.tmuxTarget = tmuxTarget;
        if (cmuxTarget != null) slot.cmuxTarget = cmuxTarget;
        if (agent) slot.agent = agent;
        return slot.slotId;
      }
    }

    // Find a free slot id in [0, MAX_SLOTS).
    let target = -1;
    for (let i = 0; i < maxSlots; i += 1) {
      if (!slots.has(i)) { target = i; break; }
    }

    // All taken → LRU-evict: prefer recyclable (idle/complete/unknown) oldest,
    // else the oldest overall. needs_input/thinking/error are protected unless
    // everything is active.
    if (target === -1) {
      const all = [...slots.values()];
      const recyclable = all.filter((s) => RECYCLABLE.has(s.state));
      const pool = recyclable.length > 0 ? recyclable : all;
      const victim = pool.reduce((a, b) => (a.lastEventAt <= b.lastEventAt ? a : b));
      target = victim.slotId;
      clearCompleteTimer(target);
      slots.delete(target);
    }

    slots.set(target, {
      slotId: target,
      agent: agent || 'claude-code',
      sessionKey,
      state: 'unknown',
      meta: 'bound',
      lastEventAt: now(),
      label,
      tmuxTarget,
      cmuxTarget,
    });
    emitChange();
    return target;
  }

  /**
   * Look up a slot's current tmux injection target (null if the session is not
   * running inside tmux, so remote key injection is impossible).
   * @param {number} slotId
   * @returns {string|null}
   */
  function tmuxTargetForSlot(slotId) {
    return slots.get(slotId)?.tmuxTarget ?? null;
  }

  /**
   * @param {AgentLightEvent} event
   */
  function applyEvent(event) {
    const slot = slots.get(event.slotId);
    if (!slot) {
      return { ok: false, reason: 'slot not bound' };
    }
    if (slot.sessionKey !== event.sessionKey) {
      return { ok: false, reason: 'sessionKey mismatch' };
    }

    const eventAt = Date.parse(event.ts);
    const eventTime = Number.isFinite(eventAt) ? eventAt : now();

    slot.state = event.state;
    slot.meta = 'bound';
    slot.lastEventAt = eventTime;

    if (event.state === 'complete') {
      slot.completeUntil = eventTime + completeHoldMs;
      scheduleCompleteHold(event.slotId, slot.completeUntil);
    } else {
      delete slot.completeUntil;
      clearCompleteTimer(event.slotId);
    }

    emitChange();
    return { ok: true };
  }

  /**
   * @param {number} [tickNow]
   */
  function tick(tickNow = now()) {
    let changed = false;

    for (const slot of slots.values()) {
      if (slot.state === 'complete' && slot.completeUntil != null && tickNow >= slot.completeUntil) {
        slot.state = 'idle';
        slot.meta = 'bound';
        delete slot.completeUntil;
        clearCompleteTimer(slot.slotId);
        changed = true;
        continue;
      }

      // needs_input is exempt from the stale sweep: an agent waiting for
      // approval emits no further events, possibly for minutes — the yellow
      // light must hold until a real event (approve/reject/next turn) moves it.
      if (slot.state !== 'idle' && slot.state !== 'unknown' && slot.state !== 'needs_input') {
        if (tickNow - slot.lastEventAt >= ingestStaleMs) {
          slot.state = 'unknown';
          slot.meta = 'detached';
          delete slot.completeUntil;
          clearCompleteTimer(slot.slotId);
          changed = true;
        }
      }
    }

    if (changed) {
      emitChange();
    }
  }

  return { bindSlot, resolveSession, tmuxTargetForSlot, applyEvent, tick, snapshot };
}
