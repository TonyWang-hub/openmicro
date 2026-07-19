import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './agent-state-store.js';

describe('AgentStateStore.resolveSession (auto-assign)', () => {
  const mk = () => createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000, maxSlots: 3 });

  it('assigns a fresh slot on first sight and reuses it on repeat', () => {
    const store = mk();
    const a = store.resolveSession({ sessionKey: 's1', agent: 'claude-code', label: 'projA' });
    const aAgain = store.resolveSession({ sessionKey: 's1', agent: 'claude-code', label: 'projA' });
    const b = store.resolveSession({ sessionKey: 's2', agent: 'codex', label: 'projB' });
    assert.equal(a, aAgain);
    assert.notEqual(a, b);
    assert.equal(store.snapshot().length, 2);
    assert.equal(store.snapshot().find((s) => s.slotId === a).label, 'projA');
  });

  it('records tmuxTarget and exposes it via tmuxTargetForSlot', () => {
    const store = mk();
    const id = store.resolveSession({ sessionKey: 's1', agent: 'claude-code', tmuxTarget: 'work-1' });
    assert.equal(store.tmuxTargetForSlot(id), 'work-1');
    const none = store.resolveSession({ sessionKey: 's2', agent: 'claude-code' });
    assert.equal(store.tmuxTargetForSlot(none), null);
  });

  it('LRU-evicts the oldest recyclable slot when full, protecting needs_input', () => {
    let t = 1000;
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000, maxSlots: 2, now: () => t });
    const s1 = store.resolveSession({ sessionKey: 's1', agent: 'claude-code' });
    t = 1010;
    const s2 = store.resolveSession({ sessionKey: 's2', agent: 'claude-code' });
    // s1 is waiting for the user (protected); s2 is idle (recyclable).
    store.applyEvent({ v: 1, slotId: s1, agent: 'claude-code', sessionKey: 's1', state: 'needs_input', ts: new Date(t).toISOString(), source: 'cc-hooks' });
    store.applyEvent({ v: 1, slotId: s2, agent: 'claude-code', sessionKey: 's2', state: 'idle', ts: new Date(t).toISOString(), source: 'cc-hooks' });
    t = 1020;
    const s3 = store.resolveSession({ sessionKey: 's3', agent: 'claude-code' });
    // s3 must reuse s2's slot (idle, recyclable), NOT s1's (needs_input).
    assert.equal(s3, s2);
    const keys = store.snapshot().map((s) => s.sessionKey).sort();
    assert.deepEqual(keys, ['s1', 's3']);
  });

  it('falls back to oldest overall when every slot is active (non-recyclable)', () => {
    let t = 1000;
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000, maxSlots: 2, now: () => t });
    const s1 = store.resolveSession({ sessionKey: 's1', agent: 'claude-code' });
    t = 1010;
    const s2 = store.resolveSession({ sessionKey: 's2', agent: 'claude-code' });
    store.applyEvent({ v: 1, slotId: s1, agent: 'claude-code', sessionKey: 's1', state: 'thinking', ts: new Date(1005).toISOString(), source: 'cc-hooks' });
    store.applyEvent({ v: 1, slotId: s2, agent: 'claude-code', sessionKey: 's2', state: 'thinking', ts: new Date(1015).toISOString(), source: 'cc-hooks' });
    t = 1020;
    const s3 = store.resolveSession({ sessionKey: 's3', agent: 'claude-code' });
    assert.equal(s3, s1); // s1 is older → evicted
  });
});

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
      schedule: () => 1,
      clearSchedule: () => {},
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

  it('schedules precise completeHold timer (not only 1s tick)', () => {
    let now = 1_000_000;
    /** @type {{ fn: () => void, ms: number }[]} */
    const scheduled = [];
    const store = createStore({
      completeHoldMs: 2000,
      ingestStaleMs: 30_000,
      now: () => now,
      schedule: (fn, ms) => {
        scheduled.push({ fn, ms });
        return scheduled.length;
      },
      clearSchedule: () => {},
    });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 's' });
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 's',
      state: 'complete', ts: new Date(now).toISOString(), source: 'cc-hooks',
    });
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].ms, 2000);
    assert.equal(store.snapshot()[0].state, 'complete');

    now += 2000;
    scheduled[0].fn();
    assert.equal(store.snapshot()[0].state, 'idle');
  });

  it('cancels complete timer when a non-complete event arrives', () => {
    let now = 1_000_000;
    /** @type {number[]} */
    const cleared = [];
    let nextId = 1;
    const store = createStore({
      completeHoldMs: 2000,
      ingestStaleMs: 30_000,
      now: () => now,
      schedule: () => nextId++,
      clearSchedule: (id) => { cleared.push(/** @type {number} */ (id)); },
    });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 's' });
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 's',
      state: 'complete', ts: new Date(now).toISOString(), source: 'cc-hooks',
    });
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 's',
      state: 'thinking', ts: new Date(now).toISOString(), source: 'cc-hooks',
    });
    assert.equal(cleared.length, 1);
    assert.equal(store.snapshot()[0].state, 'thinking');
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

  it('needs_input survives the stale sweep (agent waiting for approval emits no events)', () => {
    let now = 0;
    const store = createStore({
      ingestStaleMs: 30_000,
      now: () => now,
      schedule: () => null,
      clearSchedule: () => {},
    });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 's' });
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 's',
      state: 'needs_input', ts: new Date(now).toISOString(), source: 'cc-hooks',
    });
    now += 300_000; // five silent minutes at the permission prompt
    store.tick(now);
    assert.equal(store.snapshot()[0].state, 'needs_input');
  });
});
