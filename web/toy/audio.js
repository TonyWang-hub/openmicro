/**
 * WebAudio-synthesized mechanical-keyboard sound effects.
 *
 * Everything here is synthesized in-browser with oscillators + filtered noise
 * bursts + gain envelopes — there is no external audio file/URL of any kind.
 *
 * Acoustic model (approximated from mechanical-keyboard switch behaviour):
 *   keyDown  = high transient "click" (oscillator) + short noise burst (the
 *              stem sliding past the leaf/spring) with a fast decay envelope.
 *   keyUp    = a softer, lower "bottoming out" thud as the key returns.
 *   'pom'    = clicky/tactile profile: ~2-4kHz transient, ~40ms decay.
 *   'pok'    = silent/linear profile: ~150-300Hz thud, ~60ms decay, quieter.
 */

/** @typedef {'pom'|'pok'} AudioProfile */
/** @typedef {'agent'|'cmd'|'mic'|'touch'} KeyKind */

/**
 * @typedef {object} AudioApi
 * @property {() => Promise<void>} unlock
 * @property {(kind: KeyKind) => void} keyDown
 * @property {(kind: KeyKind) => void} keyUp
 * @property {() => void} knobTick
 * @property {() => void} pttStart
 * @property {() => void} pttStop
 * @property {(profile: AudioProfile) => void} setProfile
 */

/** @type {AudioContext | null} */
let sharedCtx = null;
/** @type {GainNode | null} */
let masterGain = null;

/**
 * Per-profile base acoustics: transient frequency + decay + gain levels.
 * @type {Record<AudioProfile, { freqBase: number, decay: number, toneGain: number, noiseGain: number }>}
 */
const PROFILES = {
  pom: { freqBase: 3000, decay: 0.04, toneGain: 0.28, noiseGain: 0.2 },
  // 'pok' 音量约为 pom 的 60%（decay/gain 都按 0.6 系数换算）。
  pok: { freqBase: 220, decay: 0.06, toneGain: 0.28 * 0.6, noiseGain: 0.2 * 0.6 },
};

/**
 * Per-kind timbre nudges layered on top of the active profile.
 * agent 略高音调；mic 更宽厚（降 Q、降频、提量）；cmd 为基准；touch 单独处理。
 * @type {Record<KeyKind, { freqMul: number, gainMul: number, noiseQ: number }>}
 */
const KIND_FACTORS = {
  agent: { freqMul: 1.15, gainMul: 1.0, noiseQ: 1.2 },
  cmd: { freqMul: 1.0, gainMul: 1.0, noiseQ: 1.2 },
  mic: { freqMul: 0.85, gainMul: 1.15, noiseQ: 0.6 },
  touch: { freqMul: 1.0, gainMul: 0.5, noiseQ: 1.2 },
};

/**
 * @param {string} kind
 * @returns {{ freqMul: number, gainMul: number, noiseQ: number }}
 */
function kindFactor(kind) {
  return KIND_FACTORS[/** @type {KeyKind} */ (kind)] || KIND_FACTORS.cmd;
}

/**
 * Lazily create (once, process-wide) the singleton AudioContext + master gain.
 * Only ever called from unlock() — sound methods never trigger creation, so
 * they stay silent until a user gesture has unlocked audio.
 * @returns {AudioContext | null}
 */
function ensureContext() {
  if (sharedCtx) return sharedCtx;
  try {
    const Ctor = /** @type {any} */ (window).AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctor) return null;
    sharedCtx = new Ctor();
    masterGain = sharedCtx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(sharedCtx.destination);
  } catch (_err) {
    sharedCtx = null;
    masterGain = null;
  }
  return sharedCtx;
}

/**
 * Returns the shared context only if it exists AND is running (i.e. unlocked).
 * All sound-emitting helpers gate on this and no-op otherwise — never throw.
 * @returns {AudioContext | null}
 */
function unlockedContext() {
  if (!sharedCtx || !masterGain) return null;
  return sharedCtx.state === 'running' ? sharedCtx : null;
}

/**
 * @param {AudioContext} ctx
 * @param {number} duration seconds
 * @returns {AudioBuffer}
 */
