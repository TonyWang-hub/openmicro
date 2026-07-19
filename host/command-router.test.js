import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from './state/agent-state-store.js';
import { createCommandRouter } from './command-router.js';

function makeFakes() {
  const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
  // Sessions auto-assigned with a tmuxTarget (the injectable pane name).
  store.resolveSession({ sessionKey: 'sess-claude', agent: 'claude-code', label: 'projA', tmuxTarget: 'cms-claude-0' });
  store.resolveSession({ sessionKey: 'sess-codex', agent: 'codex', label: 'projB', tmuxTarget: 'cms-codex-1' });

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

  it('prefers cmux injection when the slot has a cmuxTarget', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.resolveSession({ sessionKey: 's', agent: 'claude-code', label: 'p', cmuxTarget: 'SURFACE-UUID', tmuxTarget: 'tmux-name' });
    const tmuxCalls = []; const cmuxCalls = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => true, newSession: async () => {}, sendKeys: async (n, k) => tmuxCalls.push([n, k]) },
      cmux: { sendKeys: async (ref, keys) => cmuxCalls.push([ref, keys]) },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp', attachPty: () => {}, emit: () => {},
    });
    await router.handleCommand(cmd(0, 'accept'));
    assert.deepEqual(cmuxCalls, [['SURFACE-UUID', ['1']]]);
    assert.deepEqual(tmuxCalls, [], 'must NOT fall back to tmux when cmux target exists');
  });

  it('sendKeys failure emits error+log and does not change lights', async () => {
    const { store, emitted, router } = makeFakes();
    store.applyEvent({
      v: 1, slotId: 0, agent: 'claude-code', sessionKey: 'sess-claude',
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

  it('new_session spawns a fresh claude in the default cwd (no slot needed)', async () => {
    const { router, tmuxCalls } = makeFakes();
    await router.handleCommand({ v: 1, action: 'new_session', ts: new Date().toISOString() });
    const spawn = tmuxCalls.find((c) => c[0] === 'newSession');
    assert.ok(spawn, 'should spawn via tmux.newSession when no cmux');
    assert.equal(spawn[1].cwd, '/tmp/work');
    assert.equal(spawn[1].command, 'claude');
  });

  it('branch spawns a fresh session in the selected slot\'s project cwd', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.resolveSession({ sessionKey: 's', agent: 'claude-code', label: 'proj', cwd: '/home/me/proj', tmuxTarget: 't' });
    const tmuxCalls = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async (o) => tmuxCalls.push(o), sendKeys: async () => {} },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp', attachPty: () => {}, emit: () => {},
    });
    await router.handleCommand(cmd(0, 'branch'));
    assert.equal(tmuxCalls.length, 1);
    assert.equal(tmuxCalls[0].cwd, '/home/me/proj');
    assert.equal(tmuxCalls[0].command, 'claude');
  });

  it('branch prefers cmux.createSession when cmux is available', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.resolveSession({ sessionKey: 's', agent: 'claude-code', label: 'proj', cwd: '/home/me/proj', cmuxTarget: 'SURF' });
    const cmuxCalls = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async () => {}, sendKeys: async () => {} },
      cmux: { sendKeys: async () => {}, sendText: async () => {}, createSession: async (o) => cmuxCalls.push(o) },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp', attachPty: () => {}, emit: () => {},
    });
    await router.handleCommand(cmd(0, 'branch'));
    assert.deepEqual(cmuxCalls, [{ cwd: '/home/me/proj', command: 'claude' }]);
  });

  it('prompt injects the spoken text + Enter into the focused cmux surface', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.resolveSession({ sessionKey: 's', agent: 'claude-code', label: 'proj', cmuxTarget: 'SURF' });
    const textCalls = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async () => {}, sendKeys: async () => {} },
      cmux: { sendKeys: async () => {}, sendText: async (ref, text) => textCalls.push([ref, text]), createSession: async () => {} },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp', attachPty: () => {}, emit: () => {},
    });
    await router.handleCommand({ v: 1, slotId: 0, action: 'prompt', text: '创建 x.txt', ts: new Date().toISOString() });
    assert.deepEqual(textCalls, [['SURF', '创建 x.txt']]);
  });

  it('prompt with empty text does not inject', async () => {
    const store = createStore({ completeHoldMs: 2000, ingestStaleMs: 30_000 });
    store.resolveSession({ sessionKey: 's', agent: 'claude-code', label: 'proj', cmuxTarget: 'SURF' });
    const textCalls = [];
    const router = createCommandRouter({
      store,
      tmux: { sessionExists: async () => false, newSession: async () => {}, sendKeys: async () => {} },
      cmux: { sendKeys: async () => {}, sendText: async (ref, text) => textCalls.push([ref, text]), createSession: async () => {} },
      keymap: { 'claude-code': { accept: ['1'], reject: ['Escape'] }, codex: { accept: ['y'], reject: ['Escape'] } },
      commands: { 'claude-code': 'claude', codex: 'codex' },
      defaultCwd: '/tmp', attachPty: () => {}, emit: () => {},
    });
    await router.handleCommand({ v: 1, slotId: 0, action: 'prompt', text: '  ', ts: new Date().toISOString() });
    assert.deepEqual(textCalls, []);
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
