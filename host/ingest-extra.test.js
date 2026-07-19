import http from 'node:http';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './state/agent-state-store.js';
import { mapClaudeHook } from './adapters/claude-code.js';
import { createIngestHandler } from './ingest/http-ingest.js';

/**
 * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} handler
 */
function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/ingest/hook` });
    });
  });
}

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('createIngestHandler — cwd passthrough', () => {
  it('a POST carrying cwd shows up in the resolved slot snapshot', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const handler = createIngestHandler({
      store,
      mapRaw: (_agent, _channel, payload, binding) => mapClaudeHook(payload, binding),
    });
    const { server, url } = await startServer(handler);
    try {
      const res = await post(url, {
        agent: 'claude-code',
        channel: 'hooks',
        sessionKey: 'sess-cwd',
        cwd: '/home/me/proj',
        payload: { hookEventName: 'PreToolUse' },
      });
      assert.equal(res.status, 200);
      const snap = store.snapshot();
      assert.equal(snap.find((s) => s.sessionKey === 'sess-cwd').cwd, '/home/me/proj');
    } finally {
      server.close();
    }
  });
});

describe('createIngestHandler — optional field defaults', () => {
  it('label/tmuxTarget/cmuxTarget default to null when omitted from the body', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const handler = createIngestHandler({
      store,
      mapRaw: (_agent, _channel, payload, binding) => mapClaudeHook(payload, binding),
    });
    const { server, url } = await startServer(handler);
    try {
      const res = await post(url, {
        agent: 'claude-code',
        channel: 'hooks',
        sessionKey: 'sess-bare',
        payload: { hookEventName: 'PreToolUse' },
      });
      assert.equal(res.status, 200);
      const slot = store.snapshot().find((s) => s.sessionKey === 'sess-bare');
      assert.equal(slot.label, null);
      assert.equal(slot.tmuxTarget, null);
      assert.equal(slot.cmuxTarget, null);
      assert.equal(slot.cwd, null);
    } finally {
      server.close();
    }
  });
});

describe('createIngestHandler — invalid body → 400', () => {
  it('a non-object JSON body (array) is rejected with 400', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const handler = createIngestHandler({ store });
    const { server, url } = await startServer(handler);
    try {
      const res = await post(url, JSON.stringify(['not', 'an', 'object']));
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.equal(store.snapshot().length, 0, 'no slot must be allocated for a rejected body');
    } finally {
      server.close();
    }
  });

  it('a scalar JSON body (string) is rejected with 400', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const handler = createIngestHandler({ store });
    const { server, url } = await startServer(handler);
    try {
      const res = await post(url, JSON.stringify('just a string'));
      assert.equal(res.status, 400);
    } finally {
      server.close();
    }
  });

  it('a body missing sessionKey is rejected with 400', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const handler = createIngestHandler({ store });
    const { server, url } = await startServer(handler);
    try {
      const res = await post(url, {
        agent: 'claude-code',
        channel: 'hooks',
        payload: { hookEventName: 'PreToolUse' },
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.match(body.error, /sessionKey/);
      assert.equal(store.snapshot().length, 0);
    } finally {
      server.close();
    }
  });

  it('a body with an empty-string sessionKey is rejected with 400', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const handler = createIngestHandler({ store });
    const { server, url } = await startServer(handler);
    try {
      const res = await post(url, {
        agent: 'claude-code',
        channel: 'hooks',
        sessionKey: '',
        payload: { hookEventName: 'PreToolUse' },
      });
      assert.equal(res.status, 400);
    } finally {
      server.close();
    }
  });
});
