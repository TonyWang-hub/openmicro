/** @typedef {'idle'|'thinking'|'complete'|'needs_input'|'error'|'unknown'} LightState */

const MAX_SLOTS = 6;

const LED = Object.freeze({
  idle: 'var(--led-idle)',
  thinking: 'var(--led-thinking)',
  complete: 'var(--led-complete)',
  needs_input: 'var(--led-needs_input)',
  error: 'var(--led-error)',
  unknown: 'var(--led-unknown)',
});

/**
 * Per-slot xterm panes. Terminal I/O never drives LED colors.
 *
 * @param {{
 *   tabsEl: HTMLElement,
 *   hostEl: HTMLElement,
 *   send: (msg: object) => void,
 *   onFocusSlot: (slotId: number) => void,
 *   getFocusedSlotId: () => number | null,
 * }} opts
 */
export function createTerminalPanel({ tabsEl, hostEl, send, onFocusSlot, getFocusedSlotId }) {
  const Terminal = globalThis.Terminal;
  const FitAddonNs = globalThis.FitAddon;
  if (!Terminal || !FitAddonNs?.FitAddon) {
    throw new Error('xterm vendor scripts not loaded (Terminal / FitAddon)');
  }

  /** @type {Map<number, { term: import('@xterm/xterm').Terminal, fit: { fit: () => void, proposeDimensions?: () => { cols: number, rows: number } | undefined }, pane: HTMLElement, tab: HTMLElement, bound: boolean, agent: string, state: LightState }>} */
  const slots = new Map();

  for (let slotId = 0; slotId < MAX_SLOTS; slotId++) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab unbound';
    tab.dataset.slot = String(slotId);
    tab.innerHTML = `<span class="dot"></span><span class="label">slot ${slotId}</span>`;
    tab.addEventListener('click', () => onFocusSlot(slotId));
    tabsEl.appendChild(tab);

    const pane = document.createElement('div');
    pane.className = 'term-pane';
    pane.dataset.slot = String(slotId);
    hostEl.appendChild(pane);

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#c9d1d9',
        selectionBackground: rgba(88, 166, 255, 0.3),
      },
      convertEol: true,
    });
    const fit = new FitAddonNs.FitAddon();
    term.loadAddon(fit);
    term.open(pane);

    term.onData((data) => {
      const focused = getFocusedSlotId();
      const active = focused ?? slotId;
      if (active !== slotId) return;
      send({ type: 'term_input', slotId, data });
    });

    slots.set(slotId, {
      term,
      fit,
      pane,
      tab,
      bound: false,
      agent: '',
      state: 'unknown',
    });
  }

  const ro = new ResizeObserver(() => {
    const focused = getFocusedSlotId();
    if (focused == null) return;
    fitAndNotify(focused);
  });
  ro.observe(hostEl);

  /**
   * @param {number} slotId
   */
  function fitAndNotify(slotId) {
    const s = slots.get(slotId);
    if (!s) return;
    try {
      s.fit.fit();
    } catch {
      /* ignore fit races before layout */
    }
    const dims = s.fit.proposeDimensions?.() || { cols: s.term.cols, rows: s.term.rows };
    if (dims?.cols > 0 && dims?.rows > 0) {
      send({ type: 'term_resize', slotId, cols: dims.cols, rows: dims.rows });
    }
  }

  /**
   * @param {number} slotId
   * @param {LightState} state
   */
  function paintTabDot(slotId, state) {
    const s = slots.get(slotId);
    if (!s) return;
    const color = LED[state] || LED.unknown;
    const dot = /** @type {HTMLElement | null} */ (s.tab.querySelector('.dot'));
    if (!dot) return;
    dot.style.background = color;
    dot.style.boxShadow =
      state === 'idle' || state === 'unknown' ? 'none' : `0 0 6px ${color}`;
  }

  return {
    /**
     * @param {{ slots?: Array<{ slotId: number, agent?: string, state?: string, meta?: string }>, focusedSlotId?: number | null }} msg
     */
    applyState(msg) {
      const present = new Set();
      for (const slot of msg.slots || []) {
        if (!Number.isInteger(slot.slotId) || slot.slotId < 0 || slot.slotId >= MAX_SLOTS) continue;
        present.add(slot.slotId);
        const s = slots.get(slot.slotId);
        if (!s) continue;
        s.bound = true;
        s.agent = slot.agent || '';
        s.state = /** @type {LightState} */ (slot.state || 'unknown');
        s.tab.classList.remove('unbound');
        const label = s.tab.querySelector('.label');
        if (label) {
          label.textContent = s.agent ? `${s.agent} · ${slot.slotId}` : `slot ${slot.slotId}`;
        }
        paintTabDot(slot.slotId, s.state);
      }
      for (let slotId = 0; slotId < MAX_SLOTS; slotId++) {
        if (present.has(slotId)) continue;
        const s = slots.get(slotId);
        if (!s) continue;
        // Keep last light; only mark unbound if never seen.
        if (!s.bound) {
          s.tab.classList.add('unbound');
          paintTabDot(slotId, 'unknown');
        }
      }
      if (msg.focusedSlotId != null) {
        this.setFocused(msg.focusedSlotId);
      }
    },

    /**
     * @param {number} slotId
     */
    setFocused(slotId) {
      for (const [id, s] of slots) {
        const on = id === slotId;
        s.pane.classList.toggle('active', on);
        s.tab.classList.toggle('active', on);
        if (on) {
          requestAnimationFrame(() => {
            fitAndNotify(id);
            s.term.focus();
          });
        }
      }
    },

    /**
     * @param {number} slotId
     * @param {string} data
     */
    writeOutput(slotId, data) {
      const s = slots.get(slotId);
      if (!s || typeof data !== 'string') return;
      s.term.write(data);
    },

    /**
     * Status helpers for the bottom bar — derived from last WS state only.
     * @param {number | null} slotId
     */
    describe(slotId) {
      if (slotId == null) return { slot: '—', agent: '—', state: '—' };
      const s = slots.get(slotId);
      if (!s) return { slot: String(slotId), agent: '—', state: '—' };
      return {
        slot: String(slotId),
        agent: s.agent || (s.bound ? 'bound' : 'unbound'),
        state: s.state,
      };
    },
  };
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @param {number} a
 */
function rgba(r, g, b, a) {
  return `rgba(${r},${g},${b},${a})`;
}
