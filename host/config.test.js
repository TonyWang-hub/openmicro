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
});
