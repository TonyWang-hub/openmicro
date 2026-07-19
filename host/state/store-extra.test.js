import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './agent-state-store.js';

describe('AgentStateStore.dropSlot', () => {
  it('removes an existing slot and fires onChange', () => {
    const changes = [];
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000, onChange: (s) => changes.push(s) });
    const id = store.resolveSession({ sessionKey: 's1', agent: 'claude-code' });
    assert.equal(store.snapshot().length, 1);
    const before = changes.length;
    store.dropSlot(id);
    assert.equal(store.snapshot().length, 0);
    assert.ok(changes.length > before, 'dropSlot must emit onChange');
  });

  it('is idempotent — dropping a non-existent slot does nothing and does not emit', () => {
    const changes = [];
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000, onChange: (s) => changes.push(s) });
    store.resolveSession({ sessionKey: 's1', agent: 'claude-code' });
    changes.length = 0;
    store.dropSlot(999);
    assert.equal(store.snapshot().length, 1);
    assert.equal(changes.length, 0, 'dropping a slot that was never bound must not emit onChange');

    // Dropping the same slot twice in a row is also a no-op the second time.
    const id = store.snapshot()[0].slotId;
    store.dropSlot(id);
    changes.length = 0;
    store.dropSlot(id);
    assert.equal(changes.length, 0);
  });
});

describe('AgentStateStore.slotCwd / tmuxTargetForSlot — presence/absence', () => {
  it('returns the stored value when present', () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const id = store.resolveSession({ sessionKey: 's1', agent: 'claude-code', cwd: '/home/me/proj', tmuxTarget: 'work-1' });
    assert.equal(store.slotCwd(id), '/home/me/proj');
    assert.equal(store.tmuxTargetForSlot(id), 'work-1');
  });

  it('returns null when the slot has no cwd/tmuxTarget recorded', () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const id = store.resolveSession({ sessionKey: 's1', agent: 'claude-code' });
    assert.equal(store.slotCwd(id), null);
    assert.equal(store.tmuxTargetForSlot(id), null);
  });

  it('returns null for a slotId that was never bound', () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    assert.equal(store.slotCwd(42), null);
    assert.equal(store.tmuxTargetForSlot(42), null);
  });
});

describe('AgentStateStore.resolveSession — updates on repeat sight', () => {
  it('updates cwd/label/tmuxTarget/cmuxTarget on an already-bound session', () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const id = store.resolveSession({
      sessionKey: 's1', agent: 'claude-code', label: 'projA', cwd: '/old/dir', tmuxTarget: 'old-tmux',
    });
    const idAgain = store.resolveSession({
      sessionKey: 's1', agent: 'claude-code', label: 'projA-renamed', cwd: '/new/dir',
      tmuxTarget: 'new-tmux', cmuxTarget: 'NEW-SURF',
    });
    assert.equal(idAgain, id, 'must reuse the same slot, not allocate a new one');
    const slot = store.snapshot().find((s) => s.slotId === id);
    assert.equal(slot.label, 'projA-renamed');
    assert.equal(slot.cwd, '/new/dir');
    assert.equal(slot.tmuxTarget, 'new-tmux');
    assert.equal(slot.cmuxTarget, 'NEW-SURF');
  });

  it('leaves existing fields untouched when the repeat call omits them (nullish)', () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const id = store.resolveSession({ sessionKey: 's1', agent: 'claude-code', label: 'projA', cwd: '/dir', tmuxTarget: 'tmux-1' });
    store.resolveSession({ sessionKey: 's1', agent: 'claude-code' }); // no label/cwd/tmuxTarget passed
    const slot = store.snapshot().find((s) => s.slotId === id);
    assert.equal(slot.label, 'projA');
    assert.equal(slot.cwd, '/dir');
    assert.equal(slot.tmuxTarget, 'tmux-1');
  });
});

describe('AgentStateStore.snapshot — cwd field', () => {
  it('snapshot entries include a cwd field (null when absent, value when present)', () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const withCwd = store.resolveSession({ sessionKey: 's1', agent: 'claude-code', cwd: '/home/me/proj' });
    const withoutCwd = store.resolveSession({ sessionKey: 's2', agent: 'claude-code' });
    const snap = store.snapshot();
    assert.equal(snap.find((s) => s.slotId === withCwd).cwd, '/home/me/proj');
    assert.equal(snap.find((s) => s.slotId === withoutCwd).cwd, null);
    // field must exist (not merely undefined-and-absent) on every entry
    for (const s of snap) {
      assert.ok(Object.prototype.hasOwnProperty.call(s, 'cwd'));
    }
  });
});
