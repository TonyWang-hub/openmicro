import { t } from './i18n.js';

/**
 * 1:1 toy keyboard component.
 * Renders the device into `root`, owns pointer interaction + light classes.
 * Layout per the device reference (spec §0 布局铁律):
 *   R1: knob | agent0 | agent1 | joystick
 *   R2: agent2 | agent3 | agent4 | agent5
 *   R3: ⚡ quick | ◎✓ accept | ⊗ reject | ⤴ branch
 *   R4: LEDs+touch | 🎙 mic (span 2) | 💭 new
 *
 * @param {{
 *   root: HTMLElement,
 *   handlers: {
 *     onAgentKey?: (slotId: number) => void,
 *     onCmd?: (action: 'quick'|'accept'|'reject'|'branch'|'new_session') => void,
 *     onPttStart?: () => void,
 *     onPttEnd?: () => void,
 *     onKnob?: (level: 'LOW'|'MED'|'HIGH'|'XHIGH') => void,
 *     onJoy?: (dir: 'left'|'right'|'up'|'down') => void,
 *     onTouch?: () => void,
 *     onTouchLongPress?: () => void,
 *   },
 * }} options
 */
export function createToyKeyboard({ root, handlers = {} }) {
  const STATES = ['idle', 'thinking', 'complete', 'needs_input', 'error'];
  const KNOB_LEVELS = ['LOW', 'MED', 'HIGH', 'XHIGH'];

  root.innerHTML = `
    <div class="toy-stage">
      <div class="toy-scale">
        <div class="toy-jelly">
          <div class="toy-plate">
            <div class="toy-screw tl"></div><div class="toy-screw tr"></div>
            <div class="toy-screw bl"></div><div class="toy-screw br"></div>
            <div class="toy-etch left">WORK LOUDER | OPENAI 2026</div>
            <div class="toy-etch right">YOU CAN JUST BUILD THINGS</div>
            <div class="toy-etch top"><span class="toy-conn" data-conn></span>↑</div>
            <div class="toy-legend">
              <span><i style="background:#fff;border:1px solid #c9ced5"></i>idle</span>
              <span><i style="background:#7c9bf5"></i>thinking</span>
              <span><i style="background:#7ed9a2"></i>complete</span>
              <span><i style="background:#ffc456"></i>needs input</span>
              <span><i style="background:#f78bb6"></i>error</span>
            </div>
            <div class="toy-grid">
              <div class="toy-knobwrap">
                <div class="toy-knobside"></div>
                <div class="toy-knob" data-knob></div>
                <div class="toy-dialv" data-dialv>REASONING · MED</div>
              </div>
              <div class="toy-key toy-agent a-idle" data-agent="0"><div class="top"><div class="sw"></div></div></div>
              <div class="toy-key toy-agent a-idle" data-agent="1"><div class="top"><div class="sw"></div></div></div>
              <div class="toy-joy" data-joy><div class="cap"></div></div>
              <div class="toy-key toy-agent a-idle" data-agent="2"><div class="top"><div class="sw"></div></div></div>
              <div class="toy-key toy-agent a-idle" data-agent="3"><div class="top"><div class="sw"></div></div></div>
              <div class="toy-key toy-agent a-idle" data-agent="4"><div class="top"><div class="sw"></div></div></div>
              <div class="toy-key toy-agent a-idle" data-agent="5"><div class="top"><div class="sw"></div></div></div>
              <div class="toy-key toy-cmd" data-cmd="quick"><div class="top">⚡</div></div>
              <div class="toy-key toy-cmd" data-cmd="accept"><div class="top">◎✓</div></div>
              <div class="toy-key toy-cmd" data-cmd="reject"><div class="top">⊗</div></div>
              <div class="toy-key toy-cmd" data-cmd="branch"><div class="top">⤴</div></div>
              <div class="toy-io">
                <div class="toy-leds"><i></i><i></i><i></i></div>
                <div class="toy-touch" data-touch></div>
              </div>
              <div class="toy-key toy-cmd toy-mic" data-mic><div class="top">🎙</div></div>
              <div class="toy-key toy-cmd" data-cmd="new_session"><div class="top">💭</div></div>
            </div>
            <div class="toy-lcd"><span class="t" data-lcd-t>--:--:--</span><span class="m" data-lcd-m>LET'S BUILD</span></div>
          </div>
        </div>
      </div>
      <div class="toy-rotate-hint" data-rotate-hint></div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const agents = [...root.querySelectorAll('[data-agent]')];

  $('[data-rotate-hint]').textContent = t('keyboard.rotateHint');

  // --- scale device to viewport width (540px design width, spec §4) ---
  const DESIGN_W = 540;
  const scaleEl = $('.toy-scale');
  function fit() {
    const w = Math.min(root.clientWidth || window.innerWidth, window.innerWidth);
    const h = window.innerHeight;
    const scale = Math.min(w / DESIGN_W, h / 760, 1.15);
    scaleEl.style.setProperty('--scale', String(scale));
  }
  window.addEventListener('resize', fit);
  fit();

  // --- pressed visual for any key ---
  // Tap keys fire on `click` — the one tap event iOS Safari delivers reliably.
  // (The previous pointerdown/pointerup + setPointerCapture approach dropped the
  // "up" on mobile Safari, so command keys silently did nothing on a phone.)
  // pointerdown/up only drive the pressed-down visual, best-effort per engine.
  function tapify(el, onTap) {
    el.addEventListener('pointerdown', () => el.classList.add('pressed'));
    const clear = () => el.classList.remove('pressed');
    el.addEventListener('pointerup', clear);
    el.addEventListener('pointercancel', clear);
    el.addEventListener('pointerleave', clear);
    el.addEventListener('click', (e) => {
      clear();
      if (el.classList.contains('disabled')) return;
      onTap(e);
    });
  }

  // Hold keys (PTT) need press-and-hold semantics: start on pointerdown, stop on
  // release/cancel/leave. Capture so a finger sliding off still ends the hold.
  function holdify(el, { down, up }) {
    let held = false;
    el.addEventListener('pointerdown', (e) => {
      if (el.classList.contains('disabled')) return;
      held = true;
      el.setPointerCapture?.(e.pointerId);
      down?.();
    });
    const end = () => { if (held) { held = false; up?.(); } };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
  }

  // --- agent keys ---
  agents.forEach((el) => {
    const slotId = Number(el.dataset.agent);
    tapify(el, () => handlers.onAgentKey?.(slotId));
  });

  // --- command keys ---
  root.querySelectorAll('[data-cmd]').forEach((el) => {
    const action = el.dataset.cmd;
    tapify(el, () => handlers.onCmd?.(action));
  });

  // --- PTT: hold to talk ---
  const mic = $('[data-mic]');
  holdify(mic, {
    down: () => { mic.classList.add('recording'); handlers.onPttStart?.(); },
    up: () => {
      if (!mic.classList.contains('recording')) return;
      mic.classList.remove('recording');
      handlers.onPttEnd?.();
    },
  });

  // --- knob: tap to cycle reasoning level ---
  const knob = $('[data-knob]');
  const dialv = $('[data-dialv]');
  let knobIdx = 1;
  tapify(knob, () => {
    knobIdx = (knobIdx + 1) % KNOB_LEVELS.length;
    knob.style.transform = `rotate(${knobIdx * 65 - 65}deg)`;
    dialv.textContent = `REASONING · ${KNOB_LEVELS[knobIdx]}`;
    handlers.onKnob?.(KNOB_LEVELS[knobIdx]);
  });

  // --- joystick: quadrant tap nudges the cap ---
  const joy = $('[data-joy]');
  tapify(joy, (e) => {
    const r = joy.getBoundingClientRect();
    const x = (e.clientX ?? r.left + r.width / 2) - r.left - r.width / 2;
    const y = (e.clientY ?? r.top + r.height / 2) - r.top - r.height / 2;
    const horizontal = Math.abs(x) > Math.abs(y);
    const dir = horizontal ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    const nudge = { left: [-8, 0], right: [8, 0], up: [0, -8], down: [0, 8] }[dir];
    const cap = joy.querySelector('.cap');
    cap.style.translate = `${nudge[0]}px ${nudge[1]}px`;
    setTimeout(() => { cap.style.translate = ''; }, 180);
    handlers.onJoy?.(dir);
  });

  // --- touch sensor: tap + long-press (音色切换入口) ---
  const touch = $('[data-touch]');
  let touchTimer = null;
  let longFired = false;
  touch.addEventListener('pointerdown', () => {
    longFired = false;
    touchTimer = setTimeout(() => {
      longFired = true;
      handlers.onTouchLongPress?.();
    }, 600);
  });
  const touchEndClear = () => clearTimeout(touchTimer);
  touch.addEventListener('pointercancel', touchEndClear);
  touch.addEventListener('pointerleave', touchEndClear);
  // Fire the short-tap action on click (reliable on iOS); long-press already
  // fired via the timer, so suppress the click-tap in that case.
  touch.addEventListener('click', () => {
    clearTimeout(touchTimer);
    if (longFired) { longFired = false; return; }
    handlers.onTouch?.();
  });

  // --- public surface ---
  let lcdTimer = null;
  function setLcd(text) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    $('[data-lcd-t]').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('[data-lcd-m]').textContent = text;
  }

  let focusedSlotId = null;
  const stateCls = (slotId, state) =>
    `toy-key toy-agent a-${state}${slotId === focusedSlotId ? ' focused' : ''}`;

  return {
    /** @param {number} slotId @param {string} state one of STATES */
    applyState(slotId, state) {
      const el = agents[slotId];
      if (!el || !STATES.includes(state)) return;
      el.dataset.state = state;
      el.className = stateCls(slotId, state);
    },
    /**
     * Highlight the explicitly-selected agent key. Command keys (accept/reject/
     * quick) act ONLY on this slot — never an auto-picked one — so a tap can
     * never fire into an unselected session.
     * @param {number|null} slotId
     */
    setFocused(slotId) {
      focusedSlotId = slotId;
      agents.forEach((el, i) => {
        const st = el.dataset.state || 'idle';
        el.className = stateCls(i, st);
      });
    },
    setLcd,
    /** Marquee a transient message, then restore. */
    flashLcd(text, restoreText, ms = 2600) {
      setLcd(text);
      clearTimeout(lcdTimer);
      if (restoreText != null) lcdTimer = setTimeout(() => setLcd(restoreText), ms);
    },
    /** @param {'connected'|'connecting'|'disconnected'|'off'} s */
    setConnection(s) {
      const dot = $('[data-conn]');
      dot.className = `toy-conn${s === 'off' ? '' : ` ${s}`}`;
    },
    setMicDisabled(disabled) {
      mic.classList.toggle('disabled', disabled);
    },
    getKnobLevel: () => KNOB_LEVELS[knobIdx],
  };
}
