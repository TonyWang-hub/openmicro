import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPtySession } from './pty-session.js';

/**
 * @returns {{ pty: object, spawnCalls: unknown[][], killed: boolean, emitData: (d: string) => void, emitExit: (code?: number, signal?: string) => void }}
 */
function createMockSpawn() {
  const spawnCalls = [];
  /** @type {Map<string, Set<(payload?: unknown) => void>>} */
  const listeners = new Map();
  let killed = false;

  const pty = {
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
    },
    write(data) {
      this.lastWrite = data;
    },
    resize(cols, rows) {
      this.lastResize = { cols, rows };
    },
    kill() {
      killed = true;
    },
  };

  const spawn = (cmd, args, opts) => {
    spawnCalls.push([cmd, args, opts]);
    return pty;
  };

  return {
    spawn,
    pty,
    spawnCalls,
    get killed() {
      return killed;
    },
    emitData(data) {
      for (const handler of listeners.get('data') ?? []) handler(data);
    },
    emitExit(code = 0, signal) {
      for (const handler of listeners.get('exit') ?? []) handler(code, signal);
    },
  };
}

describe('createPtySession', () => {
  it('spawns tmux attach with xterm-256color', () => {
    const mock = createMockSpawn();
    createPtySession({
      sessionKey: 'cms-claude-0',
      onData: () => {},
      onExit: () => {},
      spawn: mock.spawn,
    });

    assert.deepEqual(mock.spawnCalls, [
      ['tmux', ['attach', '-t', 'cms-claude-0'], { name: 'xterm-256color' }],
    ]);
  });

  it('write passthrough to pty', () => {
    const mock = createMockSpawn();
    const session = createPtySession({
      sessionKey: 'cms-codex-1',
      onData: () => {},
      onExit: () => {},
      spawn: mock.spawn,
    });

    session.write('hello');
    assert.equal(mock.pty.lastWrite, 'hello');
  });

  it('resize forwards cols and rows to pty', () => {
    const mock = createMockSpawn();
    const session = createPtySession({
      sessionKey: 'cms-codex-1',
      onData: () => {},
      onExit: () => {},
      spawn: mock.spawn,
    });

    session.resize(120, 40);
    assert.deepEqual(mock.pty.lastResize, { cols: 120, rows: 40 });
  });

  it('forwards pty data and exit to callbacks', () => {
    const mock = createMockSpawn();
    const dataChunks = [];
    let exitArgs = null;

    createPtySession({
      sessionKey: 'cms-claude-0',
      onData: (chunk) => dataChunks.push(chunk),
      onExit: (code, signal) => { exitArgs = { code, signal }; },
      spawn: mock.spawn,
    });

    mock.emitData('output');
    mock.emitExit(1, 'SIGHUP');

    assert.deepEqual(dataChunks, ['output']);
    assert.deepEqual(exitArgs, { code: 1, signal: 'SIGHUP' });
  });

  it('dispose kills the pty process', () => {
    const mock = createMockSpawn();
    const session = createPtySession({
      sessionKey: 'cms-claude-0',
      onData: () => {},
      onExit: () => {},
      spawn: mock.spawn,
    });

    assert.equal(mock.killed, false);
    session.dispose();
    assert.equal(mock.killed, true);
  });

  it('exports no capture-pane or pane-parse helpers', async () => {
    const mod = await import('./pty-session.js');
    const forbidden = [
      'capturePaneState',
      'capturePane',
      'parsePaneState',
      'parsePaneText',
      'getPaneText',
      'readPane',
    ];
    for (const name of forbidden) {
      assert.equal(name in mod, false, `must not export ${name}`);
    }
  });
});
