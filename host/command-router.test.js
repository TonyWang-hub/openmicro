import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './state/agent-state-store.js';
import { createCommandRouter } from './command-router.js';

function makeFakes() {
  const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
  store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' });
  store.bindSlot({ slotId: 1, agent: 'codex', sessionKey: 'cms-codex-1' });

  const tmuxCalls = [];
  const ptyCalls = [];
  const emitted = [];

  const tmux = {
    sessionExists: async (name) => {
      tmuxCalls.push(['sessionExists', name]);
      return name === 'cms-claude-0' || name === 'existing';
    },
    newSession: async (opts) => {
      tmuxCalls.push(['newSession', opts]);
    },
    sendKeys: async (name, keys) => {
      tmuxCalls.push(['sendKeys', name, keys]);
    },
  };

  const router = createCommandRouter({
    store,
    tmux,
    keymap: {
      'claude-code': { accept: ['y', 'Enter'], reject: ['n', 'Enter'] },
      codex: { accept: ['y', 'Enter'], reject: ['n', 'Enter'] },
    },
    commands: { 'claude-code': 'claude', codex: 'codex' },
    defaultCwd: '/tmp/work',
    maxSlots: 6,
    attachPty: (slotId, sessionKey) => {
      ptyCalls.push(['attach', slotId, sessionKey]);
    },
    emit: (msg) => {
      emitted.push(msg);
    },
  });

  return { store, tmux, tmuxCalls, ptyCalls, emitted, router };
}

function cmd(slotId, action) {
  return { v: 1, slotId, action, ts: new Date().toISOString() };
}

describe('createCommandRouter', () => {
  it('accept sends keymap keys via tmux.sendKeys', async () => {
    const { router, tmuxCalls, store } = makeFakes();
    const before = store.snapshot()[0].state;
    await router.handleCommand(cmd(0, 'accept'));
    assert.deepEqual(tmuxCalls, [['sendKeys', 'cms-claude-0', ['y', 'Enter']]]);
    assert.equal(store.snapshot()[0].state, before);
  });

  it('reject sends reject keymap keys', async () => {
    const { router, tmuxCalls } = makeFakes();
    await router.handleCommand(cmd(1, 'reject'));
    assert.deepEqual(tmuxCalls, [['sendKeys', 'cms-codex-1', ['n', 'Enter']]]);
  });

  it('sendKeys failure emits error+log and does not change lights', async () => {
    const { store, emitted, router } = makeFakes();
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0',
      state: 'needs_input', ts: new Date().toISOString(), source: 'cc-hooks',
    });
    const tmux = {
      sessionExists: async () => false,
      newSession: async () => {},
      sendKeys: async () => {
        throw new Error('tmux send-keys failed');
      },
    };
    const r = createCommandRouter({
      store,
      tmux,
      keymap: { 'claude-code': { accept: ['y', 'Enter'], reject: ['n', 'Enter'] }, codex: { accept: ['y'], reject: ['n'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp',
      attachPty: () => {},
      emit: (msg) => emitted.push(msg),
    });
    await r.handleCommand(cmd(0, 'accept'));
    assert.equal(store.snapshot()[0].state, 'needs_input');
    assert.ok(emitted.some((m) => m.type === 'error'));
    assert.ok(emitted.some((m) => m.type === 'log' && m.level === 'error'));
  });

  it('new_session reattaches when tmux session already exists', async () => {
    const { router, tmuxCalls, ptyCalls } = makeFakes();
    await router.handleCommand(cmd(0, 'new_session'));
    assert.ok(tmuxCalls.some((c) => c[0] === 'sessionExists'));
    assert.ok(!tmuxCalls.some((c) => c[0] === 'newSession'));
    assert.deepEqual(ptyCalls, [['attach', 0, 'cms-claude-0']]);
  });

  it('new_session creates session and starts agent command when missing', async () => {
    const { router, tmuxCalls, ptyCalls } = makeFakes();
    await router.handleCommand(cmd(1, 'new_session'));
    assert.deepEqual(
      tmuxCalls.find((c) => c[0] === 'newSession'),
      ['newSession', { name: 'cms-codex-1', cwd: '/tmp/work', command: 'codex' }],
    );
    assert.deepEqual(ptyCalls, [['attach', 1, 'cms-codex-1']]);
  });

  it('new_session rejects when slot count would exceed maxSlots', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    for (let i = 0; i < 6; i++) {
      store.bindSlot({ slotId: i, agent: i % 2 === 0 ? 'claude-code' : 'codex', sessionKey: `s-${i}` });
    }
    const emitted = [];
    const tmuxCalls = [];
    const router = createCommandRouter({
      store,
      tmux: {
        sessionExists: async () => false,
        newSession: async (opts) => { tmuxCalls.push(opts); },
        sendKeys: async () => {},
      },
      keymap: {
        'claude-code': { accept: ['y'], reject: ['n'] },
        codex: { accept: ['y'], reject: ['n'] },
      },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp',
      maxSlots: 6,
      attachPty: () => {},
      emit: (msg) => emitted.push(msg),
    });
    await router.handleCommand(cmd(6, 'new_session'));
    assert.equal(tmuxCalls.length, 0);
    assert.ok(emitted.some((m) => m.type === 'error' && /6|slot/i.test(m.message)));
  });

  it('focus updates focusedSlotId and broadcasts state (no tmux, lights unchanged)', async () => {
    const { router, store, tmuxCalls, emitted } = makeFakes();
    const before = store.snapshot().map((s) => s.state);
    await router.handleCommand(cmd(1, 'focus'));
    assert.equal(router.getFocusedSlotId(), 1);
    assert.equal(tmuxCalls.length, 0);
    assert.deepEqual(store.snapshot().map((s) => s.state), before);
    const stateMsg = emitted.find((m) => m.type === 'state');
    assert.ok(stateMsg);
    assert.equal(stateMsg.focusedSlotId, 1);
    assert.deepEqual(stateMsg.slots, store.snapshot());
  });

  it('accept on unbound slot emits error without changing other lights', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.bindSlot({ slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0' });
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 'cms-claude-0',
      state: 'idle', ts: new Date().toISOString(), source: 'cc-hooks',
    });
    const emitted = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async () => {}, sendKeys: async () => {} },
      keymap: { 'claude-code': { accept: ['y'], reject: ['n'] }, codex: { accept: ['y'], reject: ['n'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp',
      attachPty: () => {},
      emit: (msg) => emitted.push(msg),
    });
    await router.handleCommand(cmd(3, 'accept'));
    assert.equal(store.snapshot()[0].state, 'idle');
    assert.ok(emitted.some((m) => m.type === 'error'));
  });
});
