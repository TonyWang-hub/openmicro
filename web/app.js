import { createKeyboard } from './keyboard.js';
import { createTerminalPanel } from './terminal.js';

const RECONNECT_MS = 1500;

/** @type {WebSocket | null} */
let ws = null;
/** @type {number | null} */
let focusedSlotId = null;
let reconnectTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);

const connEl = /** @type {HTMLElement} */ (document.getElementById('connStatus'));
const statusSlot = /** @type {HTMLElement} */ (document.getElementById('statusSlot'));
const statusAgent = /** @type {HTMLElement} */ (document.getElementById('statusAgent'));
const statusState = /** @type {HTMLElement} */ (document.getElementById('statusState'));

/**
 * @param {'connected'|'connecting'|'disconnected'} state
 * @param {string} [detail]
 */
function setConn(state, detail) {
  connEl.className = `conn ${state}`;
  const label =
    state === 'connected' ? 'connected' :
    state === 'connecting' ? 'connecting…' :
    'disconnected';
  connEl.textContent = `● ${detail || label}`;
}

/**
 * @param {object} msg
 */
function send(msg) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

/**
 * @param {'accept'|'reject'|'new_session'|'focus'} action
 * @param {number} slotId
 */
function sendCommand(action, slotId) {
  /** @type {{ v: 1, slotId: number, action: typeof action, ts: string }} */
  const payload = {
    v: 1,
    slotId,
    action,
    ts: new Date().toISOString(),
  };
  send({ type: 'command', payload });
}

const keyboard = createKeyboard({
  root: /** @type {HTMLElement} */ (document.getElementById('keyboardRoot')),
  sendCommand,
  getFocusedSlotId: () => focusedSlotId,
});

const terminal = createTerminalPanel({
  tabsEl: /** @type {HTMLElement} */ (document.getElementById('tabs')),
  hostEl: /** @type {HTMLElement} */ (document.getElementById('termHost')),
  send,
  onFocusSlot: (slotId) => sendCommand('focus', slotId),
  getFocusedSlotId: () => focusedSlotId,
});

function refreshStatusBar() {
  const d = terminal.describe(focusedSlotId);
  statusSlot.textContent = d.slot;
  statusAgent.textContent = d.agent;
  statusState.textContent = d.state;
}

/**
 * Route server→client messages. Lights update ONLY on `state`.
 * @param {object} msg
 */
function onMessage(msg) {
  switch (msg.type) {
    case 'ready':
      keyboard.setLcd(msg.tmux ? 'host ready · tmux ok' : 'host ready · tmux unavailable');
      break;
    case 'state':
      // Sole path that may change agent key lights / tab dots.
      if (typeof msg.focusedSlotId === 'number' || msg.focusedSlotId === null) {
        focusedSlotId = msg.focusedSlotId;
      }
      keyboard.applyState(msg);
      terminal.applyState(msg);
      if (focusedSlotId != null) terminal.setFocused(focusedSlotId);
      refreshStatusBar();
      break;
    case 'term_output':
      // Intentionally does NOT touch lights.
      if (typeof msg.slotId === 'number' && typeof msg.data === 'string') {
        terminal.writeOutput(msg.slotId, msg.data);
      }
      break;
    case 'log':
      if (typeof msg.message === 'string') {
        keyboard.setLcd(msg.message);
      }
      break;
    case 'error':
      if (typeof msg.message === 'string') {
        keyboard.setLcd(`error: ${msg.message}`);
      }
      break;
    default:
      break;
  }
}

function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}`;
  setConn('connecting');
  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    setConn('connected');
    send({ type: 'subscribe' });
  });

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    onMessage(msg);
  });

  ws.addEventListener('close', () => {
    setConn('disconnected');
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    setConn('disconnected', 'error');
    try { ws?.close(); } catch { /* ignore */ }
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

connect();
