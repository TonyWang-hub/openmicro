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
      .map(({ slotId, agent, sessionKey, state, meta, lastEventAt }) => ({
        slotId,
        agent,
        sessionKey,
        state,
        meta,
        lastEventAt,
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

      if (slot.state !== 'idle' && slot.state !== 'unknown') {
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

  return { bindSlot, applyEvent, tick, snapshot };
}
