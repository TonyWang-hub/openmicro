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
 * @returns {{ sendCommand: (action: string, slotId: number) => void, close: () => void }}
 */
export function connectLive({ token, onState, onLcd, onConnection }) {
  /** Map host light states to toy states (host never sends unknown to bound slots
   * after first event; before that we keep the idle default per spec §4). */
  const STATE_OK = new Set(['idle', 'thinking', 'complete', 'needs_input', 'error']);

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
            onState(slot.slotId, slot.state);
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

  connect();

  return {
    sendCommand(action, slotId) {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'command', payload: { action, slotId } }));
      } else {
        onLcd('未连接：指令没发出去');
      }
    },
    close() {
      closed = true;
      clearTimeout(reconnectTimer);
      try { ws?.close(); } catch { /* ignore */ }
    },
  };
}
