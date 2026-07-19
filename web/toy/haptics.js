/**
 * Thin wrapper around navigator.vibrate for the toy keyboard's tactile feedback.
 *
 * iOS Safari (and any browser without the Vibration API) simply has no
 * navigator.vibrate — every export here degrades to a silent no-op in that
 * case, and never throws, per the failure-path spec ("vibrate 不支持时静默降级").
 */

/** @typedef {'tap'|'press'|'detent'|'alert'} HapticName */

/**
 * Named vibration patterns (ms), per the interface contract.
 * @type {Record<HapticName, number | number[]>}
 */
const PATTERNS = {
  tap: 10,
  press: 25,
  detent: 5,
  alert: [30, 50, 30],
};

/**
 * @returns {boolean} whether the Vibration API is available in this browser.
 */
export function hapticsSupported() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Fire a named haptic pattern. Silently does nothing when unsupported or when
 * the underlying call throws/rejects (e.g. permission-gated contexts).
 * @param {HapticName} name
 */
export function haptic(name) {
  if (!hapticsSupported()) return;
  const pattern = PATTERNS[name];
  if (pattern == null) return;
  try {
    navigator.vibrate(pattern);
  } catch (_err) {
    // Never throw — vibrate() failures are expected/no-op per spec.
  }
}
