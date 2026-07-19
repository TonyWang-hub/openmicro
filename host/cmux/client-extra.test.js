import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyKey, createCmuxClient } from './client.js';

describe('classifyKey — extra boundaries', () => {
  it('multi-char unknown token falls back to send-key, lowercased', () => {
    assert.deepEqual(classifyKey('FooBar'), { sub: 'send-key', arg: 'foobar' });
    assert.deepEqual(classifyKey('PAGEUP'), { sub: 'send-key', arg: 'pageup' });
  });

  it('uppercase single-char printable still classified as send (case preserved in arg)', () => {
    assert.deepEqual(classifyKey('Y'), { sub: 'send', arg: 'Y' });
  });

  it('named key uppercase/mixed-case all lowercase to the same arg', () => {
    assert.deepEqual(classifyKey('HOME'), { sub: 'send-key', arg: 'home' });
    assert.deepEqual(classifyKey('End'), { sub: 'send-key', arg: 'end' });
  });

  it('empty string and non-string inputs → null', () => {
    assert.equal(classifyKey(''), null);
    assert.equal(classifyKey(null), null);
    assert.equal(classifyKey(123), null);
  });
});

describe('createCmuxClient.sendText', () => {
  it('sends the text via `send`, then Enter via `send-key`, in order', async () => {
    const calls = [];
    const cmux = createCmuxClient({
      bin: '/bin/cmux',
      run: async (argv) => { calls.push(argv); return { stdout: '', stderr: '', code: 0 }; },
    });
    await cmux.sendText('SURF', '创建 x.txt');
    assert.deepEqual(calls, [
      ['/bin/cmux', 'send', '--surface', 'SURF', '--', '创建 x.txt'],
      ['/bin/cmux', 'send-key', '--surface', 'SURF', '--', 'enter'],
    ]);
  });

  it('throws when the `send` (text) step fails, without attempting Enter', async () => {
    const calls = [];
    const cmux = createCmuxClient({
      bin: 'cmux',
      run: async (argv) => {
        calls.push(argv);
        return { stdout: '', stderr: 'surface not found', code: 1 };
      },
    });
    await assert.rejects(() => cmux.sendText('SURF', 'hi'), /surface not found/);
    assert.equal(calls.length, 1, 'must not attempt the Enter send-key after the text send failed');
  });

  it('throws when the Enter send-key step fails after a successful text send', async () => {
    const calls = [];
    const cmux = createCmuxClient({
      bin: 'cmux',
      run: async (argv) => {
        calls.push(argv);
        if (argv[1] === 'send-key') return { stdout: '', stderr: 'no such pane', code: 1 };
        return { stdout: '', stderr: '', code: 0 };
      },
    });
    await assert.rejects(() => cmux.sendText('SURF', 'hi'), /no such pane/);
    assert.equal(calls.length, 2, 'text send must have been attempted before the enter failure');
  });
});

describe('createCmuxClient.createSession', () => {
  it('builds the workspace create argv with cwd/command/default name', async () => {
    const calls = [];
    const cmux = createCmuxClient({
      bin: '/bin/cmux',
      run: async (argv) => { calls.push(argv); return { stdout: '', stderr: '', code: 0 }; },
    });
    await cmux.createSession({ cwd: '/home/me/proj', command: 'claude' });
    assert.deepEqual(calls, [
      ['/bin/cmux', 'workspace', 'create', '--name', 'cms-new', '--cwd', '/home/me/proj', '--command', 'claude'],
    ]);
  });

  it('honors an explicit name and throws with context on failure', async () => {
    const calls = [];
    const cmux = createCmuxClient({
      bin: 'cmux',
      run: async (argv) => { calls.push(argv); return { stdout: '', stderr: 'boom', code: 1 }; },
    });
    await assert.rejects(() => cmux.createSession({ cwd: '/tmp', command: 'codex', name: 'custom' }), /boom/);
    assert.deepEqual(calls, [['cmux', 'workspace', 'create', '--name', 'custom', '--cwd', '/tmp', '--command', 'codex']]);
  });
});

describe('createCmuxClient.sendKeys — mid-sequence failure', () => {
  it('stops and throws with surface context when a later key in the sequence fails', async () => {
    const calls = [];
    const cmux = createCmuxClient({
      bin: 'cmux',
      run: async (argv) => {
        calls.push(argv);
        // First key ('1') succeeds, second ('Enter') fails.
        if (argv.includes('enter')) return { stdout: '', stderr: 'unknown surface', code: 1 };
        return { stdout: '', stderr: '', code: 0 };
      },
    });
    await assert.rejects(
      () => cmux.sendKeys('SURFACE-42', ['1', 'Enter', 'Escape']),
      /surface SURFACE-42.*unknown surface/,
    );
    // Only the first two keys were attempted; the third never ran.
    assert.equal(calls.length, 2);
  });
});
