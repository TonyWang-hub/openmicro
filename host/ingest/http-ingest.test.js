import http from 'node:http';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../state/agent-state-store.js';
import { mapClaudeHook } from '../adapters/claude-code.js';
import { createIngestHandler } from './http-ingest.js';

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

describe('createIngestHandler', () => {
  it('valid hooks → auto-assigned slot becomes thinking', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });

    const handler = createIngestHandler({
      store,
      mapRaw: (_agent, _channel, payload, binding) => mapClaudeHook(payload, binding),
    });

    const { server, url } = await startServer(handler);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agent: 'claude-code',
          channel: 'hooks',
          sessionKey: 'sess-abc',
          label: 'my-project',
          payload: { hookEventName: 'PreToolUse' },
        }),
      });

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      const snap = store.snapshot();
      assert.equal(snap[0].state, 'thinking');
      assert.equal(snap[0].sessionKey, 'sess-abc');
      assert.equal(snap[0].label, 'my-project');
    } finally {
      server.close();
    }
  });

  it('unknown/new sessionKey is auto-assigned (no 400) — two sessions get two slots', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });

    const handler = createIngestHandler({
      store,
      mapRaw: (_agent, _channel, payload, binding) => mapClaudeHook(payload, binding),
    });

    const { server, url } = await startServer(handler);
    const post = (sessionKey, label) => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: 'claude-code', channel: 'hooks', sessionKey, label,
        payload: { hookEventName: 'PreToolUse' },
      }),
    });
    try {
      assert.equal((await post('sess-1', 'projA')).status, 200);
      assert.equal((await post('sess-2', 'projB')).status, 200);
      const snap = store.snapshot();
      assert.equal(snap.length, 2);
      assert.deepEqual(snap.map((s) => s.sessionKey).sort(), ['sess-1', 'sess-2']);
      assert.deepEqual(snap.map((s) => s.label).sort(), ['projA', 'projB']);
    } finally {
      server.close();
    }
  });
});
