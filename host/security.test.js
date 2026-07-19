import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRateLimiter,
  isOriginAllowed,
  parseAllowedOrigins,
  isNonLoopbackHost,
} from './security.js';

function req({ remoteAddress, headers = {} }) {
  return { socket: { remoteAddress }, headers };
}

describe('createRateLimiter', () => {
  it('allows requests under the window max', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
    assert.equal(limiter.allow('1.2.3.4'), true);
    assert.equal(limiter.allow('1.2.3.4'), true);
    assert.equal(limiter.allow('1.2.3.4'), true);
  });

  it('rejects once the max is exceeded within the window', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    assert.equal(limiter.allow('9.9.9.9'), true);
    assert.equal(limiter.allow('9.9.9.9'), true);
    assert.equal(limiter.allow('9.9.9.9'), false);
    assert.equal(limiter.allow('9.9.9.9'), false);
  });

  it('tracks each key independently', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    assert.equal(limiter.allow('a'), true);
    assert.equal(limiter.allow('b'), true);
    assert.equal(limiter.allow('a'), false);
    assert.equal(limiter.allow('b'), false);
  });

  it('allows again once the window slides past old hits', (t) => {
    t.mock.timers.enable({ apis: ['Date'] });
    const limiter = createRateLimiter({ windowMs: 100, max: 1 });
    assert.equal(limiter.allow('slider'), true);
    assert.equal(limiter.allow('slider'), false);
    t.mock.timers.tick(150);
    assert.equal(limiter.allow('slider'), true);
  });

  it('fails open (always allows) when the key is falsy/unattributable', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    assert.equal(limiter.allow(undefined), true);
    assert.equal(limiter.allow(undefined), true);
    assert.equal(limiter.allow(null), true);
    assert.equal(limiter.allow(''), true);
  });

  it('is disabled (always allows) when max <= 0 (opt-out switch)', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 0 });
    for (let i = 0; i < 50; i++) {
      assert.equal(limiter.allow('same-ip'), true);
    }
  });

  it('reset() clears all tracked keys', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    assert.equal(limiter.allow('k'), true);
    assert.equal(limiter.allow('k'), false);
    limiter.reset();
    assert.equal(limiter.allow('k'), true);
  });
});

describe('parseAllowedOrigins', () => {
  it('returns an empty list for unset/empty input (unrestricted default)', () => {
    assert.deepEqual(parseAllowedOrigins(undefined), []);
    assert.deepEqual(parseAllowedOrigins(''), []);
  });

  it('splits, trims and drops empty entries from a comma-separated list', () => {
    assert.deepEqual(
      parseAllowedOrigins(' http://192.168.1.5:7788 ,http://localhost:7788,,'),
      ['http://192.168.1.5:7788', 'http://localhost:7788'],
    );
  });
});

describe('isNonLoopbackHost', () => {
  it('treats 127.0.0.1/localhost/::1 as loopback', () => {
    assert.equal(isNonLoopbackHost('127.0.0.1'), false);
    assert.equal(isNonLoopbackHost('localhost'), false);
    assert.equal(isNonLoopbackHost('::1'), false);
  });

  it('treats 0.0.0.0 and LAN IPs as non-loopback', () => {
    assert.equal(isNonLoopbackHost('0.0.0.0'), true);
    assert.equal(isNonLoopbackHost('192.168.1.5'), true);
  });
});

describe('isOriginAllowed', () => {
  it('allows everything when the allowlist is empty (default, unrestricted)', () => {
    assert.equal(
      isOriginAllowed(req({ remoteAddress: '10.0.0.5', headers: { origin: 'http://evil.example' } }), []),
      true,
    );
    assert.equal(isOriginAllowed(req({ remoteAddress: '10.0.0.5' }), []), true);
  });

  it('exempts loopback requests regardless of Origin header', () => {
    const allowed = ['http://192.168.1.5:7788'];
    assert.equal(
      isOriginAllowed(req({ remoteAddress: '127.0.0.1', headers: { origin: 'http://evil.example' } }), allowed),
      true,
    );
    assert.equal(isOriginAllowed(req({ remoteAddress: '::1' }), allowed), true);
  });

  it('accepts a non-loopback request whose Origin matches the allowlist', () => {
    const allowed = ['http://192.168.1.5:7788'];
    assert.equal(
      isOriginAllowed(req({ remoteAddress: '192.168.1.9', headers: { origin: 'http://192.168.1.5:7788' } }), allowed),
      true,
    );
  });

  it('rejects a non-loopback request whose Origin does not match', () => {
    const allowed = ['http://192.168.1.5:7788'];
    assert.equal(
      isOriginAllowed(req({ remoteAddress: '192.168.1.9', headers: { origin: 'http://evil.example' } }), allowed),
      false,
    );
  });

  it('rejects a non-loopback request with no Origin header once the allowlist is non-empty', () => {
    const allowed = ['http://192.168.1.5:7788'];
    assert.equal(isOriginAllowed(req({ remoteAddress: '192.168.1.9' }), allowed), false);
  });
});