function makeNoiseBuffer(ctx, duration) {
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Play a short oscillator "ping" with a fast attack / exponential decay envelope.
 * @param {{ freq: number, freqEnd?: number, duration: number, type?: OscillatorType, gain?: number, attack?: number, delay?: number }} opts
 */
function playTone({ freq, freqEnd = freq, duration, type = 'sine', gain = 0.25, attack = 0.002, delay = 0 }) {
  const ctx = unlockedContext();
  if (!ctx || !masterGain) return;
  const t0 = ctx.currentTime + Math.max(0, delay);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(1, freq), t0);
  if (freqEnd !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(masterGain);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/**
 * Play a filtered noise burst (used for the switch's mechanical "scrape").
 * @param {{ duration: number, filterFreq: number, q?: number, gain?: number, delay?: number }} opts
 */
function playNoiseBurst({ duration, filterFreq, q = 1, gain = 0.18, delay = 0 }) {
  const ctx = unlockedContext();
  if (!ctx || !masterGain) return;
  const t0 = ctx.currentTime + Math.max(0, delay);
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, duration);
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = Math.max(20, filterFreq);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter).connect(g).connect(masterGain);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

/**
 * Extra-light capacitive "嘀" tick for the touch pad — not a mechanical key.
 * @param {number} gainMul
 */
function playTouchTick(gainMul = 1) {
  playTone({ freq: 5200, freqEnd: 4600, duration: 0.008, type: 'sine', gain: 0.08 * gainMul, attack: 0.0005 });
}

/**
 * @param {{ profile?: AudioProfile }} [opts]
 * @returns {AudioApi}
 */
export function createAudio({ profile = 'pom' } = {}) {
  /** @type {AudioProfile} */
  let currentProfile = profile === 'pok' ? 'pok' : 'pom';

  return {
    async unlock() {
      const ctx = ensureContext();
      if (!ctx) return;
      try {
        if (ctx.state !== 'running') await ctx.resume();
      } catch (_err) {
        // Autoplay-policy rejections etc. are expected — stay silent per spec.
      }
    },

    /**
     * @param {KeyKind} kind
     */
    keyDown(kind) {
      if (kind === 'touch') {
        playTouchTick(1);
        return;
      }
      const p = PROFILES[currentProfile];
      const f = kindFactor(kind);
      const freq = p.freqBase * f.freqMul;
      playTone({
        freq,
        freqEnd: freq * 0.6,
        duration: 0.02,
        type: 'square',
        gain: p.toneGain * f.gainMul,
        attack: 0.001,
      });
      playNoiseBurst({
        duration: p.decay,
        filterFreq: kind === 'mic' ? freq * 0.7 : freq,
        q: f.noiseQ,
        gain: p.noiseGain * f.gainMul,
      });
    },

    /**
     * @param {KeyKind} kind
     */
    keyUp(kind) {
      if (kind === 'touch') {
        playTouchTick(0.5);
        return;
      }
      const p = PROFILES[currentProfile];
      const f = kindFactor(kind);
      const freq = p.freqBase * f.freqMul * 0.5;
      playTone({
        freq,
        freqEnd: freq * 0.8,
        duration: p.decay * 0.5,
        type: 'sine',
        gain: p.toneGain * 0.4 * f.gainMul,
        attack: 0.001,
      });
    },

    knobTick() {
      // ~5ms high-frequency ratchet click — cheap enough to fire in rapid succession.
      playTone({ freq: 3200, freqEnd: 2600, duration: 0.005, type: 'square', gain: 0.2, attack: 0.0005 });
    },

    pttStart() {
      // Rising two-tone (walkie-talkie "on") — low then high.
      playTone({ freq: 520, duration: 0.09, type: 'sine', gain: 0.22 });
      playTone({ freq: 880, duration: 0.12, type: 'sine', gain: 0.26, delay: 0.1 });
    },

    pttStop() {
      // Falling two-tone (walkie-talkie "off") — high then low.
      playTone({ freq: 880, duration: 0.09, type: 'sine', gain: 0.22 });
      playTone({ freq: 520, duration: 0.12, type: 'sine', gain: 0.26, delay: 0.1 });
    },

    /**
     * @param {AudioProfile} p
     */
    setProfile(p) {
      if (p === 'pom' || p === 'pok') currentProfile = p;
    },
  };
}
