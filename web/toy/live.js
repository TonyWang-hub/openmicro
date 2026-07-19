/**
 * Live mode wiring — consumes the host's existing WS protocol (spec §5).
 * Reconnects with exponential backoff capped at 30s (spec §6).
 *
 * @param {{
 *   token: string,
 *   onState: (slotId: number, state: string) => void,
 *   onLcd: (text: string) => void,
 *   onConnection: (s: 'connected'|'connecting'|'disconnected') => void,
 * }} options
 * @returns {{ sendCommand: (action: string, slotId: number, text?: string) => void, close: () => void }}
 */
export function connectLive({ token, onState, onLcd, onConnection }) {
  /** Map host light states to toy states (host never sends unknown to bound slots
   * after first event; before that we keep the idle default per spec §4). */
  const STATE_OK = new Set(['idle', 'thinking', 'complete', 'needs_input', 'error']);

  // --- Offline command queue (amux-style) ---
  // Commands sent while disconnected (no OPEN socket) are queued instead of
  // dropped, and replayed in order once the socket reconnects. Each entry
  // carries a timestamp: approvals/rejections in particular can go stale
  // (the agent state they targeted may no longer exist by the time we
  // reconnect), so any entry older than QUEUE_MAX_AGE_MS at flush time is
  // dropped with a notice rather than blindly replayed. Persisted to
  // localStorage (namespaced by token) so a page reload while offline
  // doesn't silently lose queued commands.
  const QUEUE_MAX_AGE_MS = 60000;
  const QUEUE_KEY = `cms-toy-offline-queue:${token}`;

  function loadQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveQueue() {
    try {
      if (queue.length === 0) localStorage.removeItem(QUEUE_KEY);
      else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch { /* ignore (private mode / quota) */ }
  }

  /** @type {Array<{ action: string, slotId: number, text?: string, ts: number }>} */
  let queue = loadQueue();

  let ws = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer = null;

  function url() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/?token=${encodeURIComponent(token)}`;
  }

  function connect() {
    if (closed) return;
    onConnection('connecting');
    ws = new WebSocket(url());

    ws.onopen = () => {
      attempt = 0;
      onConnection('connected');
      ws.send(JSON.stringify({ type: 'subscribe' }));
      flushQueue();
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'state' && Array.isArray(msg.slots)) {
        for (const slot of msg.slots) {
          if (typeof slot.slotId === 'number' && STATE_OK.has(slot.state)) {
            onState(slot.slotId, slot.state, slot.label ?? null);
          }
        }
      } else if (msg.type === 'log' && typeof msg.message === 'string') {
        onLcd(msg.message);
      }
    };

    ws.onclose = () => {
      if (closed) return;
      onConnection('disconnected');
      const delay = Math.min(30000, 500 * 2 ** attempt);
      attempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* ignore */ }
    };
  }

  /** Send one command straight to the wire (assumes OPEN); used by both the
   * live path and queue replay so there's a single wire-format source. */
  function sendRaw(action, slotId, text) {
    const payload = { action, slotId };
    if (text != null) payload.text = text;
    ws.send(JSON.stringify({ type: 'command', payload }));
  }

  /** Replay queued commands in order once reconnected; drop anything past
   * QUEUE_MAX_AGE_MS (e.g. an accept/reject whose target state has since
   * moved on) instead of firing it stale. */
  function flushQueue() {
    if (queue.length === 0) return;
    if (ws?.readyState !== WebSocket.OPEN) return;
    const pending = queue;
    queue = [];
    saveQueue();
    const now = Date.now();
    let sent = 0;
    let dropped = 0;
    for (const cmd of pending) {
      if (now - cmd.ts > QUEUE_MAX_AGE_MS) {
        dropped += 1;
        continue;
      }
      sendRaw(cmd.action, cmd.slotId, cmd.text);
      sent += 1;
    }
    if (sent && dropped) onLcd(`补发 ${sent} 条离线指令，${dropped} 条已超时丢弃`);
    else if (sent) onLcd(`补发 ${sent} 条离线指令`);
    else if (dropped) onLcd(`${dropped} 条离线指令已超时丢弃（未补发）`);
  }

  connect();

  return {
    sendCommand(action, slotId, text) {
      if (ws?.readyState === WebSocket.OPEN) {
        sendRaw(action, slotId, text);
      } else {
        queue.push({ action, slotId, text, ts: Date.now() });
        saveQueue();
        onLcd(`离线，已排队 ${queue.length} 条，连上补发`);
      }
    },
    close() {
      closed = true;
      clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
    },
  };
}
