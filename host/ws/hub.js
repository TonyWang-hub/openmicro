/**
 * Minimal WS fan-out for control-plane JSON messages.
 */

/**
 * @typedef {{ readyState: number, send: (data: string) => void }} WsLike
 */

/**
 * @returns {{
 *   add: (ws: WsLike) => void,
 *   remove: (ws: WsLike) => void,
 *   broadcast: (msg: object) => void,
 *   send: (ws: WsLike, msg: object) => void,
 *   size: () => number,
 * }}
 */
export function createHub() {
  /** @type {Set<WsLike>} */
  const clients = new Set();

  /**
   * @param {WsLike} ws
   * @param {object} msg
   */
  function send(ws, msg) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(msg));
  }

  /**
   * @param {object} msg
   */
  function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }

  return {
    add(ws) {
      clients.add(ws);
    },
    remove(ws) {
      clients.delete(ws);
    },
    broadcast,
    send,
    size: () => clients.size,
  };
}
