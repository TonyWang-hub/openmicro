/**
 * Optional Codex app-server ingest (default off).
 * Status mapping only — no task-dispatch UI.
 *
 * Status ideas mirrored from a companion app-server event-stream client:
 *   running | awaiting_approval | succeeded | failed | cancelled
 * → mapCodexAppServerStatus → store.applyEvent
 */

import { mapCodexAppServerStatus } from './codex.js';

/**
 * @typedef {import('../types.js').AgentLightEvent} AgentLightEvent
 *
 * @typedef {object} SlotBinding
 * @property {number} slotId
 * @property {'claude-code'|'codex'} agent
 * @property {string} sessionKey
 *
 * @typedef {object} AppServerTransport
 * @property {(event: 'status'|'error'|'close', handler: (...args: any[]) => void) => void} on
 * @property {() => void | Promise<void>} [close]
 *
 * @typedef {object} CodexAppServerIngestOptions
 * @property {boolean} enabled
 * @property {{ applyEvent: (event: AgentLightEvent) => unknown }} store
 * @property {SlotBinding} binding
 * @property {(entry: { level: string, message: string }) => void} [onLog]
 * @property {() => AppServerTransport | Promise<AppServerTransport>} [createTransport]
 */

/**
 * Thin ingest wrapper. When disabled, start() is a no-op.
 * Connect failures log warn and never throw out of start().
 *
 * @param {CodexAppServerIngestOptions} options
 */
export function createCodexAppServerIngest({
  enabled,
  store,
  binding,
  onLog = () => {},
  createTransport,
}) {
  /** @type {AppServerTransport | null} */
  let transport = null;

  /**
   * @param {{ state: string }} raw
   */
  function onStatus(raw) {
    const event = mapCodexAppServerStatus(raw, binding);
    if (event) store.applyEvent(event);
  }

  async function start() {
    if (!enabled) {
      return { connected: false, reason: 'disabled' };
    }

    const factory = createTransport ?? defaultCreateTransport;
    try {
      transport = await factory();
      transport.on('status', onStatus);
      return { connected: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onLog({
        level: 'warn',
        message: `codex app-server connect failed: ${message}`,
      });
      transport = null;
      return { connected: false, reason: 'connect-failed' };
    }
  }

  async function stop() {
    if (!transport) return;
    try {
      await transport.close?.();
    } catch {
      /* ignore */
    }
    transport = null;
  }

  return { start, stop };
}

/**
 * Default transport: intentionally unavailable until a real local protocol
 * is wired. Callers should inject createTransport in tests / real deploys.
 * @returns {Promise<never>}
 */
async function defaultCreateTransport() {
  throw new Error('no app-server transport configured');
}
