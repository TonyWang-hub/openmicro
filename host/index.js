import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { createStore } from './state/agent-state-store.js';
import { createIngestHandler, createAdapterMapRaw } from './ingest/http-ingest.js';
import {
  ensureTmux,
  sessionExists,
  newSession,
  sendKeys,
  TmuxNotFoundError,
} from './tmux/client.js';
import { createPtySession } from './tmux/pty-session.js';
import { createHub } from './ws/hub.js';
import { createCommandRouter } from './command-router.js';
import { createCodexAppServerIngest } from './adapters/codex-app-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function ensureWebPlaceholder() {
  if (!fs.existsSync(WEB_DIR)) {
    fs.mkdirSync(WEB_DIR, { recursive: true });
  }
  const indexPath = path.join(WEB_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(
      indexPath,
      `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>codex-micro-sim</title>
  <style>
    body { font-family: ui-monospace, monospace; background: #111; color: #ddd; padding: 2rem; }
  </style>
</head>
<body>
  <h1>codex-micro-sim</h1>
  <p>Host is up. Web UI lands in Task 9.</p>
</body>
</html>
`,
      'utf8',
    );
  }
}

/**
 * @param {string} urlPath
 */
function safeWebPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\//, '');
  const full = path.normalize(path.join(WEB_DIR, rel));
  if (!full.startsWith(WEB_DIR)) return null;
  return full;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function serveStatic(req, res) {
  const filePath = safeWebPath(req.url || '/');
  if (!filePath) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'not found' : 'error');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {object} body
 */
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function main() {
  const config = loadConfig();
  ensureWebPlaceholder();

  let tmuxOk = false;
  let tmuxError = null;
  try {
    await ensureTmux();
    tmuxOk = true;
  } catch (err) {
    tmuxError = err instanceof TmuxNotFoundError
      ? err.message
      : (err instanceof Error ? err.message : String(err));
    console.error('[cms] tmux unavailable:', tmuxError);
  }

  const hub = createHub();
  /** @type {Map<number, ReturnType<typeof createPtySession>>} */
  const ptys = new Map();

  /** @type {ReturnType<typeof createCommandRouter> | null} */
  let router = null;

  /**
   * @param {number} slotId
   * @param {string} sessionKey
   */
  function attachPty(slotId, sessionKey) {
    const prev = ptys.get(slotId);
    if (prev) {
      try { prev.dispose(); } catch { /* ignore */ }
      ptys.delete(slotId);
    }
    const session = createPtySession({
      sessionKey,
      onData: (data) => {
        hub.broadcast({ type: 'term_output', slotId, data });
      },
      onExit: (code) => {
        ptys.delete(slotId);
        hub.broadcast({
          type: 'log',
          level: 'info',
          message: `pty exit slot=${slotId} code=${code}`,
        });
      },
    });
    ptys.set(slotId, session);
  }

  const store = createStore({
    completeHoldMs: config.completeHoldMs,
    ingestStaleMs: config.ingestStaleMs,
    onChange: () => {
      hub.broadcast({
        type: 'state',
        slots: store.snapshot(),
        focusedSlotId: router?.getFocusedSlotId() ?? null,
      });
    },
  });

  router = createCommandRouter({
    store,
    tmux: { sessionExists, newSession, sendKeys },
    keymap: config.keymap,
    commands: config.commands,
    defaultCwd: config.defaultCwd,
    attachPty,
    emit: (msg) => hub.broadcast(msg),
  });

  /** @type {Map<string, { slotId: number, agent: string, sessionKey: string }>} */
  const bindingsBySession = new Map();

  for (const slot of config.slots) {
    store.bindSlot(slot);
    bindingsBySession.set(slot.sessionKey, slot);
    if (tmuxOk) {
      try {
        if (await sessionExists(slot.sessionKey)) {
          attachPty(slot.slotId, slot.sessionKey);
          hub.broadcast({
            type: 'log',
            level: 'info',
            message: `attached existing session ${slot.sessionKey}`,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[cms] attach check failed:', message);
      }
    }
  }

  const handleIngest = createIngestHandler({
    store,
    resolveBinding: (sessionKey) => bindingsBySession.get(sessionKey) ?? null,
    mapRaw: createAdapterMapRaw({ codexAppServerEnabled: config.codexAppServerEnabled }),
  });

  /** @type {ReturnType<typeof createCodexAppServerIngest> | null} */
  let appServerIngest = null;
  if (config.codexAppServerEnabled) {
    const codexBinding = config.slots.find((s) => s.agent === 'codex');
    if (codexBinding) {
      appServerIngest = createCodexAppServerIngest({
        enabled: true,
        store,
        binding: codexBinding,
        onLog: ({ level, message }) => {
          console.warn(`[cms] ${message}`);
          hub.broadcast({ type: 'log', level, message });
        },
      });
      // Connect failures warn only — never crash Host.
      await appServerIngest.start();
    }
  }

  const server = http.createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] || '/';

    if (pathname === '/api/health') {
      if (!tmuxOk) {
        sendJson(res, 503, { ok: false, tmux: false, error: tmuxError || 'tmux not found' });
        return;
      }
      sendJson(res, 200, { ok: true, tmux: true });
      return;
    }

    if (pathname === '/ingest/hook') {
      await handleIngest(req, res);
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws) => {
    hub.add(ws);
    hub.send(ws, {
      type: 'ready',
      tmux: tmuxOk,
      ingestHint: 'POST /ingest/hook',
    });
    hub.send(ws, {
      type: 'state',
      slots: store.snapshot(),
      focusedSlotId: router.getFocusedSlotId(),
    });

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        hub.send(ws, { type: 'error', message: 'invalid JSON' });
        return;
      }

      try {
        switch (msg.type) {
          case 'subscribe':
            hub.send(ws, {
              type: 'state',
              slots: store.snapshot(),
              focusedSlotId: router.getFocusedSlotId(),
            });
            break;
          case 'command':
            await router.handleCommand(msg.payload);
            break;
          case 'term_input': {
            const pty = ptys.get(msg.slotId);
            if (!pty) {
              hub.send(ws, { type: 'error', message: `no pty for slot ${msg.slotId}` });
              break;
            }
            pty.write(typeof msg.data === 'string' ? msg.data : '');
            break;
          }
          case 'term_resize': {
            const pty = ptys.get(msg.slotId);
            if (!pty) break;
            const cols = Number(msg.cols);
            const rows = Number(msg.rows);
            if (cols > 0 && rows > 0) pty.resize(cols, rows);
            break;
          }
          default:
            hub.send(ws, { type: 'error', message: `unknown message type: ${msg.type}` });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        hub.send(ws, { type: 'error', message });
        hub.broadcast({ type: 'log', level: 'error', message });
      }
    });

    ws.on('close', () => hub.remove(ws));
  });

  const tickTimer = setInterval(() => {
    store.tick();
  }, 1000);
  tickTimer.unref?.();

  server.listen(config.port, () => {
    console.log(`[cms] listening on http://localhost:${config.port} (tmux=${tmuxOk})`);
  });

  function shutdown() {
    clearInterval(tickTimer);
    if (appServerIngest) {
      appServerIngest.stop().catch(() => {});
      appServerIngest = null;
    }
    for (const pty of ptys.values()) {
      try { pty.dispose(); } catch { /* ignore */ }
    }
    ptys.clear();
    wss.close();
    server.close();
  }

  process.on('SIGINT', () => { shutdown(); process.exit(0); });
  process.on('SIGTERM', () => { shutdown(); process.exit(0); });
}

main().catch((err) => {
  console.error('[cms] fatal:', err);
  process.exit(1);
});
