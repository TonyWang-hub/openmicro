import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './agent-state-store.js';

describe('AgentStateStore', () => {
  it('rejects event with mismatched sessionKey', () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' });
    const r = store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 'WRONG',
      state: 'thinking', ts: new Date().toISOString(), source: 'cc-hooks',
    });
    assert.equal(r.ok, false);
    assert.equal(store.snapshot()[0].state, 'unknown');
  });

  it('never derives state from pane text (API has no pane param)', () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 's' });
    assert.equal(typeof store.applyEvent, 'function');
    assert.equal(store.applyEvent.length, 1);
  });

  it('complete auto-returns to idle after hold', () => {
    let now = 1_000_000;
    const store = createStore({
      completeHoldMs: 2000,
      ingestStaleMs: 30_000,
      now: () => now,
    });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 's' });
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 's',
      state: 'complete', ts: new Date(now).toISOString(), source: 'cc-hooks',
    });
    assert.equal(store.snapshot()[0].state, 'complete');
    now += 2001;
    store.tick(now);
    assert.equal(store.snapshot()[0].state, 'idle');
  });

  it('stale thinking becomes unknown; idle does not', () => {
    let now = 1_000_000;
    const store = createStore({
      completeHoldMs: 2000,
      ingestStaleMs: 30_000,
      now: () => now,
    });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 's' });
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 's',
      state: 'thinking', ts: new Date(now).toISOString(), source: 'cc-hooks',
    });
    now += 30_001;
    store.tick(now);
    assert.equal(store.snapshot()[0].state, 'unknown');
    assert.equal(store.snapshot()[0].meta, 'detached');

    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 's',
      state: 'idle', ts: new Date(now).toISOString(), source: 'cc-hooks',
    });
    now += 60_000;
    store.tick(now);
    assert.equal(store.snapshot()[0].state, 'idle');
  });
});
