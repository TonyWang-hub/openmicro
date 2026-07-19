import { isLoopbackAddress } from './auth.js';

/**
 * Hosts considered "local-only" binds — no external exposure, so the
 * no-token boot warning does not apply to them.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * @param {string} host value of config.host (e.g. '0.0.0.0', '127.0.0.1', a LAN IP)
 * @returns {boolean} true when the bind address is reachable from outside the machine
 */
export function isNonLoopbackHost(host) {
  return !LOOPBACK_HOSTS.has(host);
}

/**
 * Sliding-window per-key request counter. Used to bound abusive/broken
 * clients (retry storms, runaway scripts) without needing external deps.
 *
 * Fail-open by design: a falsy key (unknown remote address) is always
 * allowed rather than risk blocking legitimate traffic we can't attribute.
 *
 * @param {{ windowMs: number, max: number }} opts
 *   `max <= 0` disables the limiter entirely (always allow) — the opt-out
 *   switch for deployments that want no rate limiting at all.
 * @returns {{ allow: (key: string | undefined | null) => boolean, reset: () => void, size: () => number }}
 */
export function createRateLimiter({ windowMs, max }) {
  /** @type {Map<string, number[]>} */
  const hits = new Map();
  const disabled = !(max > 0);

  /**
   * @param {string | undefined | null} key
   * @returns {boolean}
   */
  function allow(key) {
    if (disabled) return true;
    if (!key) return true; // no attributable key — fail open, don't block

    const now = Date.now();
    let timestamps = hits.get(key);
    if (!timestamps) {
      timestamps = [];
      hits.set(key, timestamps);
    }
    // Prune entries that fell out of the window.
    while (timestamps.length && now - timestamps[0] > windowMs) {
      timestamps.shift();
    }
    if (timestamps.length >= max) {
      return false;
    }
    timestamps.push(now);
    // Opportunistic cleanup so long-lived processes don't accumulate empty
    // arrays for IPs that stopped sending traffic.
    if (timestamps.length === 0) hits.delete(key);
    return true;
  }

  return {
    allow,
    reset() {
      hits.clear();
    },
    size: () => hits.size,
  };
}

/**
 * Parse CMS_ALLOWED_ORIGINS (comma-separated) into a list. Empty/unset means
 * "no restriction" — preserves default LAN-direct-connect behavior.
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseAllowedOrigins(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Check whether a request's Origin header is acceptable.
 *
 * - Empty allowlist (default): unrestricted, always true — keeps existing
 *   LAN-direct-connect / non-browser clients working unchanged.
 * - Loopback requests are always exempt (local tooling, curl, hooks).
 * - Non-loopback requests with a non-empty allowlist: the Origin header must
 *   be present and match one of the configured origins. A missing Origin
 *   header on a non-loopback request is rejected once the allowlist is
 *   non-empty — real browsers always send Origin for cross-origin/WS
 *   requests, so an absent header here is a strong forgery signal.
 *
 * @param {{ headers?: Record<string, string | string[] | undefined>, socket?: { remoteAddress?: string }, connection?: { remoteAddress?: string } }} req
 * @param {string[]} allowedOrigins
 * @returns {boolean}
 */
export function isOriginAllowed(req, allowedOrigins) {
  if (!allowedOrigins || allowedOrigins.length === 0) return true;

  const remoteAddress = req.socket?.remoteAddress ?? req.connection?.remoteAddress;
  if (isLoopbackAddress(remoteAddress)) return true;

  const origin = req.headers?.origin;
  if (!origin || typeof origin !== 'string') return false;
  return allowedOrigins.includes(origin);
}
