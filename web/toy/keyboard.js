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
      <div class="toy-rotate-hint">竖屏体验最佳 · rotate for best fit</div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const agents = [...root.querySelectorAll('[data-agent]')];

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
  function pressify(el, { down, up }) {
    let pressed = false;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pressed = true;
      el.classList.add('pressed');
      el.setPointerCapture?.(e.pointerId);
      down?.(e);
    });
    const release = (e) => {
      if (!pressed) return;
      pressed = false;
      el.classList.remove('pressed');
      up?.(e);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  // --- agent keys ---
  agents.forEach((el) => {
    const slotId = Number(el.dataset.agent);
    pressify(el, {
      down: () => handlers.onAgentKey && undefined,
      up: () => handlers.onAgentKey?.(slotId),
    });
  });

  // --- command keys ---
  root.querySelectorAll('[data-cmd]').forEach((el) => {
    const action = el.dataset.cmd;
    pressify(el, {
      up: () => {
        if (el.classList.contains('disabled')) return;
        handlers.onCmd?.(action);
      },
    });
  });

  // --- PTT: hold to talk ---
  const mic = $('[data-mic]');
  pressify(mic, {
    down: () => {
      if (mic.classList.contains('disabled')) return;
      mic.classList.add('recording');
      handlers.onPttStart?.();
    },
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
  knob.addEventListener('pointerup', () => {
    knobIdx = (knobIdx + 1) % KNOB_LEVELS.length;
    knob.style.transform = `rotate(${knobIdx * 65 - 65}deg)`;
    dialv.textContent = `REASONING · ${KNOB_LEVELS[knobIdx]}`;
    handlers.onKnob?.(KNOB_LEVELS[knobIdx]);
  });

  // --- joystick: quadrant tap nudges the cap ---
  const joy = $('[data-joy]');
  joy.addEventListener('pointerup', (e) => {
    const r = joy.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    const horizontal = Math.abs(x) > Math.abs(y);
    const dir = horizontal ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    const nudge = { left: [-8, 0], right: [8, 0], up: [0, -8], down: [0, 8] }[dir];
    const cap = joy.querySelector('.cap');
    cap.style.translate = `${nudge[0]}px ${nudge[1]}px`;
    setTimeout(() => { cap.style.translate = ''; }, 180);
    handlers.onJoy?.(dir);
  });

  // --- touch sensor: tap + long-press (spec §4 音色切换入口) ---
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
  const touchEnd = () => {
    clearTimeout(touchTimer);
    if (!longFired) handlers.onTouch?.();
  };
  touch.addEventListener('pointerup', touchEnd);
  touch.addEventListener('pointercancel', () => clearTimeout(touchTimer));

  // --- public surface ---
  let lcdTimer = null;
  function setLcd(text) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    $('[data-lcd-t]').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('[data-lcd-m]').textContent = text;
  }

  return {
    /** @param {number} slotId @param {string} state one of STATES */
    applyState(slotId, state) {
      const el = agents[slotId];
      if (!el || !STATES.includes(state)) return;
      el.className = `toy-key toy-agent a-${state}`;
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
