import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('defaults host to loopback 127.0.0.1', () => {
    const cfg = loadConfig({});
    assert.equal(cfg.host, '127.0.0.1');
    assert.equal(cfg.port, 7788);
  });

  it('allows CMS_HOST override', () => {
    const cfg = loadConfig({ CMS_HOST: '0.0.0.0', CMS_PORT: '9000' });
    assert.equal(cfg.host, '0.0.0.0');
    assert.equal(cfg.port, 9000);
  });

  it('defaults token to null when CMS_TOKEN is unset', () => {
    const cfg = loadConfig({});
    assert.equal(cfg.token, null);
  });

  it('allows CMS_TOKEN override', () => {
    const cfg = loadConfig({ CMS_TOKEN: 'abc123' });
    assert.equal(cfg.token, 'abc123');
  });

  it('defaults keymap to verified values: claude-code 1/Escape, codex y/Escape', () => {
    const cfg = loadConfig({});
    assert.deepEqual(cfg.keymap, {
      'claude-code': { accept: ['1'], reject: ['Escape'] },
      codex: { accept: ['y'], reject: ['Escape'] },
    });
  });

  it('deep-merges CMS_KEYMAP JSON override onto defaults', () => {
    const cfg = loadConfig({ CMS_KEYMAP: '{"claude-code":{"accept":["2"]}}' });
    assert.deepEqual(cfg.keymap, {
      'claude-code': { accept: ['2'], reject: ['Escape'] },
      codex: { accept: ['y'], reject: ['Escape'] },
    });
  });

  it('falls back to default keymap and warns when CMS_KEYMAP is invalid JSON', () => {
    const originalWarn = console.warn;
    const warnCalls = [];
    console.warn = (...args) => warnCalls.push(args);
    try {
      const cfg = loadConfig({ CMS_KEYMAP: '{not valid json' });
      assert.deepEqual(cfg.keymap, {
        'claude-code': { accept: ['1'], reject: ['Escape'] },
        codex: { accept: ['y'], reject: ['Escape'] },
      });
      assert.equal(warnCalls.length, 1);
    } finally {
      console.warn = originalWarn;
    }
  });
});
