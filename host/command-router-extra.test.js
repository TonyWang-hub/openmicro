import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './state/agent-state-store.js';
import { createCommandRouter } from './command-router.js';

function cmd(slotId, action, extra = {}) {
  return { v: 1, slotId, action, ts: new Date().toISOString(), ...extra };
}

describe('createCommandRouter — dead surface cleanup on prompt', () => {
  it('prompt targeting a dead cmux surface drops the slot and logs, without emitting error', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const id = store.resolveSession({ sessionKey: 's', agent: 'claude-code', label: 'proj', cmuxTarget: 'GONE-SURF' });
    const emitted = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async () => {}, sendKeys: async () => {} },
      cmux: {
        sendKeys: async () => {},
        sendText: async () => { throw new Error('surface not found'); },
        createSession: async () => {},
      },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp',
      attachPty: () => {},
      emit: (msg) => emitted.push(msg),
    });

    await router.handleCommand(cmd(id, 'prompt', { text: '继续' }));

    assert.equal(store.snapshot().length, 0, 'dead slot must be dropped');
    assert.ok(!emitted.some((m) => m.type === 'error'), 'must not surface a raw error for a dead surface');
    assert.ok(
      emitted.some((m) => m.type === 'log' && m.level === 'info' && /已关闭|已从灯位移除/.test(m.message)),
      'must emit a friendly cleanup log',
    );
  });
});

describe('createCommandRouter — unbound slot targeting', () => {
  function makeRouter(emitted) {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async () => {}, sendKeys: async () => {} },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp',
      attachPty: () => {},
      emit: (msg) => emitted.push(msg),
    });
    return { store, router };
  }

  it('prompt on an unbound slot fails with an error (no throw, no crash)', async () => {
    const emitted = [];
    const { router } = makeRouter(emitted);
    await router.handleCommand(cmd(7, 'prompt', { text: 'hi' }));
    assert.ok(emitted.some((m) => m.type === 'error' && /slot 7 not bound/.test(m.message)));
  });

  it('accept on an unbound slot fails with an error', async () => {
    const emitted = [];
    const { router } = makeRouter(emitted);
    await router.handleCommand(cmd(9, 'accept'));
    assert.ok(emitted.some((m) => m.type === 'error' && /slot 9 not bound/.test(m.message)));
  });
});

describe('createCommandRouter — new_session requires no slotId', () => {
  it('new_session without a slotId does not fail on the slotId check', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const tmuxCalls = [];
    const emitted = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async (o) => tmuxCalls.push(o), sendKeys: async () => {} },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp/work',
      attachPty: () => {},
      emit: (msg) => emitted.push(msg),
    });
    // Deliberately omit slotId entirely.
    await router.handleCommand({ v: 1, action: 'new_session', ts: new Date().toISOString() });
    assert.ok(!emitted.some((m) => m.type === 'error'), 'new_session must not require an integer slotId');
    assert.equal(tmuxCalls.length, 1);
    assert.equal(tmuxCalls[0].cwd, '/tmp/work');
  });
});

describe('createCommandRouter — unknown action', () => {
  it('an unrecognized action fails with a descriptive error', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    const id = store.resolveSession({ sessionKey: 's', agent: 'claude-code', tmuxTarget: 'tmux-0' });
    const emitted = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async () => {}, sendKeys: async () => {} },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp',
      attachPty: () => {},
      emit: (msg) => emitted.push(msg),
    });
    await router.handleCommand(cmd(id, 'teleport'));
    assert.ok(emitted.some((m) => m.type === 'error' && /unknown action: teleport/.test(m.message)));
  });
});
