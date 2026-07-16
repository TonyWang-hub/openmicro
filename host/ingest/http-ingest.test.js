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
  it('valid hooks → store becomes thinking', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' });

    const bindings = new Map([
      ['cms-claude-0', { slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' }],
    ]);

    const handler = createIngestHandler({
      store,
      resolveBinding: (sessionKey) => bindings.get(sessionKey) ?? null,
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
          sessionKey: 'cms-claude-0',
          payload: { hookEventName: 'PreToolUse' },
        }),
      });

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true });
      assert.equal(store.snapshot()[0].state, 'thinking');
    } finally {
      server.close();
    }
  });

  it('unknown sessionKey → 400 and store unchanged', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' });

    const bindings = new Map([
      ['cms-claude-0', { slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' }],
    ]);

    const handler = createIngestHandler({
      store,
      resolveBinding: (sessionKey) => bindings.get(sessionKey) ?? null,
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
          sessionKey: 'cms-claude-UNKNOWN',
          payload: { hookEventName: 'PreToolUse' },
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.ok(body.error);
      assert.equal(store.snapshot()[0].state, 'unknown');
    } finally {
      server.close();
    }
  });
});
