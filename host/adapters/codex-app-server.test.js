import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCodexAppServerIngest } from './codex-app-server.js';
import { createStore } from '../state/agent-state-store.js';

const binding = { slotId: 1, agent: 'codex', sessionKey: 'cms-codex-1' };

function makeStore() {
  const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
  store.bindSlot(binding);
  return store;
}

describe('createCodexAppServerIngest', () => {
  it('enabled=false does not connect', async () => {
    let connectCalls = 0;
    const logs = [];
    const ingest = createCodexAppServerIngest({
      enabled: false,
      store: makeStore(),
      binding,
      onLog: (entry) => logs.push(entry),
      createTransport: async () => {
        connectCalls += 1;
        return { on() {}, close() {} };
      },
    });

    const result = await ingest.start();

    assert.equal(connectCalls, 0);
    assert.equal(result.connected, false);
    assert.equal(result.reason, 'disabled');
    assert.equal(logs.length, 0);
  });

  it('maps status events through mapCodexAppServerStatus into store', async () => {
    const store = makeStore();
    /** @type {{ on: Function, close: Function, emitStatus?: Function }} */
    let transport;
    const ingest = createCodexAppServerIngest({
      enabled: true,
      store,
      binding,
      createTransport: async () => {
        const handlers = new Map();
        transport = {
          on(event, handler) {
            handlers.set(event, handler);
          },
          close() {},
          emitStatus(raw) {
            handlers.get('status')?.(raw);
          },
        };
        return transport;
      },
    });

    const result = await ingest.start();
    assert.equal(result.connected, true);

    transport.emitStatus({ state: 'running' });
    assert.equal(store.snapshot()[0].state, 'thinking');

    transport.emitStatus({ state: 'awaiting_approval' });
    assert.equal(store.snapshot()[0].state, 'needs_input');

    transport.emitStatus({ state: 'succeeded' });
    assert.equal(store.snapshot()[0].state, 'complete');
  });

  it('connect failure emits warn and does not throw', async () => {
    const logs = [];
    const ingest = createCodexAppServerIngest({
      enabled: true,
      store: makeStore(),
      binding,
      onLog: (entry) => logs.push(entry),
      createTransport: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    const result = await ingest.start();

    assert.equal(result.connected, false);
    assert.equal(result.reason, 'connect-failed');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].level, 'warn');
    assert.match(logs[0].message, /ECONNREFUSED/);
  });

  it('ignores unmapped status states', async () => {
    const store = makeStore();
    let emitStatus;
    const ingest = createCodexAppServerIngest({
      enabled: true,
      store,
      binding,
      createTransport: async () => {
        const handlers = new Map();
        emitStatus = (raw) => handlers.get('status')?.(raw);
        return {
          on(event, handler) { handlers.set(event, handler); },
          close() {},
        };
      },
    });

    await ingest.start();
    emitStatus({ state: 'pending' });
    assert.equal(store.snapshot()[0].state, 'unknown');
  });

  it('stop closes transport when connected', async () => {
    let closed = false;
    const ingest = createCodexAppServerIngest({
      enabled: true,
      store: makeStore(),
      binding,
      createTransport: async () => ({
        on() {},
        close() { closed = true; },
      }),
    });

    await ingest.start();
    await ingest.stop();
    assert.equal(closed, true);
  });
});
