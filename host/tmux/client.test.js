import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTmuxClient,
  TmuxNotFoundError,
} from './client.js';

describe('createTmuxClient', () => {
  it('ensureTmux throws TmuxNotFoundError when tmux missing', async () => {
    const client = createTmuxClient({
      run: async () => ({ stdout: '', code: 1 }),
    });
    await assert.rejects(
      () => client.ensureTmux(),
      (err) => err instanceof TmuxNotFoundError,
    );
  });

  it('ensureTmux succeeds when which finds tmux', async () => {
    const calls = [];
    const client = createTmuxClient({
      run: async (argv) => {
        calls.push(argv);
        return { stdout: '/usr/bin/tmux\n', code: 0 };
      },
    });
    await client.ensureTmux();
    assert.deepEqual(calls, [['which', 'tmux']]);
  });

  it('sendKeys emits correct argv per key; Enter without --', async () => {
    const calls = [];
    const client = createTmuxClient({
      run: async (argv) => {
        calls.push(argv);
        return { stdout: '', code: 0 };
      },
    });
    await client.sendKeys('cms-claude-0', ['y', 'Enter']);
    assert.deepEqual(calls, [
      ['tmux', 'send-keys', '-t', 'cms-claude-0', '--', 'y'],
      ['tmux', 'send-keys', '-t', 'cms-claude-0', 'Enter'],
    ]);
  });

  it('sessionExists reflects tmux has-session exit code', async () => {
    const client = createTmuxClient({
      run: async (argv) => ({
        stdout: '',
        code: argv[0] === 'tmux' && argv.includes('exists') ? 0 : 1,
      }),
    });
    assert.equal(await client.sessionExists('exists'), true);
    assert.equal(await client.sessionExists('missing'), false);
  });

  it('newSession creates detached session with cwd and command', async () => {
    const calls = [];
    const client = createTmuxClient({
      run: async (argv) => {
        calls.push(argv);
        return { stdout: '', code: 0 };
      },
    });
    await client.newSession({
      name: 'cms-codex-1',
      cwd: '/tmp/work',
      command: 'codex',
    });
    assert.deepEqual(calls, [
      ['tmux', 'new-session', '-d', '-s', 'cms-codex-1', '-c', '/tmp/work', 'codex'],
    ]);
  });

  it('killSession invokes tmux kill-session', async () => {
    const calls = [];
    const client = createTmuxClient({
      run: async (argv) => {
        calls.push(argv);
        return { stdout: '', code: 0 };
      },
    });
    await client.killSession('cms-claude-0');
    assert.deepEqual(calls, [['tmux', 'kill-session', '-t', 'cms-claude-0']]);
  });

  it('exports no pane-capture or pane-parse helpers', async () => {
    const mod = await import('./client.js');
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
    const client = createTmuxClient({ run: async () => ({ stdout: '', code: 0 }) });
    for (const name of forbidden) {
      assert.equal(name in client, false, `client must not expose ${name}`);
    }
  });
});
