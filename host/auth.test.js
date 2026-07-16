import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth, isLoopbackAddress } from './auth.js';

function req({ remoteAddress, url = '/', headers = {} }) {
  return { socket: { remoteAddress }, url, headers };
}

describe('isLoopbackAddress', () => {
  it('recognizes 127.0.0.1, ::1 and ::ffff:127.0.0.1', () => {
    assert.equal(isLoopbackAddress('127.0.0.1'), true);
    assert.equal(isLoopbackAddress('::1'), true);
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  });

  it('rejects LAN/other addresses', () => {
    assert.equal(isLoopbackAddress('192.168.1.5'), false);
    assert.equal(isLoopbackAddress(undefined), false);
  });
});

describe('createAuth.check', () => {
  it('exempts loopback regardless of token', () => {
    const auth = createAuth({ token: 'secret' });
    assert.equal(auth.check(req({ remoteAddress: '127.0.0.1' })), true);
    assert.equal(auth.check(req({ remoteAddress: '::1' })), true);
    assert.equal(auth.check(req({ remoteAddress: '::ffff:127.0.0.1' })), true);
  });

  it('rejects non-loopback with no token provided', () => {
    const auth = createAuth({ token: 'secret' });
    assert.equal(auth.check(req({ remoteAddress: '10.0.0.5', url: '/m' })), false);
  });

  it('rejects non-loopback with wrong token', () => {
    const auth = createAuth({ token: 'secret' });
    assert.equal(auth.check(req({ remoteAddress: '10.0.0.5', url: '/m?token=nope' })), false);
  });

  it('accepts non-loopback with correct token via query', () => {
    const auth = createAuth({ token: 'secret' });
    assert.equal(auth.check(req({ remoteAddress: '10.0.0.5', url: '/m?token=secret' })), true);
  });

  it('accepts non-loopback with correct token via x-cms-token header', () => {
    const auth = createAuth({ token: 'secret' });
    assert.equal(
      auth.check(req({ remoteAddress: '10.0.0.5', url: '/m', headers: { 'x-cms-token': 'secret' } })),
      true,
    );
  });

  it('does not throw on mismatched token length (constant-time compare)', () => {
    const auth = createAuth({ token: 'secret' });
    assert.doesNotThrow(() => {
      auth.check(req({ remoteAddress: '10.0.0.5', url: '/m?token=short' }));
      auth.check(req({ remoteAddress: '10.0.0.5', url: '/m?token=way-longer-than-secret' }));
    });
  });

  it('rejects all non-loopback traffic when no token is configured', () => {
    const auth = createAuth({ token: null });
    assert.equal(auth.check(req({ remoteAddress: '10.0.0.5', url: '/m?token=anything' })), false);
  });
});
