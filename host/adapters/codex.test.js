import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapCodexHook, mapCodexLegacyNotify, mapCodexAppServerStatus,
} from './codex.js';

const b = { slotId: 1, agent: 'codex', sessionKey: 'cms-codex-1' };

describe('mapCodexHook', () => {
  it('hooks PermissionRequest → needs_input', () => {
    const e = mapCodexHook({ hookEventName: 'PermissionRequest' }, b);
    assert.equal(e.state, 'needs_input');
    assert.equal(e.source, 'codex-hooks');
  });

  it('maps SessionStart to idle', () => {
    assert.equal(mapCodexHook({ hookEventName: 'SessionStart' }, b).state, 'idle');
  });

  it('maps PreToolUse to thinking', () => {
    assert.equal(mapCodexHook({ hookEventName: 'PreToolUse' }, b).state, 'thinking');
  });

  it('maps Stop to complete', () => {
    assert.equal(mapCodexHook({ hookEventName: 'Stop' }, b).state, 'complete');
  });

  it('maps StopFailure to error', () => {
    assert.equal(mapCodexHook({ hookEventName: 'StopFailure' }, b).state, 'error');
  });

  it('returns null for unknown hook events', () => {
    assert.equal(mapCodexHook({ hookEventName: 'Unknown' }, b), null);
  });

  it('accepts official snake_case stdin (hook_event_name)', () => {
    const e = mapCodexHook({ hook_event_name: 'PermissionRequest' }, b);
    assert.equal(e.state, 'needs_input');
    assert.equal(e.source, 'codex-hooks');
  });

  it('accepts snake_case Notification + notification_type', () => {
    const e = mapCodexHook({
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
    }, b);
    assert.equal(e.state, 'needs_input');
  });
});

describe('mapCodexLegacyNotify', () => {
  it('legacy notify agent-turn-complete → complete', () => {
    const e = mapCodexLegacyNotify({ type: 'agent-turn-complete' }, b);
    assert.equal(e.state, 'complete');
    assert.equal(e.source, 'codex-notify-legacy');
  });

  it('returns null for unknown notify types', () => {
    assert.equal(mapCodexLegacyNotify({ type: 'other' }, b), null);
  });
});

describe('mapCodexAppServerStatus', () => {
  it('app-server running → thinking', () => {
    const e = mapCodexAppServerStatus({ state: 'running' }, b);
    assert.equal(e.state, 'thinking');
    assert.equal(e.source, 'codex-app-server');
  });

  it('app-server awaiting_approval → needs_input', () => {
    const e = mapCodexAppServerStatus({ state: 'awaiting_approval' }, b);
    assert.equal(e.state, 'needs_input');
    assert.equal(e.source, 'codex-app-server');
  });

  it('app-server succeeded → complete', () => {
    assert.equal(mapCodexAppServerStatus({ state: 'succeeded' }, b).state, 'complete');
  });

  it('app-server failed → error', () => {
    assert.equal(mapCodexAppServerStatus({ state: 'failed' }, b).state, 'error');
  });

  it('app-server cancelled → error', () => {
    assert.equal(mapCodexAppServerStatus({ state: 'cancelled' }, b).state, 'error');
  });

  it('returns null for unknown app-server states', () => {
    assert.equal(mapCodexAppServerStatus({ state: 'pending' }, b), null);
  });
});
