import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyKey, createCmuxClient } from './client.js';

describe('classifyKey', () => {
  it('printable single chars go through `send` as text', () => {
    assert.deepEqual(classifyKey('1'), { sub: 'send', arg: '1' });
    assert.deepEqual(classifyKey('y'), { sub: 'send', arg: 'y' });
    assert.deepEqual(classifyKey('n'), { sub: 'send', arg: 'n' });
  });

  it('named keys go through `send-key`, lowercased', () => {
    assert.deepEqual(classifyKey('Escape'), { sub: 'send-key', arg: 'escape' });
    assert.deepEqual(classifyKey('Enter'), { sub: 'send-key', arg: 'enter' });
    assert.deepEqual(classifyKey('Tab'), { sub: 'send-key', arg: 'tab' });
  });

  it('empty/invalid token → null', () => {
    assert.equal(classifyKey(''), null);
    assert.equal(classifyKey(undefined), null);
  });
});

describe('createCmuxClient.sendKeys', () => {
  it('translates a mixed key sequence into the right cmux subcommands + surface', async () => {
    const calls = [];
    const cmux = createCmuxClient({
      bin: '/bin/cmux',
      run: async (argv) => { calls.push(argv); return { stdout: '', stderr: '', code: 0 }; },
    });
    await cmux.sendKeys('SURFACE-UUID', ['1', 'Enter']);
    assert.deepEqual(calls, [
      ['/bin/cmux', 'send', '--surface', 'SURFACE-UUID', '--', '1'],
      ['/bin/cmux', 'send-key', '--surface', 'SURFACE-UUID', '--', 'enter'],
    ]);
  });

  it('escape (reject) uses send-key escape', async () => {
    const calls = [];
    const cmux = createCmuxClient({
      bin: 'cmux',
      run: async (argv) => { calls.push(argv); return { stdout: '', stderr: '', code: 0 }; },
    });
    await cmux.sendKeys('S', ['Escape']);
    assert.deepEqual(calls, [['cmux', 'send-key', '--surface', 'S', '--', 'escape']]);
  });

  it('non-zero exit throws with surface + stderr context', async () => {
    const cmux = createCmuxClient({
      bin: 'cmux',
      run: async () => ({ stdout: '', stderr: 'surface not found', code: 1 }),
    });
    await assert.rejects(() => cmux.sendKeys('S', ['1']), /surface not found/);
  });
});
