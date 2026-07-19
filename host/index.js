import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig } from './config.js';
import { createAuth, isLoopbackAddress } from './auth.js';
import { createRateLimiter, isOriginAllowed, isNonLoopbackHost } from './security.js';
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
import { deletePtyIfCurrent } from './tmux/pty-map.js';
import { createCmuxClient } from './cmux/client.js';
import { createHub } from './ws/hub.js';
import { createCommandRouter } from './command-router.js';
import { createCodexAppServerIngest } from './adapters/codex-app-server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT, 'web');

/** Static vendor roots served under /vendor/* from node_modules. */
const VENDOR_ROOTS = Object.freeze({
  '/vendor/xterm': path.join(ROOT, 'node_modules', '@xterm', 'xterm'),
  '/vendor/addon-fit': path.join(ROOT, 'node_modules', '@xterm', 'addon-fit'),
  '/vendor/qrcode': path.join(ROOT, 'node_modules', 'qrcode-generator', 'dist'),
});

/** Inline pairing-guidance page served for GET /m when auth fails (never a bare 401). */
const PAIRING_GUIDANCE_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>codex-micro-sim · 需要配对</title>
  <style>
    body {
      font-family: ui-monospace, monospace;
      background: #111;
      color: #ddd;
      padding: 2rem;
      text-align: center;
    }
    h1 { font-size: 1rem; color: #fff; }
  </style>
</head>
<body>
  <h1>请从电脑上的 /pair 二维码进入</h1>
  <p>这台手机还没有配对 token，或 token 已失效。</p>
  <p>打开电脑浏览器访问 <code>/pair</code>，扫码或复制链接重新进入。</p>
</body>
</html>
`;

/**
 * Pick a LAN-reachable IPv4 for the mobile pairing URL: the first
 * non-internal IPv4 interface. Falls back to 127.0.0.1 (with a console
 * hint to set CMS_HOST) when no such interface is found.
 */
function detectLanIp() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  console.warn('[cms] no LAN IPv4 interface found; pairing URL falls back to 127.0.0.1 (set CMS_HOST to override)');
  return '127.0.0.1';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Resolve the cmux CLI binary: an explicit config path wins; otherwise prefer
 * `cmux` on PATH (execFile finds it), falling back to the macOS bundled binary
 * so the Host — which itself runs outside cmux — can still inject.
 * @param {string} configured
 * @returns {string}
 */
function resolveCmuxBin(configured) {
  if (configured && configured !== 'cmux') return configured;
  const bundled = '/Applications/cmux.app/Contents/Resources/bin/cmux';
  if (configured === 'cmux') {
    // Keep 'cmux' (PATH lookup) unless it's clearly absent and the bundle exists.
    try {
      if (fs.existsSync(bundled)) {
        // Prefer PATH `cmux` if present; else use the bundle.
        const onPath = (process.env.PATH || '').split(':').some((d) => d && fs.existsSync(path.join(d, 'cmux')));
        return onPath ? 'cmux' : bundled;
      }
    } catch { /* ignore */ }
  }
  return configured || 'cmux';
}

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
 * Resolve a /vendor/... URL to a file under node_modules, or null.
 * @param {string} urlPath
 * @returns {string | null}
 */
function safeVendorPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
  for (const [prefix, root] of Object.entries(VENDOR_ROOTS)) {
    if (decoded === prefix || decoded.startsWith(`${prefix}/`)) {
      const rel = decoded.slice(prefix.length).replace(/^\//, '');
      if (!rel) return null;
      const full = path.normalize(path.join(root, rel));
      if (!full.startsWith(root)) return null;
      return full;
    }
  }
  return null;
}

/**
 * @param {string} filePath
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, string>} [extraHeaders] merged onto the 200 response
 *   (e.g. Set-Cookie); content-type is derived from the extension unless overridden.
 */
function sendFile(filePath, res, extraHeaders) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      res.end(err.code === 'ENOENT' ? 'not found' : 'error');
      return;
    }
    const ext = path.extname(filePath);
    const headers = { 'content-type': MIME[ext] || 'application/octet-stream', ...extraHeaders };
    res.writeHead(200, headers);
    res.end(data);
  });
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function serveStatic(req, res) {
  const url = req.url || '/';
  const vendorPath = safeVendorPath(url);
  if (vendorPath) {
    sendFile(vendorPath, res);
    return;
  }
  const filePath = safeWebPath(url);
  if (!filePath) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  sendFile(filePath, res);
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

  // Boot-time safety check: an open (non-loopback) bind with no operator-
  // supplied token means anyone on the network gets in via the auto-random
  // token printed to this console only — flag it loudly. Behavior is
  // unchanged (a random token is still generated below); this is purely a
  // diagnostic so an operator doesn't accidentally expose the Host.
  if (isNonLoopbackHost(config.host) && !config.token) {
    console.warn('!'.repeat(60));
    console.warn(`[cms] 警告: CMS_HOST=${config.host} 对外开放，但未设置 CMS_TOKEN。`);
    console.warn('[cms] 将自动生成随机 token；若非预期，请立即设置 CMS_TOKEN 或改回 127.0.0.1。');
    console.warn('!'.repeat(60));
  }

  if (!config.token) {
    config.token = crypto.randomBytes(8).toString('hex');
  }

  const ingestLimiter = createRateLimiter(config.rateLimit.ingest);
  const wsCommandLimiter = createRateLimiter(config.rateLimit.wsCommand);
  const auth = createAuth({ token: config.token });
  const lanIp = detectLanIp();
  const mobileUrl = `http://${lanIp}:${config.port}/m?token=${config.token}`;

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
  /**
   * Defer startup reattach until first WS `subscribe` so the initial tmux
   * redraw lands after a client is listening (pragmatic MVP; no ring buffer).
   * @type {Map<number, string>}
   */
  const pendingAttach = new Map();

  /** @type {ReturnType<typeof createCommandRouter> | null} */
  let router = null;

  /**
   * @param {number} slotId
   * @param {string} sessionKey
   */
  function attachPty(slotId, sessionKey) {
    pendingAttach.delete(slotId);
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
        // Only delete if this exit belongs to the current Map entry
        // (reattach may have replaced the session before stale onExit fires).
        deletePtyIfCurrent(ptys, slotId, session);
        hub.broadcast({
          type: 'log',
          level: 'info',
          message: `pty exit slot=${slotId} code=${code}`,
        });
      },
    });
    ptys.set(slotId, session);
  }

  function flushPendingAttaches() {
    const entries = [...pendingAttach.entries()];
    pendingAttach.clear();
    for (const [slotId, sessionKey] of entries) {
      try {
        attachPty(slotId, sessionKey);
        hub.broadcast({
          type: 'log',
          level: 'info',
          message: `attached existing session ${sessionKey}`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[cms] deferred attach failed:', message);
      }
    }
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

  // Resolve the cmux CLI: configured path → `cmux` on PATH → bundled app binary.
  const cmuxBin = resolveCmuxBin(config.cmuxBin);
  router = createCommandRouter({
    store,
    tmux: { sessionExists, newSession, sendKeys },
    cmux: createCmuxClient({ bin: cmuxBin }),
    keymap: config.keymap,
    commands: config.commands,
    defaultCwd: config.defaultCwd,
    attachPty,
    emit: (msg) => hub.broadcast(msg),
  });

  // Slots are assigned dynamically per live session_id (store.resolveSession).
  // Any statically pre-configured slots in config.slots are still honored
  // (e.g. a pinned demo/manual binding), but the default is no static slots.
  for (const slot of config.slots) {
    store.bindSlot(slot);
    if (tmuxOk) {
      try {
        if (await sessionExists(slot.sessionKey)) {
          // Delay attach until first WS subscribe (see flushPendingAttaches).
          pendingAttach.set(slot.slotId, slot.sessionKey);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[cms] attach check failed:', message);
      }
    }
  }

  const handleIngest = createIngestHandler({
    store,
    mapRaw: createAdapterMapRaw({ codexAppServerEnabled: config.codexAppServerEnabled }),
  });

  /** @type {ReturnType<typeof createCodexAppServerIngest> | null} */
  let appServerIngest = null;
  if (config.codexAppServerEnabled) {
    // Experimental app-server path: no static codex slot exists by default, so
    // synthesize a dynamically-assigned one keyed on a fixed sessionKey.
    const codexBinding = config.slots.find((s) => s.agent === 'codex')
      ?? { slotId: store.resolveSession({ sessionKey: 'cms-codex-appserver', agent: 'codex', label: 'codex' }), agent: 'codex', sessionKey: 'cms-codex-appserver' };
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

  const server = http.createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] || '/';

    if (!isOriginAllowed(req, config.allowedOrigins)) {
      res.writeHead(403);
      res.end('forbidden origin');
      return;
    }

    if (pathname === '/api/health') {
      if (!tmuxOk) {
        sendJson(res, 503, { ok: false, tmux: false, error: tmuxError || 'tmux not found' });
        return;
      }
      sendJson(res, 200, { ok: true, tmux: true });
      return;
    }

    if (pathname === '/api/pair') {
      const remoteAddress = req.socket?.remoteAddress;
      if (!isLoopbackAddress(remoteAddress)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      sendJson(res, 200, { mobileUrl });
      return;
    }

    if (pathname === '/ingest/hook') {
      const remoteAddress = req.socket?.remoteAddress;
      if (!isLoopbackAddress(remoteAddress) && !ingestLimiter.allow(remoteAddress)) {
        console.warn(`[cms] rate limit: dropped /ingest/hook from ${remoteAddress}`);
        sendJson(res, 429, { ok: false, error: 'rate limited' });
        return;
      }
      await handleIngest(req, res);
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (pathname === '/m') {
        if (!auth.check(req)) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(PAIRING_GUIDANCE_HTML);
          return;
        }
        // Set an auth cookie so the browser's subsequent same-origin
        // sub-resource requests (ES module imports, stylesheet) pass auth —
        // those requests carry neither the ?token= query nor the header.
        // HttpOnly (never read by JS; live.js uses the URL token), SameSite=Lax.
        const headers = { 'content-type': 'text/html; charset=utf-8' };
        if (config.token) {
          headers['set-cookie'] =
            `cms_token=${encodeURIComponent(config.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`;
        }
        // web/m.html is produced by another agent and may not exist yet;
        // a plain 404 from sendFile is fine per spec.
        sendFile(path.join(WEB_DIR, 'm.html'), res, headers);
        return;
      }

      if (!auth.check(req)) {
        res.writeHead(401);
        res.end('unauthorized');
        return;
      }

      if (pathname === '/pair') {
        sendFile(path.join(WEB_DIR, 'pair.html'), res);
        return;
      }

      // Serve the service worker from the ROOT path with Service-Worker-Allowed: /
      // so its scope can cover /m (a worker at /toy/sw.js could only claim
      // /toy/). Same file, just reachable at the root so PWA offline works.
      if (pathname === '/sw.js') {
        sendFile(path.join(WEB_DIR, 'toy', 'sw.js'), res, { 'service-worker-allowed': '/' });
        return;
      }

      serveStatic(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!isOriginAllowed(req, config.allowedOrigins)) {
      socket.destroy();
      return;
    }
    if (!auth.check(req)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const remoteAddress = req?.socket?.remoteAddress;
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
            // First subscribe flushes deferred reattach so initial screen
            // redraw is not broadcast into an empty client set.
            flushPendingAttaches();
            break;
          case 'command':
            if (!isLoopbackAddress(remoteAddress) && !wsCommandLimiter.allow(remoteAddress)) {
              console.warn(`[cms] rate limit: dropped WS command from ${remoteAddress}`);
              hub.send(ws, { type: 'error', message: 'rate limited' });
              break;
            }
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

  server.listen(config.port, config.host, () => {
    console.log(`[cms] listening on http://${config.host}:${config.port} (tmux=${tmuxOk})`);
    if (config.host === '127.0.0.1' || config.host === 'localhost') {
      console.log(`[cms] mobile pairing (需先 CMS_HOST=0.0.0.0 重启，否则手机连不上): ${mobileUrl}`);
    } else {
      console.log(`[cms] mobile pairing: ${mobileUrl}`);
    }
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
